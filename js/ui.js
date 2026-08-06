import {
  STEP_COUNT,
  PAGE_STEP_COUNT,
  tracks,
  parameters,
  state,
  sections,
  selectedTrack,
  parameterById,
  clamp,
  getMaxTrackLength,
  syncPatternLength,
  saveHistory,
  saveHistorySnapshot,
  createSnapshot,
  selectPattern,
  selectFill,
  queuePattern,
  queueFill,
  addCurrentSourceToSection,
  addSourceToSection,
  moveSectionSource,
  removeSectionSource,
  currentSourceLabel,
  selectSection,
  queueSection,
  selectEditingSection,
  changeEditingSection,
  currentEditingSection,
  currentEditingSectionLabel,
  clearSelectedTrackSequence,
  clearSelectedParameterOffsets,
} from "./sequencer.js";


import {
  SOUND_CATEGORIES,
  getFactoryPresets,
  getUserPresets,
  saveUserPreset,
  deleteUserPreset,
  captureTrackSound,
  applyTrackSound,
  soundsEqual
} from "./sound-preset-manager.js";

const sequenceGrid = document.getElementById("sequence-grid");
const sequencePageButton = document.getElementById("sequence-page-button");
const patternLengthInput = document.getElementById("pattern-length-input");
const currentSourceDisplay = document.getElementById("current-source-display");
const editor = document.getElementById("editor");
const patternGrid =
  document.getElementById(
    "pattern-grid"
  );

const sectionList =
  document.getElementById(
    "section-list"
  );

const patternPageButton =
  document.getElementById(
    "pattern-page-button"
  );

const themeButton =
  document.getElementById(
    "theme-button"
  );
  function clearThemeButtonActive() {
  themeButton?.classList.remove(
    "active"
  );
}

themeButton?.addEventListener(
  "pointerdown",
  () => {
    themeButton.classList.add(
      "active"
    );
  }
);

themeButton?.addEventListener(
  "pointerup",
  clearThemeButtonActive
);

themeButton?.addEventListener(
  "pointercancel",
  clearThemeButtonActive
);

themeButton?.addEventListener(
  "pointerleave",
  clearThemeButtonActive
);

const PATTERN_SLOT_COUNT = 24;
const FILL_SLOT_COUNT = 8;
const SECTION_SLOT_COUNT = 16;

const PATTERNS_PER_PAGE = 12;
const FILLS_PER_PAGE = 4;
const SECTIONS_PER_PAGE = 8;

const LFO_BPM_RATE_NAMES = [
  "1/64",
  "1/32T",
  "1/32",
  "1/16T",
  "1/16",
  "1/8T",
  "1/8",
  "1/4T",
  "1/4",
  "1/2T",
  "1/2",
  "1/1",
  "2/1",
  "4/1"
];

const LFO_BPM_BEAT_RATIOS = [
  1 / 16,
  1 / 12,
  1 / 8,
  1 / 6,
  1 / 4,
  1 / 3,
  1 / 2,
  2 / 3,
  1,
  4 / 3,
  2,
  4,
  8,
  16
];

function currentBpm() {
  return Math.max(
    1,
    Number(
      document.getElementById(
        "bpm-input"
      )?.value
    ) || 120
  );
}

function freeRateToBpmIndex(
  freeRate
) {
  const freeHz =
    clamp(
      Number(freeRate) || 1,
      1,
      100
    ) / 10;

  const bpm =
    currentBpm();

  let nearestIndex = 0;
  let nearestDifference =
    Infinity;

  LFO_BPM_BEAT_RATIOS.forEach(
    (beatRatio, index) => {
      const syncedHz =
        1 /
        (
          (60 / bpm) *
          beatRatio
        );

      const difference =
        Math.abs(
          syncedHz - freeHz
        );

      if (
        difference <
        nearestDifference
      ) {
        nearestDifference =
          difference;

        nearestIndex =
          index;
      }
    }
  );

  return nearestIndex;
}

function bpmIndexToFreeRate(
  bpmIndex
) {
  const index =
    clamp(
      Math.round(
        Number(bpmIndex) || 0
      ),
      0,
      LFO_BPM_BEAT_RATIOS.length - 1
    );

  const syncedHz =
    1 /
    (
      (60 / currentBpm()) *
      LFO_BPM_BEAT_RATIOS[index]
    );

  return clamp(
    Math.round(
      syncedHz * 10
    ),
    1,
    100
  );
}

let patternManagerPage = 0;

function getParameterIcon(iconId) {
  const icons = {
    note: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18V6l9-2v12"></path>
        <circle cx="6" cy="18" r="2"></circle>
        <circle cx="15" cy="16" r="2"></circle>
      </svg>
    `,

    track:  `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="1.5"
        />

        <circle
            cx="8"
            cy="12"
            r="2"
        />

        <circle
            cx="16"
            cy="12"
            r="2"
        />

        <path d="M10 12h4" />
        <path d="M6 16h12" />
    </svg>
    `,

    volume: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19"></polygon>
        <path d="M15 9a5 5 0 0 1 0 6"></path>
      </svg>
    `,

    sine: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12C5 5 8 5 12 12s7 7 10 0"></path>
      </svg>
    `,

    noise: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 13l3-6 3 10 3-12 3 14 3-10 5 5"></path>
      </svg>
    `,

    decay: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 5v14h16"></path>
        <path d="M4 5l16 14"></path>
      </svg>
    `,

    fm: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 9c3-6 5 6 8 0s5 6 8 0 4 0 4 0"></path>
        <path d="M2 15c3-6 5 6 8 0s5 6 8 0 4 0 4 0"></path>
      </svg>
    `,

    tone: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 5h18l-7 8v5l-4 2v-7z"></path>
      </svg>
    `,

    pan: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12h16"></path>
        <path d="M8 8l-4 4 4 4"></path>
        <path d="M16 8l4 4-4 4"></path>
        <circle cx="12" cy="12" r="2"></circle>
      </svg>
    `,

    erase: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 17l8.5-10.5a2 2 0 0 1 3-.2l3.2 3.2a2 2 0 0 1 .1 2.7L10 21H5z"></path>
        <path d="M8.5 20.5l-4-4"></path>
        <path d="M13 18h8"></path>
      </svg>
    `,

    save: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 4h14l2 2v14H4z"></path>
    <path d="M7 4v6h10V4"></path>
    <rect x="7" y="14" width="10" height="6"></rect>
  </svg>
`,

trash: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16"></path>
    <path d="M9 7V4h6v3"></path>
    <path d="M6 7l1 13h10l1-13"></path>
    <path d="M10 11v5"></path>
    <path d="M14 11v5"></path>
  </svg>
`,
    attack: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 19h16V5"></path>
    <path d="M4 19L20 5"></path>
  </svg>
`,

    sustain: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="
        M4 5
        L11 15
        H20
        V19
        H4
        Z
      "
    ></path>
  </svg>
`,

    gate: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect
      x="4"
      y="12"
      width="10"
      height="6"
    ></rect>

    <path d="M18 7V19"></path>
    <path d="M16 7H20"></path>
  </svg>
`,

    lfo: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12c2.5-7 5.5-7 8 0s5.5 7 8 0 4-4 4-4"></path>
        <path d="M2 19h20"></path>
      </svg>
    `,

    fx: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect
      x="6"
      y="3"
      width="12"
      height="18"
      rx="2"
    ></rect>

    <circle
      cx="12"
      cy="8"
      r="2"
    ></circle>

    <path d="M10 15h4"></path>

    <path d="M9 18h6"></path>
  </svg>
`,


    delay: `
      <svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M4 5.5c4 2.2 4 10.8 0 13" />
  <path d="M10 7.5c3 1.7 3 7.3 0 9" />
  <path d="M16 9.5c1.8 1 1.8 4 0 5" />
</svg>
    `,

    sub: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12h4"></path>
        <path d="M7 12c2-7 4-7 6 0s4 7 8 0"></path>
      </svg>
    `,

    probability: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
        <circle cx="8" cy="8" r="1"></circle>
        <circle cx="16" cy="8" r="1"></circle>
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="8" cy="16" r="1"></circle>
        <circle cx="16" cy="16" r="1"></circle>
      </svg>
    `
  };

  return icons[iconId] ?? "";
}


const oscParameter = {
  id: "osc",
  label: "OSC",
  icon: "sine",
  children: [
    {
      id: "sineVolume",
      source: "sine",
      label: "SINE MIX",
      text: "mix"
    },
    {
      id: "sineDecay",
      source: "sine",
      label: "SINE DECAY",
      text: "decay"
    },
    {
      id: "noiseVolume",
      source: "noise",
      label: "NOISE MIX",
      text: "mix"
    },
    {
      id: "noiseDecay",
      source: "noise",
      label: "NOISE DECAY",
      text: "decay"
    }
  ]
};

const envelopeParameter = {
  id: "envelope",
  label: "ENV",
  children: [
    {
      id: "attack",
      label: "attack",
      text: "attack",
      icon: "attack",
      min: 1,
      max: 50,
      step: 1
    },
    {
      id: "decay",
      label: "decay",
      text: "decay",
      icon: "decay",
      min: 1,
      max: 100,
      step: 1
    },
    {
      id: "sustain",
      label: "sustain",
      text: "sustain",
      icon: "sustain",
      min: 0,
      max: 100,
      step: 1
    },
    {
      id: "gate",
      label: "gate",
      text: "gate",
      icon: "gate",
      min: 1,
      max: 100,
      step: 1
    }
  ]
};

const parameterMenuItems = [
  { label: "OSC", parameter: oscParameter, icon: "sine" },
  { label: "NOTE", parameterId: "note", icon: "note" },
  { label: "ENV", parameter: envelopeParameter, icon: "decay" },
  { label: "FM", parameterId: "fmDepth", icon: "fm" },
  { label: "FILTER", parameterId: "filterCutoff", icon: "tone" },
  { label: "PAN", parameterId: "pan", icon: "pan" },
  { label: "LFO", parameterId: "lfo", icon: "lfo" },
  { label: "FX", placeholderId: "fx", icon: "fx" },
  { label: "FX1", parameterId: "delay", icon: "delay" },
  { label: "FX2", placeholderId: "fx2", icon: "fx" },
  { label: "FX3", placeholderId: "fx3", icon: "fx" },
  { label: "FX4", placeholderId: "fx4", icon: "fx" },
  { label: "FX5", placeholderId: "fx5", icon: "fx" },
  { label: "PROB", parameterId: "probability", icon: "probability" },
  { label: "SUB", placeholderId: "sub", icon: "sub" }
];

function editorParameterById(id) {
  if (id === "osc") {
    return oscParameter;
  }

  if (id === "envelope") {
    return envelopeParameter;
  }

  return parameterById(id);
}

function restoreFocus(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus());
}

function restoreFocusKey(focusKey) {
  if (!focusKey) {
    return;
  }

  requestAnimationFrame(() => {
    const target = Array.from(
      document.querySelectorAll("[data-focus-key]")
    ).find(element => {
      return element.dataset.focusKey === focusKey;
    });

    target?.focus();
  });
}

function renderEditorAndRestore(focusKey) {
  renderEditor();
  restoreFocusKey(focusKey);
}

const DELETE_DOUBLE_TAP_INTERVAL = 1000;

function enableDoubleTapAction({
  element,
  onDoubleTap,
  interval = DELETE_DOUBLE_TAP_INTERVAL
}) {
  let firstTapTime = 0;
  let resetTimer = null;

  function reset() {
    firstTapTime = 0;

    if (resetTimer !== null) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }

    element.classList.remove(
      "delete-armed"
    );
  }

  element.addEventListener(
    "click",
    event => {
      const now = performance.now();

      if (
        firstTapTime !== 0 &&
        now - firstTapTime <= interval
      ) {
        event.preventDefault();
        reset();
        onDoubleTap();
        return;
      }

      firstTapTime = now;

      element.classList.add(
        "delete-armed"
      );

      if (resetTimer !== null) {
        clearTimeout(resetTimer);
      }

      resetTimer = window.setTimeout(
        reset,
        interval
      );
    }
  );

  element.addEventListener(
    "blur",
    reset
  );
}

const SWEEP_START_DISTANCE = 8;
const SWEEP_PIXELS_PER_STEP = 12;
const SWEEP_ACCELERATION_START = 8;
const SWEEP_ACCELERATION_RATE = 0.2;

function decimalPlaces(value) {
  const text = String(value);

  if (!text.includes(".")) {
    return 0;
  }

  return text.split(".")[1].length;
}

function roundToStep(value, step) {
  const digits = decimalPlaces(step);

  return Number(
    value.toFixed(digits)
  );
}

function isTouchOrPen(pointerType) {
  return (
    pointerType === "touch" ||
    pointerType === "pen"
  );
}

function isTouchDevice() {
  return window.matchMedia(
    "(pointer: coarse)"
  ).matches;
}

function enableVerticalSweep({
  element,
  getValue,
  setValue,
  min,
  max,
  step = 1,
  pixelsPerStep =
    SWEEP_PIXELS_PER_STEP,
  acceleration = true,
  accelerationStart =
    SWEEP_ACCELERATION_START,
  accelerationRate =
    SWEEP_ACCELERATION_RATE,
  onCommit
}) {
  let pointerId = null;
  let startY = 0;
  let startValue = 0;
  let currentValue = 0;
  let sweeping = false;
  let changed = false;
  let suppressClick = false;

  element.style.touchAction = "none";

  element.addEventListener(
    "pointerdown",
    event => {
      if (event.button !== 0) {
        return;
      }

      pointerId = event.pointerId;
      startY = event.clientY;
      startValue = Number(getValue());
      currentValue = startValue;
      sweeping = false;
      changed = false;
      suppressClick = false;

      element.setPointerCapture(
        event.pointerId
      );
    }
  );

  element.addEventListener(
    "pointermove",
    event => {
      if (
        pointerId !== event.pointerId
      ) {
        return;
      }

      const distance =
        event.clientY - startY;

      if (
        !sweeping &&
        Math.abs(distance) <
          SWEEP_START_DISTANCE
      ) {
        return;
      }

      if (!sweeping) {
  sweeping = true;
  suppressClick = true;

  element.classList.add(
    "is-sweeping"
  );
}

      event.preventDefault();

      /*
       * まずは従来どおり、
       * 12pxにつき1ステップ。
       */
      const rawStepCount =
  -distance /
  pixelsPerStep;

      const direction =
        Math.sign(rawStepCount);

      const absoluteStepCount =
        Math.abs(rawStepCount);

      let acceleratedStepCount =
        absoluteStepCount;

      /*
       * 10ステップを超えた分だけ
       * 徐々に加速する。
       */
      if (
  acceleration &&
  absoluteStepCount >
    accelerationStart
) {
        const extra =
          absoluteStepCount -
          accelerationStart;

        acceleratedStepCount =
          accelerationStart +
          extra +
          extra *
            extra *
            accelerationRate;
      }

      const stepCount =
        Math.round(
          direction *
          acceleratedStepCount
        );

      const nextValue =
        roundToStep(
          clamp(
            startValue +
              stepCount * step,
            min,
            max
          ),
          step
        );

      if (nextValue === currentValue) {
        return;
      }

      currentValue = nextValue;
      changed = true;

      setValue(nextValue);
    }
  );

  function finishSweep(event) {
    if (
      pointerId !== event.pointerId
    ) {
      return;
    }

    if (
      element.hasPointerCapture(
        event.pointerId
      )
    ) {
      element.releasePointerCapture(
        event.pointerId
      );
    }

    pointerId = null;
    element.classList.remove(
  "is-sweeping"
);

    if (sweeping) {
      onCommit?.(
        startValue,
        currentValue,
        changed
      );
    }
  }

  element.addEventListener(
    "pointerup",
    finishSweep
  );

  element.addEventListener(
    "pointercancel",
    finishSweep
  );

  element.addEventListener(
    "click",
    event => {
      if (!suppressClick) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      suppressClick = false;
    },
    true
  );
}

function stepCell(stepIndex) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "sequence-step";
  button.dataset.stepIndex = stepIndex;

  button.setAttribute(
    "aria-label",
    `step ${stepIndex + 1}`
  );

  tracks.forEach((track, trackIndex) => {
    const lane = document.createElement("span");

    lane.className = "track-lane";
    lane.dataset.trackIndex = trackIndex;
    lane.dataset.stepIndex = stepIndex;

    const exists =
      stepIndex < track.stepLength;

    if (!exists) {
      lane.classList.add("outside-length");
      button.appendChild(lane);
      return;
    }

    if (track.steps[stepIndex]) {
      lane.classList.add("on");
    }

    if (
      trackIndex === state.selectedTrackIndex
    ) {
      lane.classList.add("selected-track");
    }

    const playingStep =
  state.playbackTickIndex === null
    ? -1
    : state.playbackTickIndex %
      track.stepLength;

if (
  stepIndex === playingStep
) {
  lane.classList.add(
    "playing"
  );
}

    button.appendChild(lane);
  });

      button.addEventListener(
    "click",
    () => {
      const trackIndex =
        state.selectedTrackIndex;

      const track =
        tracks[trackIndex];

      if (
        !track ||
        stepIndex >= track.stepLength
      ) {
        return;
      }

      saveHistory();

      track.steps[stepIndex] =
        !track.steps[stepIndex];

      /*
       * 選択中トラックのレーンだけ
       * ON/OFF表示を更新する。
       */
      const lane =
        button.querySelector(
          `.track-lane[data-track-index="${trackIndex}"]`
        );

      lane?.classList.toggle(
        "on",
        track.steps[stepIndex]
      );

      /*
       * Offset画面の
       * note-on強調も更新する。
       */
      renderEditor();
    }
  );
  return button;
}

function renderCurrentSourceDisplay() {
  if (!currentSourceDisplay) {
    return;
  }

  const label =
    currentSourceLabel();

  currentSourceDisplay.innerHTML = `
    <span
      class="current-source-icon"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect
          x="4"
          y="4"
          width="6"
          height="6"
          rx="1"
        ></rect>

        <rect
          x="14"
          y="4"
          width="6"
          height="6"
          rx="1"
        ></rect>

        <rect
          x="4"
          y="14"
          width="6"
          height="6"
          rx="1"
        ></rect>

        <rect
          x="14"
          y="14"
          width="6"
          height="6"
          rx="1"
        ></rect>
      </svg>
    </span>

    <span class="current-source-label">
      ${label}
    </span>
  `;

  currentSourceDisplay.setAttribute(
    "aria-label",
    state.selectedSourceType === "fill"
      ? `Fill ${label}`
      : `Pattern ${label}`
  );
}

export function renderSequence() {
  sequenceGrid.innerHTML = "";

  syncPatternLength();

  const maximumLength =
    getMaxTrackLength();

  const firstStepIndex =
    state.sequencePage *
    PAGE_STEP_COUNT;

  const lastStepIndex = Math.min(
    firstStepIndex + PAGE_STEP_COUNT,
    maximumLength
  );

  for (
    let stepIndex = firstStepIndex;
    stepIndex < lastStepIndex;
    stepIndex++
  ) {
    sequenceGrid.appendChild(
      stepCell(stepIndex)
    );
  }

  patternLengthInput.value =
    maximumLength;

  const hasSecondPage =
    maximumLength >
    PAGE_STEP_COUNT;

  sequencePageButton.hidden =
    !hasSecondPage;

  sequencePageButton.textContent =
    state.sequencePage === 0
      ? "◧"
      : "◨";

  sequencePageButton.setAttribute(
    "aria-label",
    state.sequencePage === 0
      ? "ステップ1～32を表示中。33～64へ切り替え"
      : "ステップ33～64を表示中。1～32へ切り替え"
  );
}

sequencePageButton.addEventListener("click", () => {
  if (state.patternLength <= PAGE_STEP_COUNT) {
    return;
  }

  state.sequencePage = state.sequencePage === 0 ? 1 : 0;
  render();
  restoreFocus("#sequence-page-button");
});

/*
 * Pattern Length
 *
 * touch / pen：
 * 上下スイープ専用。
 * タップでは数値キーボードを開かない。
 *
 * mouse / keyboard：
 * 直接入力可能。
 */

patternLengthInput.readOnly = true;

let patternLengthPointerType = null;
let patternLengthDirectEditing = false;
let patternLengthEditStartValue =
  getMaxTrackLength();

let patternLengthSweepHistorySaved =
  false;

patternLengthInput.addEventListener(
  "pointerdown",
  event => {
    patternLengthPointerType =
      event.pointerType;

    if (
  isTouchDevice() ||
  isTouchOrPen(
    event.pointerType
  )
) {
  event.preventDefault();

  patternLengthInput.readOnly =
    true;

  patternLengthDirectEditing =
    false;

  delete patternLengthInput.dataset
    .keyboardEditing;

  patternLengthInput.blur();

  return;
}

    /*
     * PCのマウス操作では
     * 直接入力を許可する。
     */
    patternLengthEditStartValue =
      getMaxTrackLength();

    patternLengthDirectEditing =
      true;

    patternLengthInput.readOnly =
      false;

    patternLengthInput.dataset
      .keyboardEditing = "true";
  }
);

enableVerticalSweep({
  element: patternLengthInput,

  getValue: () => {
    return getMaxTrackLength();
  },

  setValue: nextLength => {
    if (
      !patternLengthSweepHistorySaved
    ) {
      saveHistory();

      patternLengthSweepHistorySaved =
        true;
    }

    const roundedLength =
      Math.round(nextLength);

    tracks.forEach(track => {
      track.stepLength =
        roundedLength;
    });

    syncPatternLength();

    patternLengthInput.value =
      state.patternLength;

    renderSequence();
    renderEditor();
  },

  min: 1,
  max: STEP_COUNT,
  step: 1,

  /*
   * Track Lengthと同じく、
   * 長さ変更はゆっくり動かす。
   */
  pixelsPerStep: 20,
  acceleration: false,

  onCommit: (
    startValue,
    currentValue,
    changed
  ) => {
    patternLengthSweepHistorySaved =
      false;

    patternLengthDirectEditing =
      false;

    patternLengthInput.readOnly =
      true;

    delete patternLengthInput.dataset
      .keyboardEditing;

    patternLengthInput.value =
      getMaxTrackLength();
  }
});

/*
 * マウスクリック時は
 * 入力内容を全選択する。
 */
patternLengthInput.addEventListener(
  "click",
  event => {
    const isTouchInput =
  isTouchDevice() ||
  isTouchOrPen(
    patternLengthPointerType
  );

    if (isTouchInput) {
      event.preventDefault();

      patternLengthInput.blur();

      return;
    }

    patternLengthInput.select();
  }
);

function commitPatternLengthInput() {
  if (!patternLengthDirectEditing) {
    return;
  }

  const previousLength =
    getMaxTrackLength();

  const nextLength =
    Math.round(
      clamp(
        Number(
          patternLengthInput.value
        ) || 1,
        1,
        STEP_COUNT
      )
    );

  patternLengthDirectEditing =
    false;

  patternLengthInput.readOnly =
    true;

  delete patternLengthInput.dataset
    .keyboardEditing;

  if (
    nextLength !== previousLength
  ) {
    saveHistory();

    tracks.forEach(track => {
      track.stepLength =
        nextLength;
    });

    syncPatternLength();

    renderSequence();
    renderEditor();

    return;
  }

  patternLengthInput.value =
    previousLength;
}

function cancelPatternLengthInput() {
  patternLengthDirectEditing =
    false;

  patternLengthInput.readOnly =
    true;

  delete patternLengthInput.dataset
    .keyboardEditing;

  patternLengthInput.value =
    getMaxTrackLength();
}

patternLengthInput.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      /*
       * キーボードでフォーカスした状態から
       * Enterで編集開始。
       */
      if (
        patternLengthInput.readOnly
      ) {
        patternLengthEditStartValue =
          getMaxTrackLength();

        patternLengthDirectEditing =
          true;

        patternLengthInput.readOnly =
          false;

        patternLengthInput.dataset
          .keyboardEditing = "true";

        patternLengthInput.select();

        return;
      }

      commitPatternLengthInput();

      patternLengthInput.focus();

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();

      cancelPatternLengthInput();

      patternLengthInput.focus();
    }
  }
);

patternLengthInput.addEventListener(
  "blur",
  () => {
    if (patternLengthDirectEditing) {
      commitPatternLengthInput();
    }

    patternLengthInput.readOnly =
      true;

    delete patternLengthInput.dataset
      .keyboardEditing;
  }
);

function changeTrack(amount) {
  state.selectedTrackIndex = (state.selectedTrackIndex + amount + tracks.length) % tracks.length;
  render();
}

function displayBaseValue(parameter) {
  const track = selectedTrack();
  const value = track.base[parameter.id];

  if (parameter.id === "note") {
    const names = [
      "C", "C#", "D", "D#", "E", "F",
      "F#", "G", "G#", "A", "A#", "B"
    ];

    const midi = 60 + value;
    const noteName =
      names[(midi % 12 + 12) % 12];

    const octave =
      Math.floor(midi / 12) - 1;

    return `${noteName}${octave}`;
  }

  if (parameter.id === "pan") {
    if (value === 50) {
      return "C";
    }

    if (value < 50) {
      return `L${50 - value}`;
    }

    return `R${value - 50}`;
  }

  if (parameter.id === "probability") {
    return `${value}%`;
  }

  if (parameter.id === "filterCutoff") {
    if (value === 0) {
      return "OFF";
    }

    return value < 0
      ? `LP${Math.abs(value)}`
      : `HP${value}`;
  }

  if (parameter.id === "delayTime") {
  const delayNames = [
    "1/64",
    "1/32T",
    "1/32",
    "1/16T",
    "1/16",
    "1/8T",
    "1/8",
    "1/4T",
    "1/4",
    "1/2T",
    "1/2"
  ];

  return delayNames[value] ?? "1/16";
}

  if (parameter.id === "fmDepth") {
    return String(track.base.fmDepth);
  }

  return String(value);
}

function currentParentParameter(menuItem) {
  const track = selectedTrack();

  // ENV
  if (menuItem.parameter?.id === "envelope") {
    return parameterById(
      track.envelopeSelectedId ?? "decay"
    );
  }

  // OSC
  if (menuItem.parameter?.id === "osc") {
    switch (track.oscSelectedId ?? "sineVolume") {
      case "noiseVolume":
      case "noiseDecay":
        return parameterById("noiseVolume");

      case "sineDecay":
      default:
        return parameterById("sineVolume");
    }
  }

  return menuItem.parameter ??
         parameterById(menuItem.parameterId);
}

function parameterButton(menuItem) {
  const parameter =
  menuItem.parameter ??
  parameterById(menuItem.parameterId);

  const parentSweepParameter =
  parameter?.id === "lfo"
    ? parameterById(
        selectedTrack().lfoSelected === 2
          ? "lfo2Depth"
          : "lfo1Depth"
      )
    : parameter?.id === "osc"
      ? parameterById(
          selectedTrack().oscSelectedId ===
            "noiseVolume" ||
          selectedTrack().oscSelectedId ===
            "noiseDecay"
            ? "noiseVolume"
            : "sineVolume"
        )
      : parameter?.id === "envelope"
        ? parameterById(
            selectedTrack().envelopeSelectedId ??
            "decay"
          )
        : parameter;

  const button = document.createElement("button");

  button.type = "button";
  button.className = "parameter-button";

  const focusId =
    parameter?.id ??
    menuItem.placeholderId;

  button.dataset.focusKey =
    `parameter-${focusId}`;

  button.setAttribute(
    "aria-label",
    menuItem.label
  );

  const envelopeChildId =
    parameter?.id === "envelope"
      ? (
          envelopeParameter.children.some(
            child =>
              child.id ===
              selectedTrack().envelopeSelectedId
          )
            ? selectedTrack().envelopeSelectedId
            : "decay"
        )
      : null;

  const displayedParameter =
  parameter?.id === "lfo"
    ? parentSweepParameter
    : parameter?.id === "osc"
    ? parentSweepParameter
    : parameter?.id === "envelope"
      ? parameterById(
          envelopeChildId
        )
      : parameter;

  const displayedIcon =
  parameter?.id === "osc"
    ? (
        parentSweepParameter?.id ===
          "noiseVolume"
          ? "noise"
          : "sine"
      )
    : parameter?.id === "envelope"
      ? envelopeParameter.children.find(
          child =>
            child.id ===
            envelopeChildId
        )?.icon ?? "decay"
      : menuItem.icon;

  const valueText =
    displayedParameter
      ? displayBaseValue(
          displayedParameter
        )
      : menuItem.label;

  button.innerHTML = `
    <span class="parameter-icon${parameter?.id === "lfo" ? " lfo-menu-icon" : ""}">
      ${getParameterIcon(displayedIcon)}
      ${
        parameter?.id === "lfo"
          ? `<span class="lfo-menu-number">${selectedTrack().lfoSelected === 2 ? "2" : "1"}</span>`
          : ""
      }
    </span>

    <span class="parameter-value">
      ${valueText}
    </span>
  `;

  if (!parameter) {
  button.classList.add(
    "parameter-placeholder"
  );

  /*
   * 左端FXボタンだけは
   * プレースホルダーではなく、
   * FX一括ミュート操作として使う。
   */
  if (focusId === "fx") {
    button.classList.remove(
      "parameter-placeholder"
    );

    button.setAttribute(
      "aria-label",
      selectedTrack().fxMuted
        ? "全FXミュートを解除"
        : "ダブルタップで全FXをミュート"
    );

    let firstTapTime = 0;
    let resetTimer = null;

    function resetFxMuteTap() {
      firstTapTime = 0;

      if (resetTimer !== null) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }

      button.classList.remove(
        "delete-armed"
      );
    }

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();

        const track =
          selectedTrack();

        /*
         * ミュート中は
         * シングルタップで即解除。
         */
        if (track.fxMuted) {
          saveHistory();

          track.fxMuted = false;

          resetFxMuteTap();

          renderEditorAndRestore(
            "parameter-fx"
          );

          return;
        }

        const now =
          performance.now();

        /*
         * 1秒以内の2回目タップで
         * FX一括ミュート。
         */
        if (
          firstTapTime !== 0 &&
          now - firstTapTime <=
            DELETE_DOUBLE_TAP_INTERVAL
        ) {
          saveHistory();

          track.fxMuted = true;

          resetFxMuteTap();

          renderEditorAndRestore(
            "parameter-fx"
          );

          return;
        }

        /*
         * 1回目のタップ。
         * 消しゴムと同じく
         * 1秒間だけ待機表示する。
         */
        firstTapTime = now;

        button.classList.add(
          "delete-armed"
        );

        if (resetTimer !== null) {
          clearTimeout(resetTimer);
        }

        resetTimer =
          window.setTimeout(
            resetFxMuteTap,
            DELETE_DOUBLE_TAP_INTERVAL
          );
      }
    );

    button.addEventListener(
      "blur",
      resetFxMuteTap
    );

    return button;
  }

  button.setAttribute(
    "aria-disabled",
    "true"
  );

  return button;
}
    /*
 * 親パラアイコンの上下スイープ。
 */
if (parentSweepParameter) {
  let parentSweepHistorySaved =
    false;

  enableVerticalSweep({
    element: button,

    getValue: () => {
      return Number(
        selectedTrack().base[
          parentSweepParameter.id
        ]
      );
    },

    setValue: nextValue => {
      if (!parentSweepHistorySaved) {
        saveHistory();

        parentSweepHistorySaved =
          true;
      }

      const correctedValue =
        roundToStep(
          clamp(
            Number(nextValue),
            parentSweepParameter.min,
            parentSweepParameter.max
          ),
          parentSweepParameter.step ?? 1
        );

      selectedTrack().base[
        parentSweepParameter.id
      ] = correctedValue;

      const valueElement =
        button.querySelector(
          ".parameter-value"
        );

      if (valueElement) {
        valueElement.textContent =
          displayBaseValue(
            parentSweepParameter
          );
      }

      button.setAttribute(
        "aria-label",
        `${menuItem.label} ${
          displayBaseValue(
            parentSweepParameter
          )
        }`
      );
    },

    min: parentSweepParameter.min,
    max: parentSweepParameter.max,
    step:
      parentSweepParameter.step ?? 1,

    acceleration:
      parentSweepParameter.id !==
      "delayTime",

    /*
     * NOTEは短い移動では半音単位の精密操作、
     * 長い移動ではオクターブ移動しやすい加速にする。
     */
    accelerationStart:
      parentSweepParameter.id ===
        "note"
        ? 6
        : SWEEP_ACCELERATION_START,

    accelerationRate:
      parentSweepParameter.id ===
        "note"
        ? 0.08
        : SWEEP_ACCELERATION_RATE,

    onCommit: (
      startValue,
      currentValue,
      changed
    ) => {
      parentSweepHistorySaved =
        false;

      if (!changed) {
        return;
      }

      renderEditorAndRestore(
        `parameter-${focusId}`
      );
    }
  });
}

/*
 * ここから下はifの外。
 */
button.addEventListener(
  "click",
  () => {
    state.selectedParameterId =
      parameter.id;

    const activeId =
      parameter.id === "envelope"
        ? (
            envelopeParameter.children.some(
              child =>
                child.id ===
                selectedTrack().envelopeSelectedId
            )
              ? selectedTrack().envelopeSelectedId
              : "decay"
          )
        : parameter.id === "osc"
          ? (
              oscParameter.children.some(
                child =>
                  child.id ===
                  selectedTrack().oscSelectedId
              )
                ? selectedTrack().oscSelectedId
                : "sineVolume"
            )
          : parameter.id === "lfo"
            ? "settings"
            : (
                parameter.children?.[0]?.id ??
                parameter.id
              );

    state.selectedChildId =
      activeId;

    renderEditorAndRestore(
      parameter.id === "lfo"
        ? "edit-parameter-lfo"
        : `base-value-${activeId}`
    );
  }
);

return button;
}

function createTrackLengthInput(focusKey) {
  const track = selectedTrack();

  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "track-length-input";

  button.textContent =
    track.stepLength;

  button.dataset.focusKey =
    focusKey;

  button.setAttribute(
    "aria-label",
    `トラック${track.id}のステップ数`
  );

  /*
   * touch / penではスイープ専用。
   * mouse / keyboardでは直接入力可能。
   */
  let lastPointerType = null;

  button.addEventListener(
    "pointerdown",
    event => {
      lastPointerType =
        event.pointerType;
    }
  );

  /*
   * 上下スイープによる
   * Track Length変更。
   */
  let sweepHistorySaved = false;

  enableVerticalSweep({
    element: button,

    getValue: () => {
      return track.stepLength;
    },

    setValue: nextLength => {
      if (!sweepHistorySaved) {
        saveHistory();
        sweepHistorySaved = true;
      }

      track.stepLength =
        Math.round(nextLength);

      button.textContent =
        track.stepLength;

      syncPatternLength();
      renderSequence();
    },

    min: 1,
    max: STEP_COUNT,
    step: 1,

    pixelsPerStep: 20,
acceleration: false,
    onCommit: (
      startValue,
      currentValue,
      changed
    ) => {
      sweepHistorySaved = false;

      if (changed) {
        renderEditorAndRestore(
          focusKey
        );
      }
    }
  });

  /*
   * PCクリックまたは
   * キーボード操作時の直接入力。
   */
  button.addEventListener(
    "click",
    event => {
      const isTouchInput =
  isTouchDevice() ||
  isTouchOrPen(
    lastPointerType
  );

if (isTouchInput) {
  event.preventDefault();
  event.stopPropagation();
  return;
}

      const input =
        document.createElement("input");

      input.type = "number";
      input.className =
        "track-length-input";

      input.value =
        track.stepLength;

      input.min = "1";
      input.max =
        String(STEP_COUNT);
      input.step = "1";

      input.dataset.focusKey =
        focusKey;

      input.dataset.keyboardEditing =
        "true";

      input.setAttribute(
        "aria-label",
        `トラック${track.id}のステップ数`
      );

      button.replaceWith(input);

      input.focus();
      input.select();

      let finished = false;

      const finish =
        shouldCommit => {
          if (finished) {
            return;
          }

          finished = true;

          if (shouldCommit) {
            const previousLength =
              track.stepLength;

            const nextLength =
              Math.round(
                clamp(
                  Number(input.value) || 1,
                  1,
                  STEP_COUNT
                )
              );

            if (
              nextLength !==
              previousLength
            ) {
              saveHistory();

              track.stepLength =
                nextLength;

              syncPatternLength();
              renderSequence();
            }
          }

          renderEditorAndRestore(
            focusKey
          );
        };

      input.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter"
          ) {
            event.preventDefault();
            event.stopPropagation();

            finish(true);
          }

          if (
            event.key === "Escape"
          ) {
            event.preventDefault();
            event.stopPropagation();

            finish(false);
          }
        }
      );

      input.addEventListener(
        "blur",
        () => finish(true),
        { once: true }
      );
    }
  );

  return button;
}


function signedSwingValue(value) {
  const number =
    clamp(
      Math.round(Number(value) || 0),
      -8,
      8
    );

  return number > 0
    ? `+${number}`
    : String(number);
}

function createCompactValue({
  label,
  control,
  className = ""
}) {
  const wrapper =
    document.createElement("div");

  wrapper.className =
    `compact-value ${className}`.trim();

  control.classList.add(
    "compact-value-number"
  );

  const labelElement =
    document.createElement("span");

  labelElement.className =
    "compact-value-label";

  labelElement.textContent =
    label;

  wrapper.append(
    labelElement,
    control
  );

  return wrapper;
}

function createSwingControl(focusKey) {
  const track = selectedTrack();

  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "swing-value compact-value-number";

  button.dataset.focusKey =
    focusKey;

  button.textContent =
    signedSwingValue(
      track.swing
    );

  button.setAttribute(
    "aria-label",
    `トラック${track.id}のSwing ${signedSwingValue(track.swing)}`
  );

  let lastPointerType = null;
  let sweepHistorySaved = false;

  button.addEventListener(
    "pointerdown",
    event => {
      lastPointerType =
        event.pointerType;
    }
  );

  enableVerticalSweep({
    element: button,

    getValue: () =>
      track.swing,

    setValue: nextValue => {
      if (!sweepHistorySaved) {
        saveHistory();
        sweepHistorySaved = true;
      }

      track.swing =
        Math.round(nextValue);

      button.textContent =
        signedSwingValue(
          track.swing
        );

      button.setAttribute(
        "aria-label",
        `トラック${track.id}のSwing ${signedSwingValue(track.swing)}`
      );
    },

    min: -8,
    max: 8,
    step: 1,

    pixelsPerStep: 12,
    acceleration: false,

    onCommit: (
      startValue,
      currentValue,
      changed
    ) => {
      sweepHistorySaved = false;

      if (changed) {
        renderEditorAndRestore(
          focusKey
        );
      }
    }
  });

  button.addEventListener(
    "click",
    event => {
      const isTouchInput =
  isTouchDevice() ||
  isTouchOrPen(
    lastPointerType
  );

if (isTouchInput) {
  event.preventDefault();
  event.stopPropagation();
  return;
}

      const input =
        document.createElement(
          "input"
        );

      input.type = "number";
      input.className =
        "swing-value compact-value-number";

      input.value =
        track.swing;

      input.min = "-8";
      input.max = "8";
      input.step = "1";

      input.dataset.focusKey =
        focusKey;

      input.dataset.keyboardEditing =
        "true";

      input.setAttribute(
        "aria-label",
        `トラック${track.id}のSwing`
      );

      button.replaceWith(input);

      input.focus();
      input.select();

      let finished = false;

      const finish =
        shouldCommit => {
          if (finished) {
            return;
          }

          finished = true;

          if (shouldCommit) {
            const previousValue =
              track.swing;

            const nextValue =
              clamp(
                Math.round(
                  Number(input.value) ||
                  0
                ),
                -8,
                8
              );

            if (
              nextValue !==
              previousValue
            ) {
              saveHistory();

              track.swing =
                nextValue;
            }
          }

          renderEditorAndRestore(
            focusKey
          );
        };

      input.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter"
          ) {
            event.preventDefault();
            event.stopPropagation();

            finish(true);
          }

          if (
            event.key === "Escape"
          ) {
            event.preventDefault();
            event.stopPropagation();

            finish(false);
          }
        }
      );

      input.addEventListener(
        "blur",
        () => finish(true),
        { once: true }
      );
    }
  );

  return button;
}


function createTrackVolumeControl() {
  const track =
    selectedTrack();

  const parameter =
    parameterById(
      "velocity"
    );

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    "master-control track-volume-control";

  const offsetButton =
    document.createElement(
      "button"
    );

  offsetButton.type =
    "button";

  offsetButton.className =
    "master-volume-icon track-volume-icon";

  offsetButton.dataset.focusKey =
    "menu-volume-offset";

  offsetButton.setAttribute(
    "aria-label",
    "ボリュームオフセットを表示"
  );

  offsetButton.innerHTML =
    getParameterIcon(
      "volume"
    );

  offsetButton.addEventListener(
    "click",
    () => {
      state.selectedParameterId =
        "velocity";

      state.selectedChildId =
        "velocity";

      renderEditorAndRestore(
        "base-value-velocity"
      );
    }
  );

  const slider =
    document.createElement(
      "input"
    );

  slider.type =
    "range";

  slider.className =
    "track-volume-slider";

  slider.min =
    String(
      parameter.min
    );

  slider.max =
    String(
      parameter.max
    );

  slider.step =
    String(
      parameter.step ?? 1
    );

  slider.value =
    String(
      track.base.velocity
    );

  slider.dataset.focusKey =
    "menu-volume-base";

  slider.setAttribute(
    "aria-label",
    `トラック${track.id}のボリューム`
  );

  const output =
    document.createElement(
      "output"
    );

  output.className =
    "track-volume-value";

  output.value =
    String(
      track.base.velocity
    );

  output.textContent =
    String(
      track.base.velocity
    );

  let pointerId =
    null;

  let startX =
    0;

  let startValue =
    track.base.velocity;

  let currentValue =
    startValue;

  let historySaved =
    false;

  wrapper.style.touchAction =
    "none";

  function updateValue(
    nextValue
  ) {
    const correctedValue =
      clamp(
        Math.round(
          nextValue
        ),
        parameter.min,
        parameter.max
      );

    if (
      correctedValue ===
        currentValue
    ) {
      return;
    }

    if (!historySaved) {
      saveHistory();

      historySaved =
        true;
    }

    currentValue =
      correctedValue;

    track.base.velocity =
      correctedValue;

    slider.value =
      String(
        correctedValue
      );

    output.value =
      String(
        correctedValue
      );

    output.textContent =
      String(
        correctedValue
      );
  }

  wrapper.addEventListener(
    "pointerdown",
    event => {
      if (
        event.pointerType ===
          "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      const sliderRect =
        slider.getBoundingClientRect();

      const insideSlider =
        event.clientX >=
          sliderRect.left &&
        event.clientX <=
          sliderRect.right &&
        event.clientY >=
          sliderRect.top &&
        event.clientY <=
          sliderRect.bottom;

      if (!insideSlider) {
        return;
      }

      event.preventDefault();

      pointerId =
        event.pointerId;

      startX =
        event.clientX;

      startValue =
        track.base.velocity;

      currentValue =
        startValue;

      historySaved =
        false;

      wrapper.setPointerCapture(
        event.pointerId
      );
    }
  );

  wrapper.addEventListener(
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

      const dragWidth =
        Math.max(
          1,
          sliderRect.width * 2
        );

      const movementX =
        event.clientX -
        startX;

      const nextValue =
        startValue +
        (
          movementX /
          dragWidth
        ) *
        (
          parameter.max -
          parameter.min
        );

      updateValue(
        nextValue
      );
    }
  );

  function finishPointer(
    event
  ) {
    if (
      pointerId !==
        event.pointerId
    ) {
      return;
    }

    if (
      wrapper.hasPointerCapture(
        event.pointerId
      )
    ) {
      wrapper.releasePointerCapture(
        event.pointerId
      );
    }

    pointerId =
      null;

    /*
     * 最後に表示されていた値を
     * そのまま確定する。
     */
    track.base.velocity =
      currentValue;

    slider.value =
      String(
        currentValue
      );

    output.value =
      String(
        currentValue
      );

    output.textContent =
      String(
        currentValue
      );

    historySaved =
      false;
  }

  wrapper.addEventListener(
    "pointerup",
    finishPointer
  );

  wrapper.addEventListener(
    "pointercancel",
    finishPointer
  );

  /*
   * キーボードでは標準range操作。
   */
  slider.addEventListener(
    "input",
    () => {
      const nextValue =
        clamp(
          Number(
            slider.value
          ),
          parameter.min,
          parameter.max
        );

      if (
        nextValue ===
          track.base.velocity
      ) {
        return;
      }

      saveHistory();

      track.base.velocity =
        nextValue;

      currentValue =
        nextValue;

      output.value =
        String(
          nextValue
      );

      output.textContent =
        String(
          nextValue
      );
    }
  );

  wrapper.append(
    offsetButton,
    slider,
    output
  );

  return wrapper;
}

function renderMenu() {
  const header =
    document.createElement("div");

  header.className =
    "editor-header editor-header-two-row";

  const topRow =
    document.createElement("div");

  topRow.className =
    "editor-header-row editor-header-primary";

  topRow.innerHTML = `
    <button
      class="track-cycle"
      type="button"
      data-focus-key="menu-track"
    >
      <span class="track-icon">
        ${getParameterIcon("track")}
      </span>

      <span class="track-number">
        ${selectedTrack().id}
      </span>
    </button>

    <div class="editor-header-spacer"></div>

    <button
      class="mini-button mute ${selectedTrack().muted ? "active" : ""}"
      type="button"
      data-focus-key="menu-mute"
    >
      M
    </button>

    <button
      class="mini-button solo ${selectedTrack().solo ? "active" : ""}"
      type="button"
      data-focus-key="menu-solo"
    >
      S
    </button>
  `;

  topRow.appendChild(
    createTrackVolumeControl()
  );

  const bottomRow =
    document.createElement("div");

  bottomRow.className =
    "editor-header-row editor-header-secondary";

  const soundName =
    document.createElement("button");

  soundName.type = "button";
  soundName.dataset.focusKey =
    "menu-sound-name";

  soundName.className =
    "track-sound-name";

  soundName.textContent =
    selectedTrack().soundName ||
    `sound ${String(selectedTrack().id).padStart(2, "0")}`;

  soundName.setAttribute(
    "aria-label",
    `サウンド名 ${soundName.textContent}。プリセットを開く`
  );

  soundName.addEventListener(
    "click",
    openSoundPresetModal
  );

  const sequenceEraseButton =
    document.createElement("button");

  sequenceEraseButton.type =
    "button";

  sequenceEraseButton.className =
    "mini-button erase-button";

  sequenceEraseButton.dataset.focusKey =
    "menu-sequence-erase";

  sequenceEraseButton.setAttribute(
    "aria-label",
    "現在のトラックのシーケンスをダブルタップで全消去"
  );

  sequenceEraseButton.innerHTML =
    getParameterIcon("erase");

  enableDoubleTapAction({
    element:
      sequenceEraseButton,

    onDoubleTap: () => {
      const cleared =
        clearSelectedTrackSequence();

      if (!cleared) {
        return;
      }

      renderSequence();

      renderEditorAndRestore(
        "menu-sequence-erase"
      );
    }
  });

  const swingControl =
    createCompactValue({
      label: "sw",
      control:
        createSwingControl(
          "menu-track-swing"
        ),
      className:
        "track-swing-control"
    });

  const trackLengthControl =
    createCompactValue({
      label: "step",
      control:
        createTrackLengthInput(
          "menu-track-length"
        ),
      className:
        "track-step-control"
    });

  bottomRow.append(
    soundName,
    sequenceEraseButton,
    swingControl,
    trackLengthControl
  );

  header.append(
    topRow,
    bottomRow
  );

  topRow
    .querySelector(
      ".track-cycle"
    )
    .addEventListener(
      "click",
      () => {
        state.selectedTrackIndex =
          (
            state.selectedTrackIndex +
            1
          ) %
          tracks.length;

        renderSequence();

        renderEditorAndRestore(
          "menu-track"
        );
      }
    );

  topRow
    .querySelector(
      ".mute"
    )
    .addEventListener(
      "click",
      () => {
        selectedTrack().muted =
          !selectedTrack().muted;

        renderEditorAndRestore(
          "menu-mute"
        );
      }
    );

  topRow
    .querySelector(
      ".solo"
    )
    .addEventListener(
      "click",
      () => {
        selectedTrack().solo =
          !selectedTrack().solo;

        renderEditorAndRestore(
          "menu-solo"
        );
      }
    );

  const grid =
    document.createElement("div");

  grid.className =
    "parameter-menu";

  /*
 * パラメーターメニューを
 * 主音 / FXラック / 発音条件に分けて配置する。
 */
const soundParameterItems =
  parameterMenuItems.slice(0, 7);

const fxParameterItems =
  parameterMenuItems.slice(7, 13);

const timingParameterItems =
  parameterMenuItems.slice(13, 15);

/*
 * 1行目：主音パラメーター
 */
soundParameterItems.forEach(menuItem => {
  grid.appendChild(
    parameterButton(menuItem)
  );
});

/*
 * 2行目左側：FXラック
 */
const fxRack =
  document.createElement("div");

fxRack.className =
  selectedTrack().fxMuted
    ? "fx-parameter-rack fx-muted"
    : "fx-parameter-rack";

fxRack.setAttribute(
  "aria-label",
  "FX"
);

fxParameterItems.forEach(menuItem => {
  fxRack.appendChild(
    parameterButton(menuItem)
  );
});

grid.appendChild(fxRack);

/*
 * 2行目右側：発音条件パラメーター
 */
timingParameterItems.forEach(menuItem => {
  grid.appendChild(
    parameterButton(menuItem)
  );
});

  editor.append(
    header,
    grid
  );
}

function makeAdjustButton(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function editValueControl(parameter, id) {
  const track = selectedTrack();

  const childDefinition =
  parameter.children?.find(
    child => child.id === id
  );

const actualParameter =
  parameterById(id);

const definition = {
  min:
    childDefinition?.min ??
    actualParameter?.min ??
    parameter.min ??
    0,

  max:
    childDefinition?.max ??
    actualParameter?.max ??
    parameter.max ??
    100,

  step:
    childDefinition?.step ??
    actualParameter?.step ??
    parameter.step ??
    1
};

  const wrap =
    document.createElement("div");

  wrap.className =
    "value-control";

  const valueKey =
    `base-value-${id}`;

  const value =
    document.createElement("button");

  value.type = "button";
  value.className = "base-value";

  value.dataset.focusKey =
    valueKey;

  value.dataset.valueControl =
    "true";

  const delayNames = [
    "1/64",
    "1/32T",
    "1/32",
    "1/16T",
    "1/16",
    "1/8T",
    "1/8",
    "1/4T",
    "1/4",
    "1/2T",
    "1/2"
  ];

  function displayValue() {
    if (id === "delayTime") {
      return (
        delayNames[
          Math.round(
            track.base[id]
          )
        ] ?? "1/16"
      );
    }

    if (id === "filterCutoff") {
      const cutoffValue =
        Number(track.base[id]) || 0;

      if (cutoffValue === 0) {
        return "OFF";
      }

      return cutoffValue < 0
        ? `LP${Math.abs(cutoffValue)}`
        : `HP${cutoffValue}`;
    }

    return String(
      track.base[id]
    );
  }

  value.textContent =
    displayValue();

  /*
   * 最後に使用した入力機器を記録。
   *
   * touch / pen：
   * 上下スイープ専用。
   *
   * mouse / keyboard：
   * クリックまたはEnterで
   * 直接編集できる。
   */
  let lastPointerType = null;

  value.addEventListener(
    "pointerdown",
    event => {
      lastPointerType =
        event.pointerType;
    }
  );

  /*
   * スマホ・タブレット用の
   * ベース値上下スイープ。
   */
  let sweepHistorySaved = false;

  enableVerticalSweep({
    element: value,

    getValue: () => {
      return Number(
        track.base[id]
      );
    },

    setValue: nextValue => {
      if (!sweepHistorySaved) {
        saveHistory();

        sweepHistorySaved =
          true;
      }

      const finiteValue =
  Number.isFinite(Number(nextValue))
    ? Number(nextValue)
    : definition.min;

const clampedValue =
  clamp(
    finiteValue,
    definition.min,
    definition.max
  );

const correctedValue =
  id === "delayTime"
    ? Math.round(clampedValue)
    : roundToStep(
        clampedValue,
        definition.step
      );

track.base[id] =
  correctedValue;

      value.textContent =
        displayValue();
    },

    min: definition.min,
    max: definition.max,
    step: definition.step,

    /*
     * Delay Timeは選択肢が
     * 11段階だけなので加速しない。
     */
    acceleration:
      id !== "delayTime",

    accelerationStart:
      id === "note"
        ? 6
        : SWEEP_ACCELERATION_START,

    accelerationRate:
      id === "note"
        ? 0.08
        : SWEEP_ACCELERATION_RATE,

    onCommit: (
      startValue,
      currentValue,
      changed
    ) => {
      sweepHistorySaved =
        false;

      if (changed) {
        renderEditorAndRestore(
          valueKey
        );
      }
    }
  });

  /*
   * PCでの直接編集。
   *
   * スマホのタップでは
   * 入力欄も選択欄も開かない。
   */
  value.addEventListener(
    "click",
    event => {
      const isTouchInput =
        isTouchDevice() ||
        isTouchOrPen(
          lastPointerType
        );

      if (isTouchInput) {
        event.preventDefault();
        event.stopPropagation();

        return;
      }

      /*
       * Delay Timeは
       * 数値入力ではなく音価選択。
       */
      if (id === "delayTime") {
  const input =
    document.createElement(
      "input"
    );

  input.type = "text";
  input.readOnly = true;

  input.className =
    "base-input";

  input.dataset.focusKey =
    valueKey;

  input.dataset.keyboardEditing =
    "true";

  let currentIndex =
    clamp(
      Math.round(
        track.base[id] ?? 4
      ),
      definition.min,
      definition.max
    );

  const startIndex =
    currentIndex;

  input.value =
    delayNames[currentIndex];

  value.replaceWith(
    input
  );

  input.focus();
  input.select();

  let finished = false;

  const finish =
    shouldCommit => {
      if (finished) {
        return;
      }

      finished = true;

      if (shouldCommit) {
        const previousValue =
          track.base[id];

        if (
          currentIndex !==
          previousValue
        ) {
          saveHistory();

          track.base[id] =
            currentIndex;
        }
      } else {
        currentIndex =
          startIndex;
      }

      renderEditorAndRestore(
        valueKey
      );
    };

  input.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        event.stopPropagation();

        currentIndex =
          clamp(
            currentIndex + 1,
            definition.min,
            definition.max
          );

        input.value =
          delayNames[currentIndex];

        input.select();

        return;
      }

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        event.stopPropagation();

        currentIndex =
          clamp(
            currentIndex - 1,
            definition.min,
            definition.max
          );

        input.value =
          delayNames[currentIndex];

        input.select();

        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        finish(true);

        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        finish(false);
      }
    }
  );

  input.addEventListener(
    "blur",
    () => finish(true),
    { once: true }
  );

  return;
}

      /*
       * Delay Time以外は
       * 従来どおり数値入力。
       */
      const input =
        document.createElement(
          "input"
        );

      input.type = "number";

      input.value =
        track.base[id];

      input.min =
        String(definition.min);

      input.max =
        String(definition.max);

      input.step =
        String(definition.step);

      input.className =
        "base-input";

      input.dataset.focusKey =
        valueKey;

      input.dataset.keyboardEditing =
        "true";

      value.replaceWith(
        input
      );

      input.focus();
      input.select();

      let finished = false;

      const finish =
        shouldCommit => {
          if (finished) {
            return;
          }

          finished = true;

          if (shouldCommit) {
            const previousValue =
              track.base[id];

            let nextValue =
              clamp(
                Number(
                  input.value
                ) || 0,
                definition.min,
                definition.max
              );

            nextValue =
              roundToStep(
                nextValue,
                definition.step
              );

            if (
              nextValue !==
              previousValue
            ) {
              saveHistory();

              track.base[id] =
                nextValue;
            }
          }

          renderEditorAndRestore(
            valueKey
          );
        };

      input.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter"
          ) {
            event.preventDefault();
            event.stopPropagation();

            finish(true);

            return;
          }

          if (
            event.key === "Escape"
          ) {
            event.preventDefault();
            event.stopPropagation();

            finish(false);
          }
        }
      );

      input.addEventListener(
        "blur",
        () => finish(true),
        { once: true }
      );
    }
  );

  const label =
  document.createElement("span");

label.className =
  "compact-value-label";

label.textContent =
  "base";

const compact =
  document.createElement("div");

compact.className =
  "compact-value";

compact.append(
  label,
  value
);

wrap.appendChild(compact);

return wrap;
}

function displayStepValue(parameter, stepIndex) {
  const track = selectedTrack();
  const offset = track.offsets[parameter.id]?.[stepIndex] ?? 0;
  const result = clamp(track.base[parameter.id] + offset, parameter.min, parameter.max);
  if (parameter.id === "note") {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = 60 + result;
    return `${names[(midi % 12 + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  }
  if (parameter.id === "delayTime") {
  const delayNames = [
    "1/64",
    "1/32T",
    "1/32",
    "1/16T",
    "1/16",
    "1/8T",
    "1/8",
    "1/4T",
    "1/4",
    "1/2T",
    "1/2"
  ];

  return delayNames[result] ?? "1/16";
}
  if (parameter.offsetMode === "result") return String(result);
  return offset === 0 ? "·" : offset > 0 ? `+${offset}` : String(offset);
}

function renderOffsetGrid(parameter) {
  const grid =
    document.createElement("div");

  grid.className = "offset-grid";

  const firstStepIndex =
    state.sequencePage *
    PAGE_STEP_COUNT;

  const lastStepIndex = Math.min(
    firstStepIndex +
      PAGE_STEP_COUNT,
    selectedTrack().stepLength
  );

  for (
    let stepIndex = firstStepIndex;
    stepIndex < lastStepIndex;
    stepIndex++
  ) {
    const track = selectedTrack();

    const focusKey =
      `offset-${parameter.id}-${stepIndex}`;

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "offset-step";
    button.dataset.stepIndex =
      stepIndex;
    button.dataset.focusKey =
      focusKey;

    button.textContent =
      displayStepValue(
        parameter,
        stepIndex
      );

    if (track.steps[stepIndex]) {
      button.classList.add(
        "note-on"
      );
    }

    if (
  state.playbackTickIndex !== null &&
  stepIndex ===
    state.playbackTickIndex %
      track.stepLength
) {
  button.classList.add(
    "playing"
  );
}

    /*
     * 最後に使用した入力機器を記録。
     *
     * touch / pen：
     * タップでは数値入力を開かない。
     *
     * mouse / keyboard：
     * 従来どおり直接入力できる。
     */
    let lastPointerType = null;

    button.addEventListener(
      "pointerdown",
      event => {
        lastPointerType =
          event.pointerType;
      }
    );

    /*
     * 上下スイープによる
     * Offset値の変更。
     */
    let sweepHistorySaved = false;

    enableVerticalSweep({
      element: button,

      getValue: () => {
        return (
          track.offsets[
            parameter.id
          ]?.[stepIndex] ?? 0
        );
      },

      setValue: nextOffset => {
        /*
         * Undo履歴は
         * 1回のスイープにつき1回だけ保存。
         */
        if (!sweepHistorySaved) {
          saveHistory();
          sweepHistorySaved = true;
        }

        track.offsets[
          parameter.id
        ][stepIndex] =
          nextOffset;

        button.textContent =
          displayStepValue(
            parameter,
            stepIndex
          );
      },

      min:
        parameter.min -
        Number(
          track.base[
            parameter.id
          ]
        ),

      max:
        parameter.max -
        Number(
          track.base[
            parameter.id
          ]
        ),

      step:
        parameter.step ?? 1,

      accelerationStart:
        parameter.id === "note"
          ? 6
          : SWEEP_ACCELERATION_START,

      accelerationRate:
        parameter.id === "note"
          ? 0.08
          : SWEEP_ACCELERATION_RATE,

      onCommit: (
        startValue,
        currentValue,
        changed
      ) => {
        sweepHistorySaved = false;

        if (changed) {
          renderEditorAndRestore(
            focusKey
          );
        }
      }
    });

    /*
     * PCのマウスクリック、
     * またはキーボード操作時は
     * 数値入力へ切り替える。
     *
     * スマホのタップでは開かない。
     */
    button.addEventListener(
      "click",
      event => {
        const isTouchInput =
  isTouchOrPen(
    lastPointerType
  );

        if (isTouchInput) {
          event.preventDefault();
          return;
        }

        const currentOffset =
          track.offsets[
            parameter.id
          ]?.[stepIndex] ?? 0;

        const minimumOffset =
          parameter.min -
          Number(
            track.base[
              parameter.id
            ]
          );

        const maximumOffset =
          parameter.max -
          Number(
            track.base[
              parameter.id
            ]
          );

        const offsetStep =
          parameter.step ?? 1;

        const input =
          document.createElement(
            "input"
          );

        input.type = "number";
        input.className =
          "offset-step offset-input";

        input.value =
          currentOffset;

        input.step =
          String(offsetStep);

        input.min =
          String(minimumOffset);

        input.max =
          String(maximumOffset);

        input.dataset.stepIndex =
          stepIndex;

        input.dataset.focusKey =
          focusKey;

        input.dataset.keyboardEditing =
          "true";

        button.replaceWith(input);

        input.focus();
        input.select();

        let finished = false;

        const finish =
          shouldCommit => {
            if (finished) {
              return;
            }

            finished = true;

            if (shouldCommit) {
              const previousOffset =
                track.offsets[
                  parameter.id
                ]?.[stepIndex] ?? 0;

              let nextOffset =
                clamp(
                  Number(
                    input.value
                  ) || 0,
                  minimumOffset,
                  maximumOffset
                );

              nextOffset =
                roundToStep(
                  nextOffset,
                  offsetStep
                );

              if (
                nextOffset !==
                previousOffset
              ) {
                saveHistory();

                track.offsets[
                  parameter.id
                ][stepIndex] =
                  nextOffset;
              }
            }

            renderEditorAndRestore(
              focusKey
            );
          };

        input.addEventListener(
          "keydown",
          event => {
            if (
              event.key === "Enter"
            ) {
              event.preventDefault();
              event.stopPropagation();

              finish(true);
            }

            if (
              event.key === "Escape"
            ) {
              event.preventDefault();
              event.stopPropagation();

              finish(false);
            }
          }
        );

        input.addEventListener(
          "blur",
          () => finish(true),
          { once: true }
        );
      }
    );

    grid.appendChild(button);
  }

  return grid;
}


function renderOscEdit() {
  const track = selectedTrack();

  const activeId =
  oscParameter.children.some(
    child =>
      child.id ===
      state.selectedChildId
  )
    ? state.selectedChildId
    : oscParameter.children.some(
        child =>
          child.id ===
          track.oscSelectedId
      )
      ? track.oscSelectedId
      : "sineVolume";

  state.selectedChildId =
    activeId;

    track.oscSelectedId =
  activeId;

  const activeParameter =
    parameterById(activeId);

  const header =
    document.createElement("div");

  header.className =
    "edit-toolbar osc-edit-toolbar";

  const trackButton =
    document.createElement("button");

  trackButton.type = "button";
  trackButton.className =
    "track-cycle";

  trackButton.dataset.focusKey =
    "edit-track";

  trackButton.innerHTML = `
    <span class="track-icon">
      ${getParameterIcon("track")}
    </span>

    <span class="track-number">
      ${track.id}
    </span>
  `;

  trackButton.addEventListener(
    "click",
    () => {
      state.selectedTrackIndex =
        (
          state.selectedTrackIndex +
          1
        ) %
        tracks.length;

      renderSequence();

      renderEditorAndRestore(
        "edit-track"
      );
    }
  );

  const parentButton =
    document.createElement("button");

  parentButton.type = "button";
  parentButton.className =
    "edit-icon osc-parent-icon";

  parentButton.dataset.focusKey =
    "edit-parameter-osc";

  const activeSourceIcon =
  activeId === "noiseVolume" ||
  activeId === "noiseDecay"
    ? "noise"
    : "sine";

parentButton.innerHTML =
  getParameterIcon(
    activeSourceIcon
  );

  parentButton.setAttribute(
    "aria-label",
    "OSC編集を閉じる"
  );

  parentButton.addEventListener(
  "click",
  () => {
    track.oscSelectedId =
      activeId === "noiseVolume" ||
      activeId === "noiseDecay"
        ? "noiseVolume"
        : "sineVolume";

    state.selectedChildId =
      track.oscSelectedId;

    state.selectedParameterId =
      null;

    renderEditorAndRestore(
      "parameter-osc"
    );
  }
);

  const controls =
    document.createElement("div");

  controls.className =
    "osc-source-controls";

  function appendSourceGroup(
    sourceId,
    parameterIds
  ) {
    const group =
      document.createElement("div");

    group.className =
      "osc-source-group";

    const sourceIcon =
      document.createElement("span");

    sourceIcon.className =
      "osc-source-icon";

    sourceIcon.innerHTML =
      getParameterIcon(sourceId);

    sourceIcon.setAttribute(
      "aria-hidden",
      "true"
    );

    group.appendChild(
      sourceIcon
    );

    parameterIds.forEach(
      parameterId => {
        const definition =
          oscParameter.children.find(
            child =>
              child.id ===
              parameterId
          );

        const button =
          document.createElement(
            "button"
          );

        button.type = "button";

        button.className =
          "osc-child-button";

        button.dataset.focusKey =
          `child-${parameterId}`;

        button.textContent =
  definition.text;

        button.setAttribute(
          "aria-label",
          definition.label
        );

        if (
          activeId ===
          parameterId
        ) {
          button.classList.add(
            "active"
          );
        }

        button.addEventListener(
  "click",
  () => {
    track.oscSelectedId =
      parameterId;

    state.selectedChildId =
      parameterId;

    renderEditorAndRestore(
      `base-value-${parameterId}`
    );
  }
);

        group.appendChild(
          button
        );
      }
    );

    controls.appendChild(
      group
    );
  }

  appendSourceGroup(
    "sine",
    [
      "sineVolume",
      "sineDecay"
    ]
  );

  appendSourceGroup(
    "noise",
    [
      "noiseVolume",
      "noiseDecay"
    ]
  );

  header.append(
    trackButton,
    parentButton,
    controls
  );

  const offsetEraseButton =
    document.createElement("button");

  offsetEraseButton.type =
    "button";

  offsetEraseButton.className =
    "mini-button erase-button";

  offsetEraseButton.dataset.focusKey =
    "edit-offset-erase";

  offsetEraseButton.setAttribute(
    "aria-label",
    `${activeParameter.label}のOffsetをダブルタップで全消去`
  );

  offsetEraseButton.innerHTML =
    getParameterIcon("erase");

  const offsets =
    track.offsets[activeId];

  if (
    Array.isArray(offsets)
  ) {
    enableDoubleTapAction({
      element:
        offsetEraseButton,

      onDoubleTap: () => {
        const cleared =
          clearSelectedParameterOffsets(
            activeId
          );

        if (!cleared) {
          return;
        }

        renderEditorAndRestore(
          "edit-offset-erase"
        );
      }
    });

    header.appendChild(
      offsetEraseButton
    );
  }

  header.appendChild(
  editValueControl(
    envelopeParameter,
    activeId
  )
);

  editor.appendChild(
    header
  );

  editor.appendChild(
    renderOffsetGrid(
      activeParameter
    )
  );
}

function renderEnvelopeEdit() {
  const track =
    selectedTrack();

  const activeId =
    envelopeParameter.children.some(
      child =>
        child.id ===
        track.envelopeSelectedId
    )
      ? track.envelopeSelectedId
      : "decay";

  track.envelopeSelectedId =
    activeId;

  state.selectedChildId =
    activeId;

  const activeDefinition =
    envelopeParameter.children.find(
      child =>
        child.id ===
        activeId
    );

  const activeParameter =
    parameterById(activeId);

  const header =
    document.createElement("div");

  header.className =
    "edit-toolbar envelope-edit-toolbar";

  const trackButton =
    document.createElement("button");

  trackButton.type = "button";
  trackButton.className =
    "track-cycle";

  trackButton.dataset.focusKey =
    "edit-track";

  trackButton.innerHTML = `
    <span class="track-icon">
      ${getParameterIcon("track")}
    </span>

    <span class="track-number">
      ${track.id}
    </span>
  `;

  trackButton.addEventListener(
    "click",
    () => {
      state.selectedTrackIndex =
        (
          state.selectedTrackIndex +
          1
        ) %
        tracks.length;

      renderSequence();

      renderEditorAndRestore(
        "edit-track"
      );
    }
  );

  const parentButton =
    document.createElement("button");

  parentButton.type = "button";
  parentButton.className =
    "edit-icon envelope-parent-icon";

  parentButton.dataset.focusKey =
    "edit-parameter-envelope";

  parentButton.innerHTML =
    getParameterIcon(
      activeDefinition?.icon ??
      "decay"
    );

  parentButton.setAttribute(
    "aria-label",
    "エンベロープ編集を閉じる"
  );

  parentButton.addEventListener(
    "click",
    () => {
      state.selectedParameterId =
        null;

      renderEditorAndRestore(
        "parameter-envelope"
      );
    }
  );

  const controls =
    document.createElement("div");

  controls.className =
    "envelope-child-controls";

  envelopeParameter.children.forEach(
    definition => {
      const button =
        document.createElement(
          "button"
        );

      button.type = "button";

      button.className =
        "envelope-child-button";

      button.dataset.focusKey =
        `child-${definition.id}`;

      button.textContent =
        definition.text;

      button.setAttribute(
        "aria-label",
        definition.label
      );

      if (
        activeId ===
        definition.id
      ) {
        button.classList.add(
          "active"
        );
      }

      button.addEventListener(
        "click",
        () => {
          track.envelopeSelectedId =
            definition.id;

          state.selectedChildId =
            definition.id;

          renderEditorAndRestore(
            `base-value-${definition.id}`
          );
        }
      );

      controls.appendChild(
        button
      );
    }
  );

  header.append(
    trackButton,
    parentButton,
    controls
  );

  const offsetEraseButton =
    document.createElement("button");

  offsetEraseButton.type =
    "button";

  offsetEraseButton.className =
    "mini-button erase-button";

  offsetEraseButton.dataset.focusKey =
    "edit-offset-erase";

  offsetEraseButton.setAttribute(
    "aria-label",
    `${activeParameter.label}のOffsetをダブルタップで全消去`
  );

  offsetEraseButton.innerHTML =
    getParameterIcon("erase");

  if (
    Array.isArray(
      track.offsets[activeId]
    )
  ) {
    enableDoubleTapAction({
      element:
        offsetEraseButton,

      onDoubleTap: () => {
        const cleared =
          clearSelectedParameterOffsets(
            activeId
          );

        if (!cleared) {
          return;
        }

        renderEditorAndRestore(
          "edit-offset-erase"
        );
      }
    });

    header.appendChild(
      offsetEraseButton
    );
  }

  header.appendChild(
    editValueControl(
      activeParameter,
      activeId
    )
  );

  editor.appendChild(
    header
  );

  editor.appendChild(
    renderOffsetGrid(
      activeParameter
    )
  );
}

function renderFilterEdit() {
  const track = selectedTrack();

  const filterChildren = [
    {
      id: "filterCutoff",
      label: "cutoff"
    },
    {
      id: "filterResonance",
      label: "reso"
    }
  ];

  const activeId =
    filterChildren.some(
      child =>
        child.id ===
        state.selectedChildId
    )
      ? state.selectedChildId
      : "filterCutoff";

  state.selectedChildId = activeId;

  const activeParameter =
    parameterById(activeId);

  const header =
    document.createElement("div");

  header.className =
    "edit-toolbar filter-edit-toolbar";

  const trackButton =
    document.createElement("button");

  trackButton.type = "button";
  trackButton.className =
    "track-cycle";
  trackButton.dataset.focusKey =
    "edit-track";

  trackButton.innerHTML = `
    <span class="track-icon">
      ${getParameterIcon("track")}
    </span>
    <span class="track-number">
      ${track.id}
    </span>
  `;

  trackButton.addEventListener(
    "click",
    () => {
      state.selectedTrackIndex =
        (
          state.selectedTrackIndex +
          1
        ) % tracks.length;

      renderSequence();
      renderEditorAndRestore(
        "edit-track"
      );
    }
  );

  const parentButton =
    document.createElement("button");

  parentButton.type = "button";
  parentButton.className =
    "edit-icon filter-parent-icon";
  parentButton.dataset.focusKey =
    "edit-parameter-filterCutoff";
  parentButton.innerHTML =
    getParameterIcon("tone");
  parentButton.setAttribute(
    "aria-label",
    "フィルター編集を閉じる"
  );

  parentButton.addEventListener(
    "click",
    () => {
      state.selectedParameterId = null;
      renderEditorAndRestore(
        "parameter-filterCutoff"
      );
    }
  );

  const controls =
    document.createElement("div");

  controls.className =
    "filter-child-controls";

  filterChildren.forEach(
    definition => {
      const button =
        document.createElement(
          "button"
        );

      button.type = "button";
      button.className =
        "filter-child-button";
      button.dataset.focusKey =
        `child-${definition.id}`;
      button.textContent =
        definition.label;

      if (
        definition.id === activeId
      ) {
        button.classList.add(
          "active"
        );
      }

      button.addEventListener(
        "click",
        () => {
          state.selectedChildId =
            definition.id;

          renderEditorAndRestore(
            `base-value-${definition.id}`
          );
        }
      );

      controls.appendChild(button);
    }
  );

  header.append(
    trackButton,
    parentButton,
    controls
  );

  const eraseButton =
    document.createElement("button");

  eraseButton.type = "button";
  eraseButton.className =
    "mini-button erase-button";
  eraseButton.dataset.focusKey =
    "edit-offset-erase";
  eraseButton.innerHTML =
    getParameterIcon("erase");
  eraseButton.setAttribute(
    "aria-label",
    `${activeParameter.label}のOffsetをダブルタップで全消去`
  );

  enableDoubleTapAction({
    element: eraseButton,
    onDoubleTap: () => {
      if (
        !clearSelectedParameterOffsets(
          activeId
        )
      ) {
        return;
      }

      renderEditorAndRestore(
        "edit-offset-erase"
      );
    }
  });

  header.appendChild(eraseButton);
  header.appendChild(
    editValueControl(
      activeParameter,
      activeId
    )
  );

  editor.appendChild(header);
  editor.appendChild(
    renderOffsetGrid(
      activeParameter
    )
  );
}

function renderLfoEdit() {
  const track = selectedTrack();
  const activeLfo = track.lfoSelected === 2 ? 2 : 1;
  const activeView =
    state.selectedChildId === "depth" ||
    state.selectedChildId === "rate"
      ? state.selectedChildId
      : "settings";

  state.selectedChildId = activeView;

  const prefix = `lfo${activeLfo}`;
  const parameterKeys = {
    target: `${prefix}Target`,
    wave: `${prefix}Wave`,
    depth: `${prefix}Depth`,
    rate: `${prefix}Rate`,
    syncMode: `${prefix}SyncMode`
  };

  const header = document.createElement("div");
  header.className = "edit-toolbar lfo-edit-toolbar";

  const trackButton = document.createElement("button");
  trackButton.type = "button";
  trackButton.className = "track-cycle";
  trackButton.dataset.focusKey = "edit-track";
  trackButton.innerHTML = `
    <span class="track-icon">${getParameterIcon("track")}</span>
    <span class="track-number">${track.id}</span>
  `;
  trackButton.addEventListener("click", () => {
    state.selectedTrackIndex =
      (state.selectedTrackIndex + 1) % tracks.length;
    renderSequence();
    renderEditorAndRestore("edit-track");
  });

  const parentButton = document.createElement("button");
  parentButton.type = "button";
  parentButton.className = "edit-icon lfo-parent-icon";
  parentButton.dataset.focusKey = "edit-parameter-lfo";
  parentButton.innerHTML = getParameterIcon("lfo");
  parentButton.setAttribute("aria-label", "LFO編集を閉じる");
  parentButton.addEventListener("click", () => {
    state.selectedParameterId = null;
    renderEditorAndRestore("parameter-lfo");
  });

  header.append(trackButton, parentButton);

  [1, 2].forEach(lfoNumber => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lfo-switch-button";
    button.dataset.focusKey = `lfo-switch-${lfoNumber}`;
    button.textContent = String(lfoNumber);
    button.setAttribute("aria-label", `lfo ${lfoNumber}を選択`);
    if (activeLfo === lfoNumber) button.classList.add("active");
    button.addEventListener("click", () => {
      track.lfoSelected = lfoNumber;
      state.selectedChildId = "settings";
      renderEditorAndRestore(`lfo-switch-${lfoNumber}`);
    });
    header.appendChild(button);
  });

  ["depth", "rate"].forEach(id => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lfo-parameter-button";
    button.dataset.focusKey = `lfo-parameter-${id}`;
    button.textContent = id;
    button.setAttribute("aria-label", `lfo ${activeLfo} ${id}`);
    if (activeView === id) button.classList.add("active");
    button.addEventListener("click", () => {
      state.selectedChildId = id;
      renderEditorAndRestore(`lfo-parameter-${id}`);
    });
    header.appendChild(button);
  });

  const syncMode =
    track.base[parameterKeys.syncMode] === "bpm"
      ? "bpm"
      : "free";

  /*
   * bpm / freeはRateの単位と動作だけに関係するため、
   * Rate編集時だけ表示する。
   */
  if (activeView === "rate") {
    const syncButton =
      document.createElement("button");

    syncButton.type = "button";
    syncButton.className =
      "lfo-sync-button";

    syncButton.dataset.focusKey =
      "lfo-sync-mode";

    syncButton.textContent =
      syncMode;

    syncButton.setAttribute(
      "aria-label",
      `lfo ${activeLfo} rate ${syncMode}`
    );

    syncButton.addEventListener(
  "click",
  () => {
    saveHistory();

    const rateId =
      parameterKeys.rate;

    if (syncMode === "bpm") {
      /*
       * BPM → FREE
       * 現在の音価に近いHzへ変換する。
       */
      track.base[rateId] =
        bpmIndexToFreeRate(
          track.base[rateId]
        );

      track.base[
        parameterKeys.syncMode
      ] = "free";
    } else {
      /*
       * FREE → BPM
       * 現在のHzに最も近い音価へ変換する。
       */
      track.base[rateId] =
        freeRateToBpmIndex(
          track.base[rateId]
        );

      track.base[
        parameterKeys.syncMode
      ] = "bpm";
    }

    renderEditorAndRestore(
      "lfo-sync-mode"
    );
  }
);

    header.appendChild(
      syncButton
    );
  }

  if (activeView === "depth" || activeView === "rate") {
    const activeBaseId = parameterKeys[activeView];
    const sourceParameter =
  parameterById(
    activeBaseId
  );

const activeParameter =
  activeView === "rate" &&
  syncMode === "bpm"
    ? {
        ...sourceParameter,
        min: 0,
        max:
          LFO_BPM_RATE_NAMES.length -
          1,
        step: 1
      }
    : sourceParameter;

    const eraseButton = document.createElement("button");
    eraseButton.type = "button";
    eraseButton.className = "mini-button erase-button lfo-erase-button";
    eraseButton.dataset.focusKey = "edit-offset-erase";
    eraseButton.innerHTML = getParameterIcon("erase");
    eraseButton.setAttribute("aria-label", `${activeParameter.label}のOffsetをダブルタップで全消去`);
    enableDoubleTapAction({
      element: eraseButton,
      onDoubleTap: () => {
        if (!clearSelectedParameterOffsets(activeBaseId)) return;
        renderEditorAndRestore("edit-offset-erase");
      }
    });
    header.appendChild(eraseButton);

    const baseValue = document.createElement("button");
    baseValue.type = "button";
    baseValue.className = "base-value lfo-base-value";
    baseValue.dataset.focusKey = "lfo-base-value";

    const rateName = value => {
  const index =
    clamp(
      Math.round(
        Number(value) || 0
      ),
      0,
      LFO_BPM_RATE_NAMES.length - 1
    );

  return (
    LFO_BPM_RATE_NAMES[index] ??
    "1/4"
  );
};
    const updateBaseValue = () => {
      const value = track.base[activeBaseId];
      baseValue.textContent =
        activeView === "rate" && syncMode === "bpm"
          ? rateName(value)
          : activeView === "rate"
            ? `${(Number(value) / 10).toFixed(1)}Hz`
            : String(value);
    };
    updateBaseValue();
    /*
 * LFO Depth / Rate
 * キーボード編集。
 *
 * Enter：編集開始／確定
 * 矢印：値変更
 * Escape：キャンセル
 */
let keyboardEditing = false;
let keyboardStartValue =
  Number(
    track.base[activeBaseId]
  );

let keyboardValue =
  keyboardStartValue;

function displayKeyboardValue() {
  baseValue.textContent =
    activeView === "rate" &&
    syncMode === "bpm"
      ? rateName(
          keyboardValue
        )
      : activeView === "rate"
        ? `${(
            Number(
              keyboardValue
            ) / 10
          ).toFixed(1)}Hz`
        : String(
            keyboardValue
          );
}

function finishKeyboardEdit(
  shouldCommit
) {
  if (!keyboardEditing) {
    return;
  }

  keyboardEditing = false;

  delete baseValue.dataset
    .keyboardEditing;

  if (
    shouldCommit &&
    keyboardValue !==
      keyboardStartValue
  ) {
    saveHistory();

    track.base[activeBaseId] =
      keyboardValue;
  } else {
    keyboardValue =
      keyboardStartValue;
  }

  renderEditorAndRestore(
    "lfo-base-value"
  );
}

baseValue.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();
      event.stopPropagation();

      if (!keyboardEditing) {
        keyboardEditing = true;

        keyboardStartValue =
          Number(
            track.base[
              activeBaseId
            ]
          );

        keyboardValue =
          keyboardStartValue;

        baseValue.dataset
          .keyboardEditing =
            "true";

        return;
      }

      finishKeyboardEdit(
        true
      );

      return;
    }

    if (
      keyboardEditing &&
      (
        event.key ===
          "ArrowUp" ||
        event.key ===
          "ArrowRight" ||
        event.key ===
          "ArrowDown" ||
        event.key ===
          "ArrowLeft"
      )
    ) {
      event.preventDefault();
      event.stopPropagation();

      const amount =
        (
          event.key ===
            "ArrowUp" ||
          event.key ===
            "ArrowRight"
        )
          ? activeParameter.step ??
            1
          : -(
              activeParameter.step ??
              1
            );

      keyboardValue =
        roundToStep(
          clamp(
            keyboardValue +
              amount,
            activeParameter.min,
            activeParameter.max
          ),
          activeParameter.step ??
            1
        );

      displayKeyboardValue();

      return;
    }

    if (
      keyboardEditing &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();

      finishKeyboardEdit(
        false
      );
    }
  }
);

    let sweepHistorySaved = false;
    enableVerticalSweep({
      element: baseValue,
      getValue: () => Number(track.base[activeBaseId]),
      setValue: nextValue => {
        if (!sweepHistorySaved) {
          saveHistory();
          sweepHistorySaved = true;
        }
        track.base[activeBaseId] = roundToStep(
          clamp(Number(nextValue), activeParameter.min, activeParameter.max),
          activeParameter.step ?? 1
        );
        updateBaseValue();
      },
      min: activeParameter.min,
      max: activeParameter.max,
      step: activeParameter.step ?? 1,
      onCommit: (startValue, currentValue, changed) => {
        sweepHistorySaved = false;
        if (changed) renderEditorAndRestore("lfo-base-value");
      }
    });

    const baseValueWrapper =
  createCompactValue({
    label: "base",
    control: baseValue,
    className:
      "lfo-base-value-control"
  });

header.appendChild(
  baseValueWrapper
);

editor.append(
  header,
  renderOffsetGrid(
    activeParameter
  )
);
    return;
  }

  editor.appendChild(header);

  const settings = document.createElement("div");
  settings.className = "lfo-settings";
  const createSectionLabel = text => {
    const label = document.createElement("div");
    label.className = "lfo-settings-label";
    label.textContent = text;
    return label;
  };
  const setLfoOption = (baseId, value, focusKey) => {
    if (track.base[baseId] === value) return;
    saveHistory();
    track.base[baseId] = value;
    renderEditorAndRestore(focusKey);
  };

  const targetGrid = document.createElement("div");
  targetGrid.className = "lfo-target-grid";
  [
    ["pitch", "Pitch", "note"],
    ["fmDepth", "FM", "fm"],
    ["filterCutoff", "Filter", "tone"],
    ["pan", "Pan", "pan"],
    ["attack", "Attack", "attack"],
    ["decay", "Decay", "decay"]
  ].forEach(([value, label, icon]) => {
    const button = document.createElement("button");
    const focusKey = `lfo-target-${value}`;
    button.type = "button";
    button.className = "lfo-target-button";
    button.dataset.focusKey = focusKey;
    button.innerHTML = `<span class="lfo-target-icon">${getParameterIcon(icon)}</span>`;
    button.setAttribute("aria-label", label);
    const currentTarget = track.base[parameterKeys.target];
    if (
      currentTarget === value ||
      (value === "decay" && ["decay", "sineDecay", "noiseDecay"].includes(currentTarget)) ||
      (value === "attack" && currentTarget === "gate")
    ) button.classList.add("active");
    button.addEventListener("click", () => setLfoOption(parameterKeys.target, value, focusKey));
    targetGrid.appendChild(button);
  });

  function getWaveSvg(waveId) {
    const paths = {
      sine: `<path d="M2 14 C8 3 14 3 20 14 S32 25 38 14 S50 3 56 14 S68 25 74 14" />`,
      triangle: `<path d="M2 14 L11 5 L20 23 L29 5 L38 23 L47 5 L56 23 L65 5 L74 14" />`,
      sawUp: `<path d="M2 23 L20 5 L20 23 L38 5 L38 23 L56 5 L56 23 L74 5" />`,
      sawDown: `<path d="M2 5 L2 23 L20 5 L20 23 L38 5 L38 23 L56 5 L56 23 L74 5" />`,
      square: `<path d="M2 22 V6 H14 V22 H26 V6 H38 V22 H50 V6 H62 V22 H74" />`,
      random: `<path d="M2 18 H12 V8 H24 V21 H36 V11 H48 V5 H60 V19 H74" />`,
      rise: `<path d="M2 23 C10 23 14 18 20 12 S34 4 50 4 S66 4 74 4"/>`,
      fall: `<path d="M2 4 C10 4 14 9 20 15 S34 23 50 23 S66 23 74 23"/>`,
    };
    return `<svg viewBox="0 0 76 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[waveId] ?? paths.sine}</svg>`;
  }

  const waveGrid = document.createElement("div");
  waveGrid.className = "lfo-wave-grid";
  [
  ["sine", "Sine"],
  ["triangle", "Triangle"],
  ["sawUp", "Saw Up"],
  ["sawDown", "Saw Down"],
  ["square", "Square"],
  ["random", "Random"],
  ["rise", "Rise"],
  ["fall", "Fall"]
].forEach(([value, label]) => {
    const button = document.createElement("button");
    const focusKey = `lfo-wave-${value}`;
    button.type = "button";
    button.className = "lfo-wave-button";
    button.dataset.focusKey = focusKey;
    button.innerHTML = getWaveSvg(value);
    button.setAttribute("aria-label", label);
    if (track.base[parameterKeys.wave] === value) button.classList.add("active");
    button.addEventListener("click", () => setLfoOption(parameterKeys.wave, value, focusKey));
    waveGrid.appendChild(button);
  });

  settings.append(
    createSectionLabel("target"), targetGrid,
    createSectionLabel("wave"), waveGrid
  );
  editor.appendChild(settings);
}

function renderEdit(parameter) {
  const header = document.createElement("div");
  header.className = "edit-toolbar";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "track-cycle";
  back.dataset.focusKey = "edit-track";

  back.innerHTML = `
    <span class="track-icon">
      ${getParameterIcon("track")}
    </span>

    <span class="track-number">
      ${selectedTrack().id}
    </span>
  `;

  back.addEventListener("click", () => {
    state.selectedTrackIndex =
        (state.selectedTrackIndex + 1) %
        tracks.length;

    renderSequence();

    renderEditorAndRestore(
        "edit-track"
    );
});

  const icon = document.createElement("button");
  icon.type = "button";
  icon.className = "edit-icon";
  icon.dataset.focusKey = `edit-parameter-${parameter.id}`;

  icon.innerHTML =
    getParameterIcon(parameter.icon);

  icon.addEventListener("click", () => {
    state.selectedParameterId = null;

    renderEditorAndRestore(
      `parameter-${parameter.id}`
    );
  });

  header.append(back, icon);

  let activeId = parameter.id;

  if (parameter.children) {
    const tabs = document.createElement("div");
    tabs.className = "child-tabs";

    parameter.children.forEach(child => {
      const tab = document.createElement("button");

      tab.dataset.focusKey =
        `child-${child.id}`;

      tab.type = "button";
      tab.textContent = child.label;

      if (state.selectedChildId === child.id) {
        tab.classList.add("active");
      }

      tab.addEventListener("click", () => {
        state.selectedChildId = child.id;

        renderEditorAndRestore(
          `base-value-${child.id}`
        );
      });

      tabs.appendChild(tab);
    });

    header.appendChild(tabs);

    activeId =
      state.selectedChildId ||
      parameter.children[0].id;
  }

  const offsetEraseButton =
    document.createElement("button");

  offsetEraseButton.type = "button";
  offsetEraseButton.className =
    "mini-button erase-button";

  offsetEraseButton.dataset.focusKey =
    "edit-offset-erase";

  offsetEraseButton.setAttribute(
    "aria-label",
    `${parameter.label}のOffsetをダブルタップで全消去`
  );

  offsetEraseButton.innerHTML =
    getParameterIcon("erase");

  const activeChild =
    parameter.children?.find(
      item => item.id === activeId
    );

  const hasOffsets =
    !parameter.baseOnly &&
    !activeChild?.baseOnly &&
    Boolean(
      selectedTrack().offsets[
        parameter.id
      ]
    );

  if (hasOffsets) {
    enableDoubleTapAction({
      element: offsetEraseButton,

      onDoubleTap: () => {
        const cleared =
          clearSelectedParameterOffsets(
            parameter.id
          );

        if (!cleared) {
          return;
        }

        renderEditorAndRestore(
          "edit-offset-erase"
        );
      }
    });

    header.appendChild(
      offsetEraseButton
    );
  }

  header.appendChild(
    editValueControl(parameter, activeId)
  );

  editor.appendChild(header);

  const child =
    parameter.children?.find(
      item => item.id === activeId
    );

  const baseOnly =
    parameter.baseOnly ||
    child?.baseOnly;

  if (
    !baseOnly &&
    selectedTrack().offsets[parameter.id]
  ) {
    editor.appendChild(
      renderOffsetGrid(parameter)
    );
  }
}


function restorePatternFocus(focusKey) {
  restoreFocusKey(focusKey);
}

export function renderPatternManager() {
  if (!patternGrid || !sectionList) {
    return;
  }

  patternGrid.innerHTML = "";
    function enablePatternSourceDrag(
    button,
    sourceType,
    sourceIndex
  ) {
    const DRAG_START_DISTANCE = 6;

    let pointerId = null;
    let startX = 0;
    let startY = 0;

    let grabOffsetX = 0;
    let grabOffsetY = 0;

    let dragging = false;
    let suppressClick = false;
    let dragGhost = null;

    button.style.touchAction = "none";

    function updateDragGhost(event) {
      if (!dragGhost) {
        return;
      }

      dragGhost.style.left =
        `${
          event.clientX -
          grabOffsetX
        }px`;

      dragGhost.style.top =
        `${
          event.clientY -
          grabOffsetY
        }px`;
    }

    function createDragGhost(event) {
      document
        .querySelectorAll(
          ".pattern-source-drag-ghost"
        )
        .forEach(
          ghost => ghost.remove()
        );

      const rect =
        button.getBoundingClientRect();

      dragGhost =
        button.cloneNode(true);

      dragGhost.classList.add(
        "section-drag-ghost",
        "pattern-source-drag-ghost"
      );

      dragGhost.removeAttribute(
        "data-focus-key"
      );

      dragGhost.tabIndex = -1;

      dragGhost.style.width =
        `${rect.width}px`;

      dragGhost.style.height =
        `${rect.height}px`;

      grabOffsetX =
        event.clientX - rect.left;

      grabOffsetY =
        event.clientY - rect.top;

      document.body.appendChild(
        dragGhost
      );

      updateDragGhost(event);
    }

    function removeDragGhost() {
      dragGhost?.remove();
      dragGhost = null;
    }

    function isPointerInsideSection(
      event
    ) {
      const rect =
        sectionContents
          .getBoundingClientRect();

      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    }

    function handlePointerMove(event) {
      if (
        pointerId !==
        event.pointerId
      ) {
        return;
      }

      const distanceX =
        event.clientX - startX;

      const distanceY =
        event.clientY - startY;

      if (
        !dragging &&
        Math.hypot(
          distanceX,
          distanceY
        ) <
          DRAG_START_DISTANCE
      ) {
        return;
      }

      if (!dragging) {
        dragging = true;
        suppressClick = true;

        button.classList.add(
          "section-drag-origin"
        );

        createDragGhost(event);
      }

      event.preventDefault();

      updateDragGhost(event);

      const overSection =
        isPointerInsideSection(
          event
        );

      sectionContents.classList.toggle(
        "dragging",
        overSection
      );
    }

    function removeWindowListeners() {
      window.removeEventListener(
        "pointermove",
        handlePointerMove,
        true
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp,
        true
      );

      window.removeEventListener(
        "pointercancel",
        handlePointerCancel,
        true
      );
    }

    function finishDrag(
      event,
      cancelled
    ) {
      if (
        pointerId !==
        event.pointerId
      ) {
        return;
      }

      removeWindowListeners();

      if (
        button.hasPointerCapture(
          event.pointerId
        )
      ) {
        button.releasePointerCapture(
          event.pointerId
        );
      }

      pointerId = null;

      const droppedOnSection =
        dragging &&
        !cancelled &&
        isPointerInsideSection(
          event
        );

      button.classList.remove(
        "section-drag-origin"
      );

      sectionContents.classList.remove(
        "dragging"
      );

      removeDragGhost();

      if (!droppedOnSection) {
        dragging = false;
        return;
      }

      const editingSection =
        currentEditingSection();

      if (
        !editingSection ||
        editingSection.sequence.length >=
          7
      ) {
        dragging = false;
        return;
      }

      saveHistory();

      const added =
        addSourceToSection(
          sourceType,
          sourceIndex
        );

      dragging = false;

      if (!added) {
        return;
      }

      renderPatternManager();

      restorePatternFocus(
        "section-contents"
      );
    }

    function handlePointerUp(event) {
      finishDrag(
        event,
        false
      );
    }

    function handlePointerCancel(event) {
      finishDrag(
        event,
        true
      );
    }

    button.addEventListener(
      "pointerdown",
      event => {
        if (event.button !== 0) {
          return;
        }

        pointerId =
          event.pointerId;

        startX =
          event.clientX;

        startY =
          event.clientY;

        dragging = false;
        suppressClick = false;

        button.setPointerCapture(
          event.pointerId
        );

        removeWindowListeners();

        window.addEventListener(
          "pointermove",
          handlePointerMove,
          true
        );

        window.addEventListener(
          "pointerup",
          handlePointerUp,
          true
        );

        window.addEventListener(
          "pointercancel",
          handlePointerCancel,
          true
        );
      }
    );

    button.addEventListener(
      "click",
      event => {
        if (!suppressClick) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        suppressClick = false;
      },
      true
    );
  }

  /*
   * Pattern 24個 + Fill 6個
   *
   * 01 02 03 04 05 06 07 08 F1 F2
   * 09 10 11 12 13 14 15 16 F3 F4
   * 17 18 19 20 21 22 23 24 F5 F6
   */
  const firstPatternIndex =
  patternManagerPage *
  PATTERNS_PER_PAGE;

const firstFillIndex =
  patternManagerPage *
  FILLS_PER_PAGE;

/*
 * 1ページ目
 *
 * 01 02 03 04 05 06 F1 F2
 * 07 08 09 10 11 12 F3 F4
 *
 * 2ページ目
 *
 * 13 14 15 16 17 18 F5 F6
 * 19 20 21 22 23 24 F7 F8
 */
for (
  let row = 0;
  row < 2;
  row++
) {
  for (
    let column = 0;
    column < 8;
    column++
  ) {
    const isFill =
      column >= 6;

    const slotIndex =
      isFill
        ? firstFillIndex +
          row * 2 +
          (column - 6)
        : firstPatternIndex +
          row * 6 +
          column;

    const button =
      document.createElement(
        "button"
      );

    button.type = "button";

    button.className =
      isFill
        ? "pattern-cell fill-cell"
        : "pattern-cell";

    if (isFill) {
  button.textContent =
    `f${slotIndex + 1}`;

  button.dataset.focusKey =
    `fill-${slotIndex}`;

  button.setAttribute(
    "aria-label",
    `fill ${slotIndex + 1}`
  );

  /*
   * 現在選択中のFill。
   */
  if (
    state.selectedSourceType ===
      "fill" &&
    state.selectedFillIndex ===
      slotIndex
  ) {
    button.classList.add(
      "active"
    );
  }

  /*
   * 次回再生予約中のFill。
   */
  if (
    state.queuedSourceType ===
      "fill" &&
    state.queuedFillIndex ===
      slotIndex
  ) {
    button.classList.add(
      "queued"
    );
  }

    } else {
      button.textContent =
        String(slotIndex + 1)
          .padStart(2, "0");

      button.dataset.focusKey =
        `pattern-${slotIndex}`;

      button.setAttribute(
        "aria-label",
        `pattern ${slotIndex + 1}`
      );

      if (
  state.selectedSourceType ===
    "pattern" &&
  state.selectedPatternIndex ===
    slotIndex
) {
  button.classList.add(
    "active"
  );
}
if (
  state.queuedSourceType ===
    "pattern" &&
  state.queuedPatternIndex ===
    slotIndex
) {
  button.classList.add(
    "queued"
  );
}
    }

    button.addEventListener(
  "click",
  () => {
    if (isFill) {
      /*
       * Fill予約は次段階で実装。
       * 現時点では停止中のみ即切替。
       */
      if (state.isPlaying) {
    queueFill(slotIndex);

    renderPatternManager();

    restorePatternFocus(
        `fill-${slotIndex}`
    );

    return;
}

      selectFill(
        slotIndex
      );

      render();

      restorePatternFocus(
        `fill-${slotIndex}`
      );

      return;
    }

    /*
     * 再生中は即時切替せず、
     * 次回Pattern予約にする。
     */
    if (state.isPlaying) {
      queuePattern(
        slotIndex
      );

      renderPatternManager();

      restorePatternFocus(
        `pattern-${slotIndex}`
      );

      return;
    }

    /*
     * 停止中は従来どおり
     * 即時に編集対象を切り替える。
     */
    selectPattern(
      slotIndex
    );

    render();

    restorePatternFocus(
      `pattern-${slotIndex}`
    );
  }
);

enablePatternSourceDrag(
  button,
  isFill
    ? "fill"
    : "pattern",
  slotIndex
);

    patternGrid.appendChild(
      button
    );
  }
}

  /*
   * Section選択ブロック
   * A～Jを1列10マスで表示
   */
  const sectionSelector =
    document.createElement("div");

  sectionSelector.className =
    "section-selector";

  const firstSectionIndex =
  patternManagerPage *
  SECTIONS_PER_PAGE;

const visibleSections =
  sections.slice(
    firstSectionIndex,
    firstSectionIndex +
      SECTIONS_PER_PAGE
  );

visibleSections.forEach(
  (
    section,
    visibleIndex
  ) => {
    const sectionIndex =
      firstSectionIndex +
      visibleIndex;

    const sectionLabel =
      String.fromCharCode(
        65 + sectionIndex
      );

    const button =
      document.createElement(
        "button"
      );

    button.type = "button";
    button.className =
      "section-selector-cell";

    button.textContent =
      sectionLabel;

    button.dataset.focusKey =
      `section-${sectionIndex}`;

    button.setAttribute(
      "aria-label",
      `section ${sectionLabel}`
    );

    /*
 * 現在再生中のSection。
 */
if (
  state.playingSectionIndex ===
    sectionIndex
) {
  button.classList.add(
    "active"
  );
}

/*
 * 次回予約中のSection。
 */
if (
  state.queuedSectionIndex ===
    sectionIndex
) {
  button.classList.add(
    "queued"
  );
}

    button.addEventListener(
  "click",
  () => {
    /*
     * 再生中は、
     * 次回Section予約にする。
     */
    if (state.isPlaying) {
      queueSection(
        sectionIndex
      );

      renderPatternManager();

      restorePatternFocus(
        `section-${sectionIndex}`
      );

      return;
    }

    /*
     * 停止中は、
     * 次回再生するSectionを選択する。
     *
     * 編集対象Sectionは変更しない。
     */
    selectSection(
      sectionIndex
    );

    renderPatternManager();

    restorePatternFocus(
      `section-${sectionIndex}`
    );
  }
);

    sectionSelector.appendChild(
      button
    );
  }
);

  /*
   * 選択中Sectionの中身
   */
  sectionList.innerHTML = "";

  const selectedSection =
   currentEditingSection();

   const sectionEditorButton =
   document.createElement("button");

   sectionEditorButton.type =
   "button";

   sectionEditorButton.className =
   "section-editor-button";

   sectionEditorButton.dataset.focusKey =
   "section-editor";

   function sectionLabelFromIndex(
   sectionIndex
   ) {
   return String.fromCharCode(
    65 + sectionIndex
  );
}

function updateSectionEditorButton() {
  const sectionIndex =
   state.editingSectionIndex;

  const sectionLabel =
  currentEditingSectionLabel();

  sectionEditorButton.textContent =
    sectionLabel;

  sectionEditorButton.setAttribute(
    "aria-label",
    `編集中のセクション ${sectionLabel}`
  );
}

enableVerticalSweep({
  element:
    sectionEditorButton,

  getValue: () =>
    state.editingSectionIndex,

  setValue: nextIndex => {
    selectEditingSection(
      nextIndex
    );

    updateSectionEditorButton();
  },

  min: 0,
  max:
    SECTION_SLOT_COUNT - 1,

  step: 1,

  acceleration: false,

  onCommit: (
    startValue,
    currentValue,
    changed
  ) => {
    if (!changed) {
      return;
    }

    renderPatternManager();

    restorePatternFocus(
      "section-editor"
    );
  }
});

let sectionKeyboardEditing =
  false;

let sectionKeyboardStartIndex =
  state.editingSectionIndex;

sectionEditorButton.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      /*
       * 1回目のEnter
       * → 編集開始
       */
      if (!sectionKeyboardEditing) {
        sectionKeyboardEditing =
          true;

        sectionKeyboardStartIndex =
          state.editingSectionIndex;

        sectionEditorButton.dataset
          .keyboardEditing = "true";

        return;
      }

      /*
       * 2回目のEnter
       * → 現在のSectionで確定
       */
      sectionKeyboardEditing =
        false;

      delete sectionEditorButton.dataset
        .keyboardEditing;

      renderPatternManager();

      restorePatternFocus(
        "section-editor"
      );

      return;
    }

    /*
     * 編集中の上下キー
     */
    if (
      sectionKeyboardEditing &&
      (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      )
    ) {
      event.preventDefault();
      event.stopPropagation();

      const amount =
        event.key === "ArrowUp"
          ? 1
          : -1;

      changeEditingSection(
        amount
      );

      updateSectionEditorButton();

      return;
    }

    /*
     * Escape
     * → 編集開始前のSectionへ戻す
     */
    if (
      sectionKeyboardEditing &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();

      selectEditingSection(
        sectionKeyboardStartIndex
      );

      sectionKeyboardEditing =
        false;

      delete sectionEditorButton.dataset
        .keyboardEditing;

      updateSectionEditorButton();

      renderPatternManager();

      restorePatternFocus(
        "section-editor"
      );
    }
  }
);

updateSectionEditorButton();
  const sectionContents =
  document.createElement("div");

sectionContents.className =
  "section-contents";

sectionContents.tabIndex = 0;

sectionContents.dataset.focusKey =
  "section-contents";

sectionContents.dataset.sectionIndex =
  String(
    state.editingSectionIndex
  );

sectionContents.setAttribute(
  "role",
  "button"
);

sectionContents.setAttribute(
  "aria-label",
  "選択中のパターンまたはフィルをセクションへ追加"
);

function addSelectedSourceToSection() {
  /*
   * 7個埋まっている場合は
   * 履歴も保存しない。
   */
  const editingSection =
    currentEditingSection();

  if (
    !editingSection ||
    editingSection.sequence.length >= 7
  ) {
    return;
  }

  saveHistory();

  const added =
    addCurrentSourceToSection();

  if (!added) {
    return;
  }

  renderPatternManager();

  restorePatternFocus(
    "section-contents"
  );
}

sectionContents.addEventListener(
  "click",
  event => {
    if (
      event.target.closest(
        ".section-pattern-cell"
      )
    ) {
      return;
    }

    addSelectedSourceToSection();
  }
);

sectionContents.addEventListener(
  "keydown",
  event => {
    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    addSelectedSourceToSection();
  }
);
const SECTION_DELETE_DISTANCE = 24;
const SECTION_DRAG_START_DISTANCE = 6;

function refreshSectionItemIndexes() {
  sectionContents
    .querySelectorAll(
      ".section-pattern-cell"
    )
    .forEach(
      (
        sectionItem,
        itemIndex
      ) => {
        sectionItem.dataset.itemIndex =
          String(itemIndex);

        sectionItem.dataset.focusKey =
          `section-source-${itemIndex}`;
      }
    );
}

function enableSectionItemDrag(
  item,
  initialItemIndex
) {
  let pointerId = null;

  let startX = 0;
  let startY = 0;

  let grabOffsetX = 0;
  let grabOffsetY = 0;

  let currentItemIndex =
    initialItemIndex;

  let dragging = false;
  let historySaved = false;
  let suppressClick = false;

  let dragGhost = null;
    function handleWindowPointerUp(
    event
  ) {
    finishDrag(
      event,
      false
    );
  }

  function handleWindowPointerCancel(
    event
  ) {
    finishDrag(
      event,
      true
    );
  }

  function removeWindowDragListeners() {
  window.removeEventListener(
    "pointermove",
    handlePointerMove,
    true
  );

  window.removeEventListener(
    "pointerup",
    handleWindowPointerUp,
    true
  );

  window.removeEventListener(
    "pointercancel",
    handleWindowPointerCancel,
    true
  );
}

  item.style.touchAction = "none";

  item.dataset.itemIndex =
    String(initialItemIndex);

  function createDragGhost(event) {
        /*
     * 万一前回のゴーストが
     * 残っていても先に除去する。
     */
    document
      .querySelectorAll(
        ".section-drag-ghost"
      )
      .forEach(
        ghost => ghost.remove()
      );
    const rect =
      item.getBoundingClientRect();

    dragGhost =
      item.cloneNode(true);

    dragGhost.classList.add(
      "section-drag-ghost"
    );

    dragGhost.removeAttribute(
      "data-focus-key"
    );

    dragGhost.tabIndex = -1;

    dragGhost.style.width =
      `${rect.width}px`;

    dragGhost.style.height =
      `${rect.height}px`;

    grabOffsetX =
      event.clientX - rect.left;

    grabOffsetY =
      event.clientY - rect.top;

    document.body.appendChild(
      dragGhost
    );

    updateDragGhost(event);
  }

  function updateDragGhost(event) {
    if (!dragGhost) {
      return;
    }

    dragGhost.style.left =
      `${
        event.clientX -
        grabOffsetX
      }px`;

    dragGhost.style.top =
      `${
        event.clientY -
        grabOffsetY
      }px`;
  }

  function removeDragGhost() {
    dragGhost?.remove();
    dragGhost = null;
  }

  function moveItemToPointer(
    pointerX
  ) {
    /*
     * ドラッグ中のセルを除いた
     * 残りのセル。
     */
    const otherItems =
      Array.from(
        sectionContents.querySelectorAll(
          ".section-pattern-cell"
        )
      ).filter(
        sectionItem =>
          sectionItem !== item
      );

    /*
     * ポインターが何個のセル中心を
     * 通過しているかで挿入位置を決める。
     *
     * これにより1回のpointermoveで
     * 複数セル先まで移動できる。
     */
    let targetIndex = 0;

    otherItems.forEach(
      otherItem => {
        const rect =
          otherItem
            .getBoundingClientRect();

        const centerX =
          rect.left +
          rect.width / 2;

        if (
          pointerX >
          centerX
        ) {
          targetIndex += 1;
        }
      }
    );

    targetIndex =
      Math.max(
        0,
        Math.min(
          targetIndex,
          otherItems.length
        )
      );

    if (
      targetIndex ===
      currentItemIndex
    ) {
      return;
    }

    if (!historySaved) {
      saveHistory();
      historySaved = true;
    }

    const moved =
      moveSectionSource(
        currentItemIndex,
        targetIndex
      );

    if (!moved) {
      return;
    }

    /*
     * 配列と同じ位置へ
     * DOM上のセルも移動する。
     */
    const referenceItem =
      otherItems[targetIndex];

    if (referenceItem) {
      sectionContents.insertBefore(
        item,
        referenceItem
      );
    } else {
      sectionContents.appendChild(
        item
      );
    }

    currentItemIndex =
      targetIndex;

    refreshSectionItemIndexes();
  }

  item.addEventListener(
    "pointerdown",
    event => {
      if (
        event.pointerType ===
          "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      pointerId =
        event.pointerId;

      startX =
        event.clientX;

      startY =
        event.clientY;

      currentItemIndex =
        Number(
          item.dataset.itemIndex
        );

      dragging = false;
      historySaved = false;
      suppressClick = false;

      item.setPointerCapture(
        event.pointerId
      );
            /*
       * DOM並び替えでPointer Captureが
       * 外れても終了処理できるようにする。
       */
      removeWindowDragListeners();

      window.addEventListener(
        "pointermove",
        handlePointerMove,
        true
      );

      window.addEventListener(
        "pointerup",
        handleWindowPointerUp,
        true
      );

      window.addEventListener(
        "pointercancel",
        handleWindowPointerCancel,
        true
      );
    }
  );

   function handlePointerMove(
    event
  ) {
    if (
      pointerId !==
      event.pointerId
    ) {
      return;
    }

    const distanceX =
      event.clientX - startX;

    const distanceY =
      event.clientY - startY;

    if (
      !dragging &&
      Math.hypot(
        distanceX,
        distanceY
      ) <
        SECTION_DRAG_START_DISTANCE
    ) {
      return;
    }

    if (!dragging) {
      dragging = true;
      suppressClick = true;

      item.classList.add(
        "section-drag-origin"
      );

      sectionContents.classList.add(
        "dragging"
      );

      createDragGhost(event);
    }

    event.preventDefault();

    updateDragGhost(event);

    moveItemToPointer(
      event.clientX
    );

    const sectionRect =
      sectionContents
        .getBoundingClientRect();

    const outsideVertically =
      event.clientY <
        sectionRect.top -
          SECTION_DELETE_DISTANCE ||
      event.clientY >
        sectionRect.bottom +
          SECTION_DELETE_DISTANCE;

    sectionContents.classList.toggle(
      "delete-ready",
      outsideVertically
    );

    dragGhost?.classList.toggle(
      "delete-ready",
      outsideVertically
    );
  }

    function finishDrag(
    event,
    cancelled = false
  ) {
    if (
      pointerId !==
      event.pointerId
    ) {
      return;
    }

    removeWindowDragListeners();

    if (
      item.hasPointerCapture(
        event.pointerId
      )
    ) {
      item.releasePointerCapture(
        event.pointerId
      );
    }

       pointerId = null;

    if (!dragging) {
      removeDragGhost();
      return;
    }

    const sectionRect =
      sectionContents
        .getBoundingClientRect();

    const outsideVertically =
      !cancelled &&
      (
        event.clientY <
          sectionRect.top -
            SECTION_DELETE_DISTANCE ||
        event.clientY >
          sectionRect.bottom +
            SECTION_DELETE_DISTANCE
      );

    if (outsideVertically) {
      if (!historySaved) {
        saveHistory();
        historySaved = true;
      }

      removeSectionSource(
        currentItemIndex
      );
    }

    item.classList.remove(
      "section-drag-origin"
    );

    sectionContents.classList.remove(
      "dragging",
      "delete-ready"
    );

    removeDragGhost();

    renderPatternManager();

    restorePatternFocus(
      outsideVertically
        ? "section-contents"
        : `section-source-${currentItemIndex}`
    );
  }

  item.addEventListener(
    "pointerup",
    event => {
      finishDrag(
        event,
        false
      );
    }
  );

  item.addEventListener(
    "pointercancel",
    event => {
      finishDrag(
        event,
        true
      );
    }
  );

  item.addEventListener(
    "click",
    event => {
      if (!suppressClick) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      suppressClick = false;
    },
    true
  );
}

if (
  selectedSection.sequence.length ===
  0
) {
  const empty =
    document.createElement("span");

  empty.className =
    "section-contents-empty";

  empty.textContent = "—";

  sectionContents.appendChild(
    empty
  );
} else {
  selectedSection.sequence.forEach(
    (source, itemIndex) => {
      const item =
        document.createElement(
          "button"
        );

      item.type = "button";

      item.className =
        "section-pattern-cell";

      const sourceLabel =
        source.type === "fill"
          ? `f${source.index + 1}`
          : String(
              source.index + 1
            ).padStart(
              2,
              "0"
            );

      item.textContent =
        sourceLabel;

      item.dataset.focusKey =
        `section-source-${itemIndex}`;

      item.setAttribute(
        "aria-label",
        source.type === "fill"
          ? `section fill ${source.index + 1}`
          : `section pattern ${source.index + 1}`
      );

      enableSectionItemDrag(
        item,
        itemIndex
      );

      sectionContents.appendChild(
        item
      );
    }
  );
}

const sectionManager =
  sectionList.closest(
    ".section-manager"
  );

const oldSelector =
  sectionManager?.querySelector(
    ".section-selector"
  );

oldSelector?.remove();

sectionManager?.insertBefore(
  sectionSelector,
  sectionList
);

sectionList.append(
  sectionEditorButton,
  sectionContents
);
}

patternPageButton?.addEventListener(
  "click",
  () => {
    patternManagerPage =
      patternManagerPage === 0
        ? 1
        : 0;

    patternPageButton.textContent =
      patternManagerPage === 0
        ? "◧"
        : "◨";

    patternPageButton.setAttribute(
      "aria-label",
      patternManagerPage === 0
        ? "1ページ目を表示中。2ページ目へ切り替え"
        : "2ページ目を表示中。1ページ目へ切り替え"
    );

    renderPatternManager();

    restorePatternFocus(
      "pattern-page"
    );
  }
);


let soundPresetModal = null;

function createModalButton(label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function openSoundPresetModal() {
  if (soundPresetModal) return;

  const track = selectedTrack();
  const openingSnapshot = createSnapshot();
  const nowSound = captureTrackSound(track);
  const nowName = track.soundName || `sound ${String(track.id).padStart(2, "0")}`;

  let library = "factory";
  let selected = { type: "now", id: "now", name: "now", category: "now" };

  const overlay = document.createElement("div");
  overlay.className = "sound-preset-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "サウンドプリセット");

  const modal = document.createElement("div");
  modal.className = "sound-preset-modal";

  const header = document.createElement("div");
  header.className = "sound-preset-header";

  const factoryTab = createModalButton("Factory", "sound-preset-tab active");
  const userTab = createModalButton("User", "sound-preset-tab");
  const actions = document.createElement("div");
  actions.className = "sound-preset-actions";

  const saveButton =
  createModalButton(
    "",
    "sound-preset-icon-button"
  );

saveButton.innerHTML =
  getParameterIcon("save");

saveButton.setAttribute(
  "aria-label",
  "save user preset"
);

const deleteButton =
  createModalButton(
    "",
    "sound-preset-icon-button"
  );

deleteButton.innerHTML =
  getParameterIcon("trash");

deleteButton.setAttribute(
  "aria-label",
  "delete user preset"
);
  const closeButton = createModalButton("×", "sound-preset-close");
  closeButton.setAttribute("aria-label", "閉じる");

  actions.append(saveButton, deleteButton);
  header.append(factoryTab, userTab, actions, closeButton);

  const body = document.createElement("div");
  body.className = "sound-preset-body";
  const categories = document.createElement("div");
  categories.className = "sound-preset-categories";
  const listWrap =
  document.createElement("div");

listWrap.className =
  "sound-preset-list-wrap";

const list =
  document.createElement("div");

list.className =
  "sound-preset-list";

const scrollbar =
  document.createElement("div");

scrollbar.className =
  "sound-preset-scrollbar";

const scrollTrack =
  document.createElement("div");

scrollTrack.className =
  "sound-preset-scroll-track";

const scrollThumb =
  document.createElement("div");

scrollThumb.className =
  "sound-preset-scroll-thumb";

scrollbar.append(
  scrollTrack,
  scrollThumb
);

listWrap.append(
  list,
  scrollbar
);

body.append(
  categories,
  listWrap
);

  modal.append(header, body);
  overlay.append(modal);
  document.body.append(overlay);
  soundPresetModal = overlay;

  function currentPresets() {
    return library === "factory" ? getFactoryPresets() : getUserPresets();
  }

  function applySelection(item, type) {
    if (type === "now") {
      applyTrackSound(track, nowSound, nowName);
      selected = { type: "now", id: "now", name: "now", category: "now" };
    } else {
      applyTrackSound(track, item.sound, item.name);
      selected = { type, id: item.id, name: item.name, category: item.category };
    }

    renderSequence();
    renderEditor();
    renderList();
  }

  function updatePresetScrollbar() {
    const visibleHeight = list.clientHeight;
    const contentHeight = list.scrollHeight;

    if (contentHeight <= visibleHeight) {
      scrollbar.hidden = true;
      return;
    }

    scrollbar.hidden = false;

    const trackHeight = Math.max(
      1,
      scrollbar.clientHeight - 8
    );

    const thumbSize = Math.max(
      8,
      trackHeight * (visibleHeight / contentHeight)
    );

    const maximumScroll = contentHeight - visibleHeight;
    const maximumThumbTop = Math.max(0, trackHeight - thumbSize);

    const thumbTop = maximumScroll > 0
      ? (list.scrollTop / maximumScroll) * maximumThumbTop
      : 0;

    scrollThumb.style.height = "8px";
    scrollThumb.style.transform = `translateY(${thumbTop}px)`;
  }

  let scrollPointerId = null;
  let scrollStartY = 0;
  let scrollStartTop = 0;

  scrollThumb.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    scrollPointerId = event.pointerId;
    scrollStartY = event.clientY;
    scrollStartTop = list.scrollTop;
    scrollThumb.setPointerCapture(event.pointerId);
  });

  scrollThumb.addEventListener("pointermove", event => {
    if (scrollPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const visibleHeight = list.clientHeight;
    const contentHeight = list.scrollHeight;
    const maximumScroll = contentHeight - visibleHeight;

    if (maximumScroll <= 0) {
      return;
    }

    const trackHeight = Math.max(
      1,
      scrollbar.clientHeight - 8
    );

    const movableHeight = trackHeight - scrollThumb.offsetHeight;

    if (movableHeight <= 0) {
      return;
    }

    const movementY = event.clientY - scrollStartY;

    list.scrollTop = scrollStartTop +
      (movementY / movableHeight) * maximumScroll;
  });

  function finishPresetScroll(event) {
    if (scrollPointerId !== event.pointerId) {
      return;
    }

    if (scrollThumb.hasPointerCapture(event.pointerId)) {
      scrollThumb.releasePointerCapture(event.pointerId);
    }

    scrollPointerId = null;
  }

  scrollThumb.addEventListener("pointerup", finishPresetScroll);
  scrollThumb.addEventListener("pointercancel", finishPresetScroll);

  function groupedPresets() {
    const presets = currentPresets();
    return SOUND_CATEGORIES.map(category => ({
      category,
      presets: presets.filter(preset => preset.category === category)
    })).filter(group => group.presets.length > 0);
  }

  function scrollToCategory(category) {
    list.querySelector(`[data-category-heading="${category}"]`)?.scrollIntoView({
      block: "start",
      behavior: "smooth"
    });
  }

  function updateActiveCategory() {
    const headings = Array.from(list.querySelectorAll("[data-category-heading]"));
    if (!headings.length) return;
    const listTop = list.getBoundingClientRect().top;
    let active = headings[0].dataset.categoryHeading;
    headings.forEach(heading => {
      if (heading.getBoundingClientRect().top <= listTop + 10) {
        active = heading.dataset.categoryHeading;
      }
    });
    categories.querySelectorAll("button").forEach(button => {
      button.classList.toggle("active", button.dataset.category === active);
    });
  }

  function renderCategories(groups) {
    categories.innerHTML = "";
    groups.forEach(({ category }) => {
      const button = createModalButton(category, "sound-preset-category");
      button.dataset.category = category;
      button.addEventListener("click", () => scrollToCategory(category));
      categories.append(button);
    });
    categories.querySelector("button")?.classList.add("active");
  }

  function renderList() {
    const groups = groupedPresets();
    list.innerHTML = "";

    const nowButton = createModalButton("now", "sound-preset-item sound-preset-now");
    nowButton.classList.toggle("active", selected.type === "now");
    nowButton.addEventListener("click", () => applySelection(null, "now"));
    list.append(nowButton);

    groups.forEach(({ category, presets }) => {
      const heading = document.createElement("div");
      heading.className = "sound-preset-category-heading";
      heading.dataset.categoryHeading = category;
      heading.textContent = category;
      list.append(heading);

      presets.forEach(preset => {
        const button = createModalButton(preset.name, "sound-preset-item");
        button.classList.toggle(
          "active",
          selected.type === library && selected.id === preset.id
        );
        button.addEventListener("click", () => applySelection(preset, library));
        list.append(button);
      });
    });

    renderCategories(groups);
    actions.hidden = library !== "user";
    deleteButton.disabled = !(selected.type === "user" && selected.id !== "now");
    requestAnimationFrame(() => {
  updateActiveCategory();
  updatePresetScrollbar();
});
  }

  function switchLibrary(nextLibrary) {
    library = nextLibrary;
    factoryTab.classList.toggle("active", library === "factory");
    userTab.classList.toggle("active", library === "user");
    renderList();
  }

  function openSaveDialog() {
    const shade = document.createElement("div");
    shade.className = "sound-preset-dialog-shade";
    const dialog = document.createElement("form");
    dialog.className = "sound-preset-save-dialog";

    const selectedText = document.createElement("div");
    selectedText.className = "sound-preset-current";
    selectedText.textContent = `current preset　${selected.name}${selected.type === "factory" ? "（Factory）" : selected.type === "user" ? "（User）" : ""}`;

    const modeWrap =
  document.createElement("div");

modeWrap.className =
  "sound-preset-save-modes";

const canOverwrite =
  selected.type === "user";

let saveMode =
  canOverwrite
    ? "overwrite"
    : "new";

function createSaveModeButton(
  label,
  mode
) {
  const button =
    document.createElement("button");

  button.type = "button";

  button.className =
    "sound-preset-save-mode";

  button.textContent =
    label;

  button.dataset.mode =
    mode;

  button.classList.toggle(
    "selected",
    saveMode === mode
  );

  button.addEventListener(
    "click",
    () => {
      saveMode = mode;

      modeWrap
        .querySelectorAll(
          ".sound-preset-save-mode"
        )
        .forEach(
          modeButton => {
            modeButton.classList.toggle(
              "selected",
              modeButton.dataset.mode ===
                saveMode
            );
          }
        );

      updateMode();
    }
  );

  return button;
}

if (canOverwrite) {
  modeWrap.appendChild(
    createSaveModeButton(
      "overwrite",
      "overwrite"
    )
  );
}

modeWrap.appendChild(
  createSaveModeButton(
    "save as",
    "new"
  )
);

    const categorySelect = document.createElement("select");
    SOUND_CATEGORIES.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.append(option);
    });
    categorySelect.value = selected.category === "now" ? "other" : selected.category;

    const nameInput =
      document.createElement("div");

    nameInput.className =
      "sound-preset-name-input";

    nameInput.contentEditable =
      "true";

    nameInput.setAttribute(
      "role",
      "textbox"
    );

    nameInput.setAttribute(
      "aria-label",
      "preset name"
    );

    nameInput.dataset.placeholder =
      "preset name";

    nameInput.textContent =
      selected.type === "user"
        ? selected.name
        : "";

    nameInput.addEventListener(
      "beforeinput",
      event => {
        if (
          event.isComposing ||
          event.inputType.startsWith(
            "delete"
          )
        ) {
          return;
        }

        const currentText =
          nameInput.textContent ?? "";

        const selection =
          window.getSelection();

        const selectedLength =
          selection?.toString()
            .length ?? 0;

        const incomingLength =
          String(event.data ?? "")
            .length;

        if (
          currentText.length -
            selectedLength +
            incomingLength >
          40
        ) {
          event.preventDefault();
        }
      }
    );

    const fields = document.createElement("div");
    fields.className = "sound-preset-save-fields";
    fields.append(categorySelect, nameInput);

    const buttons = document.createElement("div");
    buttons.className = "sound-preset-dialog-buttons";
    const cancel = createModalButton("cancel");
    const commit = createModalButton("save");
    commit.type = "submit";
    buttons.append(cancel, commit);

    dialog.append(selectedText, modeWrap, fields, buttons);
    shade.append(dialog);
    modal.append(shade);

    function updateMode() {
      /*
       * overwriteでも入力欄を表示する。
       * Userプリセットは上書き時に
       * category／nameを変更できる。
       */
      fields.hidden = false;

      if (saveMode === "overwrite") {
        categorySelect.value =
          selected.category === "now"
            ? "other"
            : selected.category;

        nameInput.textContent =
          selected.type === "user"
            ? selected.name
            : "";
      }
    }

    updateMode();

    cancel.addEventListener("click", () => shade.remove());
    dialog.addEventListener("submit", event => {
      event.preventDefault();
      const mode =
  saveMode;
      const saved = saveUserPreset({
        id: mode === "overwrite" ? selected.id : null,
        category: categorySelect.value,
        name: nameInput.textContent ?? "",
        sound: captureTrackSound(track)
      });
      if (!saved) {
        nameInput.focus();
        return;
      }
      selected = { type: "user", id: saved.id, name: saved.name, category: saved.category };
      track.soundName = saved.name;
      library = "user";
      factoryTab.classList.remove("active");
      userTab.classList.add("active");
      shade.remove();
      renderEditor();
      renderList();
    });
    nameInput.focus();
  }

  function closeModal() {
    const changed =
      !soundsEqual(nowSound, captureTrackSound(track)) ||
      nowName !== track.soundName;

    if (changed) {
      saveHistorySnapshot(openingSnapshot);
    }

    overlay.remove();
    soundPresetModal = null;
    renderEditor();
    requestAnimationFrame(() => {
      document.querySelector('[data-focus-key="menu-sound-name"]')?.focus();
    });
  }

  factoryTab.addEventListener("click", () => switchLibrary("factory"));
  userTab.addEventListener("click", () => switchLibrary("user"));
  saveButton.addEventListener("click", openSaveDialog);
  deleteButton.addEventListener(
    "click",
    () => {
      if (
        selected.type !== "user" ||
        !selected.id
      ) {
        return;
      }

      /*
       * Userプリセット削除前の確認。
       */
      const shade =
        document.createElement("div");

      shade.className =
        "sound-preset-dialog-shade";

      const dialog =
        document.createElement("div");

      dialog.className =
        "sound-preset-save-dialog";

      dialog.setAttribute(
        "role",
        "alertdialog"
      );

      dialog.setAttribute(
        "aria-modal",
        "true"
      );

      const message =
        document.createElement("div");

      message.className =
        "sound-preset-current";

      message.textContent =
        "delete this preset?";

      const buttons =
        document.createElement("div");

      buttons.className =
        "sound-preset-dialog-buttons";

      const noButton =
        createModalButton("No");

      const yesButton =
        createModalButton("Yes");

      noButton.type = "button";
      yesButton.type = "button";

      buttons.append(
        noButton,
        yesButton
      );

      dialog.append(
        message,
        buttons
      );

      shade.appendChild(
        dialog
      );

      modal.appendChild(
        shade
      );

      noButton.addEventListener(
        "click",
        () => {
          shade.remove();
          deleteButton.focus();
        }
      );

      yesButton.addEventListener(
        "click",
        () => {
          const deleted =
            deleteUserPreset(
              selected.id
            );

          if (!deleted) {
            return;
          }

          selected = {
            type: "detached",
            id: null,
            name:
              track.soundName ||
              "current sound",
            category:
              selected.category ||
              "other"
          };

          shade.remove();
          renderList();
        }
      );

      requestAnimationFrame(
        () => noButton.focus()
      );
    }
  );
  closeButton.addEventListener("click", closeModal);
  list.addEventListener(
  "scroll",
  () => {
    updateActiveCategory();
    updatePresetScrollbar();
  },
  { passive: true }
);

  overlay.addEventListener("keydown", event => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const saveDialog =
      event.target.closest(
        ".sound-preset-dialog-shade"
      );

    if (saveDialog) {
      saveDialog.remove();
      return;
    }

    closeModal();
  }, true);

  renderList();
  closeButton.focus();
}

export function renderEditor() {
  editor.innerHTML = "";

  if (!state.selectedParameterId) {
    renderMenu();
    return;
  }

  if (
    state.selectedParameterId ===
      "osc"
  ) {
    renderOscEdit();
    return;
  }

  if (
    state.selectedParameterId ===
      "envelope"
  ) {
    renderEnvelopeEdit();
    return;
  }

  if (
    state.selectedParameterId ===
      "filterCutoff"
  ) {
    renderFilterEdit();
    return;
  }

  if (
  state.selectedParameterId ===
    "lfo"
) {
  renderLfoEdit();
  return;
}

  renderEdit(
    editorParameterById(
      state.selectedParameterId
    )
  );
}

export function updatePlayingStep() {
  document
    .querySelectorAll(".track-lane")
    .forEach(lane => {
      const trackIndex =
        Number(lane.dataset.trackIndex);

      const stepIndex =
        Number(lane.dataset.stepIndex);

      const track =
        tracks[trackIndex];

      const playingStep =
  state.playbackTickIndex === null
    ? -1
    : state.playbackTickIndex %
      track.stepLength;

      lane.classList.toggle(
        "playing",
        stepIndex === playingStep
      );
    });

  document
    .querySelectorAll(".offset-step")
    .forEach(button => {
      const playingStep =
  state.playbackTickIndex === null
    ? -1
    : state.playbackTickIndex %
      selectedTrack().stepLength;

      button.classList.toggle(
        "playing",
        Number(button.dataset.stepIndex) ===
          playingStep
      );
    });
}

export function render() {
  renderCurrentSourceDisplay();
  renderSequence();
  renderEditor();
  renderPatternManager();
}
