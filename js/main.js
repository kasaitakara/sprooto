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
  renderPatternManager
} from "./ui.js";

import {
  initializeAutosave,
  restoreAutosave,
  scheduleAutosave
} from "./storage.js";

import "./keyboard-navigation.js";

let timer = null;
let nextTickTime = 0;
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

  const delay = Math.max(
    0,
    nextTickTime - performance.now()
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

function playCurrentStep() {
  tracks.forEach(track => {
    const trackStepIndex =
      state.playingStepIndex %
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
        swingDelaySeconds(
          track,
          trackStepIndex
        )
      );
    }
  });
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

    state.playingStepIndex =
      0;

    /*
     * Pattern切替時は
     * Sequence／Editor／Pattern表示も更新。
     */
    if (sourceChanged) {
  preserveFocusDuringRender();
} else {
  updatePlayingStep();
}

    playCurrentStep();

    scheduleNextTick();

    return;
  }

  state.playingStepIndex =
    nextStepIndex;

  updatePlayingStep();
  playCurrentStep();

  scheduleNextTick();
}

async function togglePlayback() {
  if (state.isPlaying) {
    state.isPlaying = false;
    state.playingStepIndex = null;
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

clearQueuedSource();

    clearTimeout(timer);
    nextTickTime = 0;

    playButton.classList.remove("playing");

    updatePlayingStep();
    renderPatternManager();

    return;
  }

  await initializeAudio();

  state.isPlaying = true;
state.playingStepIndex = 0;

beginSelectedPlayback();

clearQueuedSource();

  playButton.classList.add("playing");

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
volumeInput.addEventListener("input", () => {
  const value = clamp(Number(volumeInput.value), 0, 100);
  volumeValue.value = value;
  volumeValue.textContent = value;
  setMasterVolume(value / 100);
});
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
themeSelector.addEventListener("change", () => { document.body.className = themeSelector.value; });

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
  resumeAudio
);

window.addEventListener(
  "pageshow",
  resumeAudio
);

window.addEventListener(
  "focus",
  resumeAudio
);