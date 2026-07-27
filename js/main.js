import {
  STEP_COUNT,
  tracks,
  state,
  clamp,
  undo,
  redo,
  canUndo,
  canRedo
} from "./sequencer.js";
import { initializeAudio, playTrackStep, setMasterVolume } from "./audio.js";
import { render, updatePlayingStep } from "./ui.js";
import "./keyboard-navigation.js";

let timer = null;
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

window.addEventListener(
  "historychange",
  updateHistoryButtons
);

function duration() {
  return 60000 / clamp(Number(bpmInput.value) || 120, 40, 300) / 4;
}

function audible(track) {
  const hasSolo = tracks.some(item => item.solo);
  return !track.muted && (!hasSolo || track.solo);
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
        trackStepIndex
      );
    }
  });
}

function tick() {
  if (!state.isPlaying) return;

  state.playingStepIndex =
    state.playingStepIndex + 1;

  updatePlayingStep();
  playCurrentStep();

  timer = setTimeout(
    tick,
    duration()
  );
}

async function togglePlayback() {
  if (state.isPlaying) {
    state.isPlaying = false;
    state.playingStepIndex = null;

    clearTimeout(timer);

    playButton.classList.remove("playing");

    updatePlayingStep();

    return;
  }

  await initializeAudio();

  state.isPlaying = true;
  state.playingStepIndex = 0;

  playButton.classList.add("playing");

  updatePlayingStep();
  playCurrentStep();

  timer = setTimeout(tick, duration());
}

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

render();
updateHistoryButtons();
