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
clearQueuedSource
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
  renderSongMode
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
const playButton = document.getElementById("play-button");
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

  const maximumAdvanceSeconds =
    swingUnitSeconds * 8;

  const swingValue =
    clamp(
      Number(track.swing) || 0,
      -8,
      8
    );

  const isOffbeat =
    stepIndex % 2 === 1;

  return (
    maximumAdvanceSeconds +
    (
      isOffbeat
        ? swingValue *
          swingUnitSeconds
        : 0
    )
  );
}

function playCurrentStep(
  plannedPerformanceTime =
    performance.now()
) {
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
  state.playbackTickIndex %
  track.stepLength;

    if (
      !audible(track) ||
      !track.steps[trackStepIndex]
    ) {
      return;
    }

    const probability = clamp(
      track.base.probability +
        track.offsets.probability[
          trackStepIndex
        ],
      0,
      100
    );

    if (
      Math.random() * 100 <
      probability
    ) {
      playTrackStep(
  track,
  trackStepIndex,
  scheduleDelaySeconds +
    swingDelaySeconds(
      track,
      trackStepIndex
    )
);
    }
  });
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
const sourceChanged =
  advancePlaybackSource();

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
     * Pattern切替時は
     * Sequence／Editor／Pattern表示も更新。
     */
    if (sourceChanged) {
  preserveFocusDuringRender();
} else {
  updatePlayingStep();
}

    playCurrentStep(
  nextTickTime
);

    scheduleNextTick();

    return;
  }

  state.playingStepIndex =
  nextStepIndex;

state.playbackTickIndex += 1;

updatePlayingStep();
playCurrentStep(
  nextTickTime
);

  scheduleNextTick();
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
playCurrentStep();

  nextTickTime = performance.now();
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
      "theme-aya"
    ];

    document.body.classList.remove(
      ...themeClasses
    );

    document.body.classList.add(
      themeSelector.value
    );
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

restoreAutosave();

render();
updateHistoryButtons();

initializeAutosave();

window.addEventListener(
  "historychange",
  scheduleAutosave
);

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