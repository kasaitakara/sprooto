import {
  STEP_COUNT,
  tracks,
  state,
  clamp,
  undo,
  redo,
  canUndo,
  canRedo,
  beginSelectedPlayback,
advancePlaybackSource,
clearQueuedSource,
resolveStepSound
} from "./sequencer.js";

import {
  initializeAudio,
  playTrackStep,
  setMasterVolume,
  resumeAudio
} from "./audio.js";

import {
  render,
  updatePlayingStep,
  renderPatternManager,
  renderSongMode,
  refreshMasterMixMeterColor
} from "./ui.js";

import {
  initializeAutosave,
  restoreAutosave,
  scheduleAutosave
} from "./storage.js";

import "./keyboard-navigation.js";

let timer = null;
let nextTickTime = 0;
/* =========================
 * Screen Wake Lock
 * 再生中だけ画面スリープを抑止
 * ========================= */

let screenWakeLock = null;

async function requestScreenWakeLock() {
  if (
    !("wakeLock" in navigator) ||
    document.visibilityState !== "visible" ||
    !state.isPlaying
  ) {
    return;
  }

  // すでに取得済みなら重複取得しない
  if (
    screenWakeLock &&
    !screenWakeLock.released
  ) {
    return;
  }

  try {
    screenWakeLock =
      await navigator.wakeLock.request(
        "screen"
      );

    screenWakeLock.addEventListener(
      "release",
      () => {
        screenWakeLock = null;
      },
      { once: true }
    );
  } catch (error) {
    // Wake Lockが使えなくても
    // sprootoの再生自体は止めない
    screenWakeLock = null;

    console.warn(
      "Screen Wake Lock unavailable:",
      error
    );
  }
}

async function releaseScreenWakeLock() {
  const lock = screenWakeLock;

  screenWakeLock = null;

  if (!lock) {
    return;
  }

  try {
    await lock.release();
  } catch {
    // すでに解除済みなら何もしない
  }
}
/*
 * 発音時刻より少し前にtickを実行し、
 * Web Audioへ先行予約する。
 *
 * BPM 300の16分音符が50ms間隔なので、
 * それを超えない45msとする。
 */
const AUDIO_LOOKAHEAD_MS = 45;

/*
 * Audio先読み時間。
 *
 * UI / VS / ブラウザ切替などでMain Threadが一瞬止まっても、
 * すでにWeb Audioへ予約済みの音は正確な時刻で鳴る。
 *
 * ただしPattern / Fill / Section / SongのSource境界は越えて
 * 先読みしない。リアルタイム編集や予約切替への追従性を
 * 保つため、先読みは最大250msに限定する。
 */
const AUDIO_PREBUFFER_MS = 250;

/*
 * 現在Source内で、どの連続Playback Tickまで
 * Audio予約済みかを保持する。
 *
 * Source切替時は0起点へ戻るため、そこでリセットする。
 */
let audioScheduledThroughTick = null;

const playButton = document.getElementById("play-button");

const PERF_MAIN_DEBUG = false;
function perfMainLog(label, startedAt, detail = {}) {
  if (!PERF_MAIN_DEBUG) return;
  const ms = performance.now() - startedAt;
  if (ms >= 0.5) {
    console.log(`[PERF ${label}]`, { ms: Number(ms.toFixed(3)), ...detail });
  }
}

const bpmInput = document.getElementById("bpm-input");
const volumeInput = document.getElementById("master-volume");
const volumeValue = document.getElementById("master-volume-value");
const themeSelector = document.getElementById("theme-selector");
const themeButton = document.getElementById("theme-button");
const undoButton = document.getElementById("undo-button");
const redoButton = document.getElementById("redo-button");

function updateHistoryButtons() {
  undoButton.disabled = !canUndo();
  redoButton.disabled = !canRedo();
}

function preserveFocusDuringRender() {
  const activeElement =
    document.activeElement;

  const focusKey =
    activeElement?.dataset
      ?.focusKey;

  render();

  if (!focusKey) {
    return;
  }

  const nextElement =
    document.querySelector(
      `[data-focus-key="${focusKey}"]`
    );

  if (!nextElement) {
    return;
  }

  nextElement.focus({
    preventScroll: true
  });
}

window.addEventListener(
  "historychange",
  updateHistoryButtons
);

window.addEventListener(
  "projectchange",
  () => {
    /*
     * Project切替後は必ず停止表示へ戻す。
     * restore側でstate.isPlayingがfalseになっていても、
     * play buttonのCSS classはDOM側に残るため明示的に解除する。
     */
    playButton.classList.remove(
      "playing"
    );

    setMasterVolumeValue(
      Number(volumeInput.value)
    );

    updateHistoryButtons();
  }
);

function duration() {
  return 60000 / clamp(Number(bpmInput.value) || 120, 40, 300) / 4;
}

function scheduleNextTick() {
  nextTickTime += duration();

  /*
   * 実際の発音予定時刻より
   * AUDIO_LOOKAHEAD_MSだけ早く
   * tickを実行する。
   */
  const delay = Math.max(
    0,
    nextTickTime -
      performance.now() -
      AUDIO_LOOKAHEAD_MS
  );

  timer = setTimeout(
    tick,
    delay
  );
}

function audible(track) {
  const hasSolo = tracks.some(item => item.solo);
  return !track.muted && (!hasSolo || track.solo);
}

const SUB_PATTERNS = Object.freeze([
  { divisions: 2, hits: [0, 1] },
  { divisions: 2, hits: [1] },
  { divisions: 3, hits: [0, 1, 2] },
  { divisions: 4, hits: [0, 1, 2, 3] },
  { divisions: 4, hits: [0, 2] },
  { divisions: 4, hits: [0, 1] },
  { divisions: 6, hits: [0, 1, 2, 3, 4, 5] }
]);

function resolvedSoundValue(soundTrack, track, stepIndex, id, min, max) {
  const usingPin = soundTrack !== track;
  const offset = usingPin
    ? 0
    : Number(track.offsets[id]?.[stepIndex]) || 0;

  return clamp(
    Number(soundTrack.base[id]) + offset,
    min,
    max
  );
}

function subVelocityScale(crescendo, hitIndex, hitCount) {
  const amount = clamp(Math.round(Number(crescendo) || 0), -3, 3);

  if (amount === 0 || hitCount <= 1) {
    return 1;
  }

  const progress = hitIndex / (hitCount - 1);
  const depth = Math.abs(amount) * 0.25;

  return amount > 0
    ? 1 - depth * (1 - progress)
    : 1 - depth * progress;
}

function scheduleSubStep(
  track,
  soundTrack,
  stepIndex,
  baseDelaySeconds
) {
  const patternIndex = Math.round(
    resolvedSoundValue(
      soundTrack,
      track,
      stepIndex,
      "subPattern",
      -1,
      6
    )
  );

  /*
   * SUB OFFなら通常発音。
   */
  if (patternIndex < 0) {
    playTrackStep(
      track,
      stepIndex,
      baseDelaySeconds
    );

    return;
  }

  const pattern =
    SUB_PATTERNS[patternIndex];

  if (!pattern) {
    playTrackStep(
      track,
      stepIndex,
      baseDelaySeconds
    );

    return;
  }

  const subProbability =
    resolvedSoundValue(
      soundTrack,
      track,
      stepIndex,
      "subProbability",
      0,
      100
    );

  const crescendo =
    resolvedSoundValue(
      soundTrack,
      track,
      stepIndex,
      "subCrescendo",
      -3,
      3
    );

  /*
   * SUB PROBは
   * 「SUBパターン全体が発動する確率」。
   *
   * 判定はStepごとに1回だけ行う。
   */
  const subTriggered =
    Math.random() * 100 <
    subProbability;

  /*
   * SUBが外れた場合は、
   * SUBなしの通常発音へ戻す。
   */
  if (!subTriggered) {
    playTrackStep(
      track,
      stepIndex,
      baseDelaySeconds
    );

    return;
  }

  /*
   * SUBが当たった場合は、
   * Pattern内の全Hitを必ず発音する。
   */
  const stepSeconds =
    duration() / 1000;

  pattern.hits.forEach(
    (subIndex, hitIndex) => {
      playTrackStep(
        track,
        stepIndex,
        baseDelaySeconds +
          stepSeconds *
            (
              subIndex /
              pattern.divisions
            ),
        {
          velocityScale:
            subVelocityScale(
              crescendo,
              hitIndex,
              pattern.hits.length
            )
        }
      );
    }
  );
}

function swingDelaySeconds(track, stepIndex) {
  /*
   * 1表示単位 = 0.25 T64。
   * 16分音符の裏側（2, 4, 6...番目）のみ前後へ動かす。
   *
   * マイナス値も安全に予約できるよう、
   * 全トラックへ最大前倒し量ぶんの共通待ち時間を置く。
   */
  const bpm =
    clamp(
      Number(bpmInput.value) || 120,
      40,
      300
    );

  const quarterSeconds =
    60 / bpm;

  const swingUnitSeconds =
    quarterSeconds / 64;

  /*
   * Swingは最大-8、nudgeは最大-4。
   * 両方が最速側へ加算されても未来予約できるよう、
   * 12単位ぶんを全Track共通の予約余白として置く。
   */
  const maximumAdvanceSeconds =
    swingUnitSeconds * 12;

  const swingValue =
    clamp(
      Number(track.swing) || 0,
      -8,
      8
    );

  const isOffbeat =
    stepIndex % 2 === 1;

  const nudgeValue =
  clamp(
    Math.round(
      (
        Number(
          track.base.nudge
        ) || 0
      ) +
      (
        Number(
          track.offsets.nudge?.[
            stepIndex
          ]
        ) || 0
      )
    ),
    -4,
    4
  );

  return (
    maximumAdvanceSeconds +
    (
      isOffbeat
        ? swingValue *
          swingUnitSeconds
        : 0
    ) +
    nudgeValue *
      swingUnitSeconds
  );
}

function playStepAtTick(
  playbackTickIndex,
  plannedPerformanceTime =
    performance.now()
) {
  const perfStartedAt = performance.now();
  /*
   * AudioContextへ渡す、
   * 現在から発音予定時刻までの待ち時間。
   */
  const scheduleDelaySeconds =
    Math.max(
      0,
      (
        plannedPerformanceTime -
        performance.now()
      ) / 1000
    );

  tracks.forEach(track => {
    const trackStepIndex =
      playbackTickIndex %
      track.stepLength;

    if (
      !audible(track) ||
      !track.steps[trackStepIndex]
    ) {
      return;
    }

    const soundTrack =
      resolveStepSound(
        track,
        trackStepIndex
      );

    const probability = clamp(
      (soundTrack.base.probability ?? 100) +
        (soundTrack.offsets.probability?.[
          trackStepIndex
        ] ?? 0),
      0,
      100
    );

    if (
      Math.random() * 100 <
      probability
    ) {
      scheduleSubStep(
        track,
        soundTrack,
        trackStepIndex,
        scheduleDelaySeconds +
          swingDelaySeconds(
            track,
            trackStepIndex
          )
      );
    }
  });

  perfMainLog(
    "PLAY_STEP_AT_TICK",
    perfStartedAt,
    {
      tick: playbackTickIndex,
      pattern:
        (
          state.playingPatternIndex ??
          state.selectedPatternIndex ??
          0
        ) + 1
    }
  );
}

/*
 * 現在位置から最大AUDIO_PREBUFFER_MS先まで、
 * 同じSource内のAudioだけをWeb Audioへ先行予約する。
 *
 * UI stateは進めないため、
 * 画面表示・編集位置・Pattern予約操作は従来どおり。
 *
 * Source境界は越えない。
 */
function scheduleAudioAhead(
  currentPlaybackTickIndex,
  currentPlayingStepIndex,
  currentPlannedPerformanceTime
) {
  if (
    !state.isPlaying ||
    currentPlaybackTickIndex === null ||
    currentPlayingStepIndex === null
  ) {
    return;
  }

  const stepDurationMs =
    duration();

  const remainingSteps =
    Math.max(
      0,
      state.patternLength -
        1 -
        currentPlayingStepIndex
    );

  const maximumAheadSteps =
    Math.min(
      remainingSteps,
      Math.floor(
        AUDIO_PREBUFFER_MS /
          Math.max(
            1,
            stepDurationMs
          )
      )
    );

  for (
    let ahead = 0;
    ahead <= maximumAheadSteps;
    ahead++
  ) {
    const playbackTickIndex =
      currentPlaybackTickIndex +
      ahead;

    if (
      audioScheduledThroughTick !== null &&
      playbackTickIndex <=
        audioScheduledThroughTick
    ) {
      continue;
    }

    const plannedPerformanceTime =
      currentPlannedPerformanceTime +
      stepDurationMs * ahead;

    playStepAtTick(
      playbackTickIndex,
      plannedPerformanceTime
    );

    audioScheduledThroughTick =
      playbackTickIndex;
  }
}

function stopPlayback() {
  state.isPlaying = false;

  releaseScreenWakeLock();

  state.playingStepIndex =
    null;

  state.playbackTickIndex =
    null;

  state.playingSourceType =
    null;

  state.playingPatternIndex =
    null;

  state.playingFillIndex =
    null;

  state.playingSectionIndex =
    null;

  state.playingSectionItemIndex =
    null;

  state.playingSongPartIndex =
    null;

  state.fillReturnTarget =
    null;

  clearQueuedSource();

  clearTimeout(timer);
  timer = null;
  nextTickTime = 0;
  audioScheduledThroughTick = null;

  playButton.classList.remove(
    "playing"
  );

  updatePlayingStep();
  renderPatternManager();
  renderSongMode();
}

function tick() {
  if (!state.isPlaying) {
    return;
  }

  const nextStepIndex =
    state.playingStepIndex + 1;

  /*
   * 現在Patternの終端へ到達。
   */
  if (
    nextStepIndex >=
    state.patternLength
  ) {
    /*
 * Pattern／Fill終端で、
 * 予約切替またはSection進行を行う。
 */
const perfSwitchStartedAt = performance.now();
const beforeSource = {
  type: state.playingSourceType,
  pattern: state.playingPatternIndex,
  fill: state.playingFillIndex
};
const sourceChanged =
  advancePlaybackSource();
perfMainLog(
  "SOURCE_SWITCH",
  perfSwitchStartedAt,
  {
    changed: sourceChanged,
    before: beforeSource,
    after: {
      type: state.playingSourceType,
      pattern: state.playingPatternIndex,
      fill: state.playingFillIndex
    }
  }
);

/*
 * Song末尾まで再生したら
 * その場で自動停止する。
 */
if (
  state.selectedPlaybackType ===
    "song" &&
  state.playingSongPartIndex ===
    null
) {
  stopPlayback();
  return;
}

    state.playingStepIndex =
  0;

/*
 * Sourceが切り替わった場合は、
 * 全Trackを新しいSourceの先頭から開始。
 *
 * 同じPatternがループするだけなら、
 * Track独自のステップ位置は継続する。
 */
if (sourceChanged) {
  state.playbackTickIndex =
    0;
} else {
  state.playbackTickIndex +=
    1;
}

    /*
 * Source切替後のStep 1も
 * UI描画より先に予約する。
 */
if (sourceChanged) {
  audioScheduledThroughTick = null;
}

scheduleAudioAhead(
  state.playbackTickIndex,
  state.playingStepIndex,
  nextTickTime
);

scheduleNextTick();

if (sourceChanged) {
  preserveFocusDuringRender();
} else {
  updatePlayingStep();
}

    return;
  }

  state.playingStepIndex =
  nextStepIndex;

state.playbackTickIndex += 1;

/*
 * UI描画より先に
 * 次StepをAudioContextへ予約する。
 */
scheduleAudioAhead(
  state.playbackTickIndex,
  state.playingStepIndex,
  nextTickTime
);

scheduleNextTick();

/*
 * 発音予約後に
 * 再生位置表示を更新する。
 */
updatePlayingStep();
}

async function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
    return;
  }

  await initializeAudio();

setMasterVolumeValue(
  Number(
    volumeInput.value
  )
);

state.isPlaying = true;

state.playingStepIndex =
  0;

state.playbackTickIndex =
  0;

const started =
  beginSelectedPlayback();

if (!started) {
  stopPlayback();
  return;
}

clearQueuedSource();

requestScreenWakeLock();

playButton.classList.add("playing");

/*
 * 停止状態から再生開始した時点で、
 * Pattern / Fill / Sectionの
 * playing表示も即反映する。
 */
renderPatternManager();
renderSongMode();

updatePlayingStep();

/*
 * 再生開始時点で基準時刻を先に固定し、
 * Step 1から以後のStepまで
 * 同じperformance.now()基準で予約する。
 */
nextTickTime =
  performance.now();

audioScheduledThroughTick =
  null;

scheduleAudioAhead(
  state.playbackTickIndex,
  state.playingStepIndex,
  nextTickTime
);

scheduleNextTick();
}

const BPM_MIN = 40;
const BPM_MAX = 300;
const BPM_SWIPE_PIXELS = 2;

let bpmSwipeActive = false;
let bpmSwipeStartY = 0;
let bpmSwipeStartValue = 120;
let bpmSwipePointerId = null;

function setBpmValue(value) {
  bpmInput.value = clamp(
    Math.round(value),
    BPM_MIN,
    BPM_MAX
  );
}

function isTouchLikePointer(event) {
  return (
    event.pointerType === "touch" ||
    event.pointerType === "pen"
  );
}

function isTouchDevice() {
  return window.matchMedia(
    "(pointer: coarse)"
  ).matches;
}

if (isTouchDevice()) {
  bpmInput.readOnly = true;
}

bpmInput.addEventListener(
  "pointerdown",
  event => {
    if (!isTouchLikePointer(event)) {
      return;
    }

    event.preventDefault();

    bpmInput.blur();

    bpmSwipeActive = true;
    bpmSwipePointerId =
      event.pointerId;

    bpmSwipeStartY =
      event.clientY;

    bpmSwipeStartValue =
      clamp(
        Number(bpmInput.value) || 120,
        BPM_MIN,
        BPM_MAX
      );

    bpmInput.setPointerCapture(
      event.pointerId
    );
  }
);

bpmInput.addEventListener(
  "pointermove",
  event => {
    if (
      !bpmSwipeActive ||
      event.pointerId !==
        bpmSwipePointerId
    ) {
      return;
    }

    event.preventDefault();

    const movement =
      bpmSwipeStartY -
      event.clientY;

    const bpmChange =
      movement /
      BPM_SWIPE_PIXELS;

    setBpmValue(
      bpmSwipeStartValue +
      bpmChange
    );
  }
);

function endBpmSwipe(event) {
  if (
    event.pointerId !==
      bpmSwipePointerId
  ) {
    return;
  }

  bpmSwipeActive = false;
  bpmSwipePointerId = null;

  if (
    bpmInput.hasPointerCapture(
      event.pointerId
    )
  ) {
    bpmInput.releasePointerCapture(
      event.pointerId
    );
  }
}

bpmInput.addEventListener(
  "pointerup",
  endBpmSwipe
);

bpmInput.addEventListener(
  "pointercancel",
  endBpmSwipe
);

playButton.addEventListener("click", togglePlayback);
function enableRelativeVolumeDrag({
  slider,
  hitTarget,
  getValue,
  setValue,
  min = 0,
  max = 100,
  step = 1,
  onStart,
  onFinish
}) {
  let pointerId = null;
  let startX = 0;
  let startValue = 0;
  let currentValue = 0;
  let moved = false;

  hitTarget.style.touchAction =
    "none";

  hitTarget.addEventListener(
    "pointerdown",
    event => {
      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      /*
       * スライダー表示部分を触った場合だけ
       * ボリューム操作を開始する。
       */
      const sliderRect =
        slider.getBoundingClientRect();

      const insideSlider =
        event.clientX >= sliderRect.left &&
        event.clientX <= sliderRect.right &&
        event.clientY >= sliderRect.top &&
        event.clientY <= sliderRect.bottom;

      if (!insideSlider) {
        return;
      }

      event.preventDefault();

      pointerId =
        event.pointerId;

      startX =
        event.clientX;

      startValue =
        clamp(
          Number(getValue()),
          min,
          max
        );

      currentValue =
        startValue;

      moved = false;

      onStart?.();

      hitTarget.setPointerCapture(
        event.pointerId
      );
    }
  );

  hitTarget.addEventListener(
    "pointermove",
    event => {
      if (
        pointerId !==
        event.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const sliderRect =
        slider.getBoundingClientRect();

      /*
       * 58pxで0～100だと敏感すぎるため、
       * スライダー幅の約2倍を全変化幅にする。
       */
      const dragWidth =
        Math.max(
          1,
          sliderRect.width * 2
        );

      const movementX =
        event.clientX -
        startX;

      const rawValue =
        startValue +
        (
          movementX /
          dragWidth
        ) *
        (max - min);

      const steppedValue =
        Math.round(
          rawValue / step
        ) * step;

      const nextValue =
        clamp(
          steppedValue,
          min,
          max
        );

      if (
        nextValue ===
        currentValue
      ) {
        return;
      }

      currentValue =
        nextValue;

      moved = true;

      setValue(
        nextValue
      );
    }
  );

  function finish(event) {
    if (
      pointerId !==
        event.pointerId
    ) {
      return;
    }

    if (
      hitTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      hitTarget.releasePointerCapture(
        event.pointerId
      );
    }

    pointerId =
      null;

    /*
     * 指を離した瞬間の値を
     * 改めて確定表示する。
     */
    setValue(
      currentValue
    );

    onFinish?.(
      startValue,
      currentValue,
      moved
    );
  }

  hitTarget.addEventListener(
    "pointerup",
    finish
  );

  hitTarget.addEventListener(
    "pointercancel",
    finish
  );
}

function setMasterVolumeValue(
  nextValue
) {
  const value =
    clamp(
      Math.round(nextValue),
      0,
      100
    );

  volumeInput.value =
    String(value);

  volumeValue.value =
    String(value);

  volumeValue.textContent =
    String(value);

  setMasterVolume(
    value / 100
  );
}

enableRelativeVolumeDrag({
  slider:
    volumeInput,

  hitTarget:
    volumeInput.closest(
      ".master-control"
    ),

  getValue: () =>
    Number(
      volumeInput.value
    ),

  setValue:
    setMasterVolumeValue,

  min: 0,
  max: 100,
  step: 1
});

/*
 * キーボード操作は
 * range本来の操作を残す。
 */
volumeInput.addEventListener(
  "input",
  () => {
    setMasterVolumeValue(
      Number(
        volumeInput.value
      )
    );
  }
);

themeButton.addEventListener(
  "click",
  () => {

    const nextIndex =
      (themeSelector.selectedIndex + 1) %
      themeSelector.options.length;

    themeSelector.selectedIndex =
      nextIndex;

    themeSelector.dispatchEvent(
      new Event("change")
    );

  }
);
themeSelector.addEventListener(
  "change",
  () => {
    const themeClasses = [
      "theme-sprooto",
      "theme-kasai",
      "theme-ryuichi",
      "theme-aya",
      "theme-tobokegao"
    ];

    document.body.classList.remove(
      ...themeClasses
    );

    document.body.classList.add(
      themeSelector.value
    );

    refreshMasterMixMeterColor();
  }
);

undoButton.addEventListener("click", () => {
  if (!undo()) {
    return;
  }

  render();
  updateHistoryButtons();
});

redoButton.addEventListener("click", () => {
  if (!redo()) {
    return;
  }

  render();
  updateHistoryButtons();
});

async function initializeApp() {
  await restoreAutosave();

  render();
  updateHistoryButtons();

  initializeAutosave();

  window.addEventListener(
    "historychange",
    scheduleAutosave
  );
}

void initializeApp();

document.addEventListener(
  "visibilitychange",
  () => {
    resumeAudio();

    /*
     * iPhone等では一度バックグラウンドへ
     * 入るとWake Lockが解除されることがある。
     * 再生中に画面へ戻ったら再取得する。
     */
    if (
      document.visibilityState ===
        "visible" &&
      state.isPlaying
    ) {
      requestScreenWakeLock();
    }
  }
);

window.addEventListener(
  "pageshow",
  resumeAudio
);

window.addEventListener(
  "focus",
  resumeAudio
);