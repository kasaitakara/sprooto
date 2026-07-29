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
    SWEEP_ACCELERATION_START
) {
        const extra =
          absoluteStepCount -
          SWEEP_ACCELERATION_START;

        acceleratedStepCount =
          SWEEP_ACCELERATION_START +
          extra +
          extra *
            extra *
            SWEEP_ACCELERATION_RATE;
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

    if (
      state.playingStepIndex !== null &&
      stepIndex === state.playingStepIndex
    ) {
      lane.classList.add("playing");
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
  isTouchOrPen(
    event.pointerType
  )
) {
      patternLengthInput.readOnly =
        true;

      patternLengthDirectEditing =
        false;

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

  if (parameter.id === "fmDepth") {
    return String(track.base.fmDepth);
  }

  return String(value);
}

function parameterButton(parameter) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "parameter-button";
button.dataset.focusKey =
    `parameter-${parameter.id}`;

  button.setAttribute(
    "aria-label",
    parameter.label
  );

  button.innerHTML = `
  <span class="parameter-icon">
    ${getParameterIcon(parameter.icon)}
  </span>

  <span class="parameter-value">
    ${displayBaseValue(parameter)}
  </span>
`;

  button.addEventListener("click", () => {
    state.selectedParameterId = parameter.id;

    state.selectedChildId =
      parameter.children?.[0]?.id ??
      parameter.id;

    const activeId =
    parameter.children?.[0]?.id ??
    parameter.id;

renderEditorAndRestore(
    `base-value-${activeId}`
);

  });

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
  isTouchOrPen(
    lastPointerType
  );

      if (isTouchInput) {
        event.preventDefault();
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
  isTouchOrPen(
    lastPointerType
  );

      if (isTouchInput) {
        event.preventDefault();
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

  const bottomRow =
    document.createElement("div");

  bottomRow.className =
    "editor-header-row editor-header-secondary";

  const soundName =
    document.createElement("span");

  soundName.className =
    "track-sound-name";

  soundName.textContent =
    selectedTrack().soundName ||
    `sound ${String(selectedTrack().id).padStart(2, "0")}`;

  soundName.setAttribute(
    "aria-label",
    `サウンド名 ${soundName.textContent}`
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

  parameters.forEach(
    parameter =>
      grid.appendChild(
        parameterButton(
          parameter
        )
      )
  );

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

  const definition =
    id === "fmRatio"
      ? {
          min: 0.25,
          max: 8,
          step: 0.25
        }
      : parameter;

  const wrap =
    document.createElement("div");

  wrap.className = "value-control";

  const valueKey =
    `base-value-${id}`;

  const value =
    document.createElement("button");

  value.type = "button";
  value.className = "base-value";
  value.dataset.focusKey = valueKey;
  value.dataset.valueControl = "true";
  value.textContent = track.base[id];

  /*
   * 最後に触った入力機器を記録する。
   *
   * touch / pen：
   * 数値入力欄を開かず、スイープ専用。
   *
   * mouse / keyboard：
   * 従来の直接入力も使用可能。
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
   * 上下スイープによる値変更
   */
  let sweepHistorySaved = false;

  enableVerticalSweep({
    element: value,

    getValue: () => {
      return track.base[id];
    },

    setValue: nextValue => {
      /*
       * 1回のスイープにつき、
       * Undo履歴は最初の変更時だけ保存。
       */
      if (!sweepHistorySaved) {
        saveHistory();
        sweepHistorySaved = true;
      }

      track.base[id] = nextValue;
      value.textContent = nextValue;
    },

    min: definition.min,
    max: definition.max,
    step: definition.step ?? 1,

    onCommit: (
      startValue,
      currentValue,
      changed
    ) => {
      sweepHistorySaved = false;

      if (changed) {
        renderEditorAndRestore(
          valueKey
        );
      }
    }
  });

  /*
   * PCのマウスクリック、
   * またはキーボード操作時の直接入力。
   *
   * 指やペンでタップした場合は
   * 入力欄へ切り替えない。
   */
  value.addEventListener(
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

      const input =
        document.createElement("input");

      input.type = "number";
      input.value = track.base[id];
      input.min = definition.min;
      input.max = definition.max;
      input.step = definition.step;
      input.className = "base-input";
      input.dataset.focusKey = valueKey;
      input.dataset.keyboardEditing = "true";

      value.replaceWith(input);
      input.focus();
      input.select();

      let finished = false;

      const finish = shouldCommit => {
        if (finished) {
          return;
        }

        finished = true;

        if (shouldCommit) {
          const previousValue =
            track.base[id];

          let nextValue = clamp(
            Number(input.value) || 0,
            definition.min,
            definition.max
          );

          nextValue =
            Math.round(
              nextValue * 100
            ) / 100;

          if (
            nextValue !== previousValue
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
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          }

          if (event.key === "Escape") {
            event.preventDefault();
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

  wrap.appendChild(value);

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
      state.playingStepIndex !== null &&
      stepIndex ===
        state.playingStepIndex %
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
    `F${slotIndex + 1}`;

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
          ? `F${source.index + 1}`
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

export function renderEditor() {
  editor.innerHTML = "";
  if (!state.selectedParameterId) renderMenu();
  else renderEdit(parameterById(state.selectedParameterId));
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
        state.playingStepIndex === null
          ? -1
          : state.playingStepIndex %
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
        state.playingStepIndex === null
          ? -1
          : state.playingStepIndex %
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
