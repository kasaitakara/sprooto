import {
  STEP_COUNT,
  PAGE_STEP_COUNT,
  tracks,
  parameters,
  state,
  selectedTrack,
  parameterById,
  clamp,
  getMaxTrackLength,
  syncPatternLength,
  saveHistory
} from "./sequencer.js";

const sequenceGrid = document.getElementById("sequence-grid");
const sequencePageButton = document.getElementById("sequence-page-button");
const patternLengthInput = document.getElementById("pattern-length-input");
const editor = document.getElementById("editor");
const patternGrid = document.getElementById("pattern-grid");
const sectionList = document.getElementById("section-list");

const PATTERN_SLOT_COUNT = 24;
const FILL_SLOT_COUNT = 6;
const sections = Array.from(
  { length: 10 },
  (_, index) => ({
    id: String.fromCharCode(65 + index),
    patternIndexes: index === 0 ? [0] : []
  })
);

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

function enableVerticalSweep({
  element,
  getValue,
  setValue,
  min,
  max,
  step = 1,
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
        SWEEP_PIXELS_PER_STEP;

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

  button.addEventListener("click", () => {
  const track = selectedTrack();

  if (stepIndex >= track.stepLength) {
    return;
  }

  saveHistory();

  track.steps[stepIndex] =
    !track.steps[stepIndex];

  renderSequence();

  restoreFocus(
    `.sequence-step[data-step-index="${stepIndex}"]`
  );
});

  return button;
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

function applyPatternLength() {
  const nextLength = Math.round(
    clamp(
      Number(patternLengthInput.value) || 1,
      1,
      STEP_COUNT
    )
  );

  saveHistory();
  tracks.forEach(track => {
    track.stepLength = nextLength;
  });

  syncPatternLength();

  patternLengthInput.value =
    state.patternLength;

  renderSequence();
  renderEditor();
}

patternLengthInput.addEventListener("input", applyPatternLength);
patternLengthInput.addEventListener("change", applyPatternLength);

patternLengthInput.addEventListener("pointerdown", () => {
  patternLengthInput.dataset.keyboardEditing = "true";
});

patternLengthInput.addEventListener("blur", () => {
  delete patternLengthInput.dataset.keyboardEditing;
});

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
  const input =
    document.createElement("input");

  input.type = "number";
  input.className =
    "track-length-input";

  input.min = "1";
  input.max = String(STEP_COUNT);
  input.step = "1";

  input.value =
    selectedTrack().stepLength;

  input.dataset.focusKey =
    focusKey;

  input.setAttribute(
    "aria-label",
    `トラック${selectedTrack().id}のステップ数`
  );

  function applyTrackLength() {
    const nextLength = Math.round(
      clamp(
        Number(input.value) || 1,
        1,
        STEP_COUNT
      )
    );

    saveHistory();
    selectedTrack().stepLength =
      nextLength;

    input.value = nextLength;

    syncPatternLength();
    renderSequence();
  }

  input.addEventListener(
    "input",
    applyTrackLength
  );

  input.addEventListener(
    "change",
    applyTrackLength
  );

  return input;
}

function renderMenu() {
  const header = document.createElement("div");
  header.className = "editor-header";
  header.innerHTML = `
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
  header.querySelector(".track-cycle").addEventListener("click", () => {

    state.selectedTrackIndex =
        (state.selectedTrackIndex + 1) %
        tracks.length;

    renderSequence();
    renderEditorAndRestore("menu-track");

});

header.querySelector(".mute").addEventListener("click", () => {

    selectedTrack().muted =
        !selectedTrack().muted;

    renderEditorAndRestore("menu-mute");

});

header.querySelector(".solo").addEventListener("click", () => {

    selectedTrack().solo =
        !selectedTrack().solo;

    renderEditorAndRestore("menu-solo");

});

header.appendChild(
  createTrackLengthInput(
    "menu-track-length"
  )
);

  const grid = document.createElement("div");
  grid.className = "parameter-menu";
  parameters.forEach(parameter => grid.appendChild(parameterButton(parameter)));
  editor.append(header, grid);
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
        event.detail > 0 &&
        (
          lastPointerType === "touch" ||
          lastPointerType === "pen"
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
          event.detail > 0 &&
          (
            lastPointerType ===
              "touch" ||
            lastPointerType ===
              "pen"
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

function renderPatternManager() {
  if (!patternGrid || !sectionList) {
    return;
  }

  patternGrid.innerHTML = "";

  /*
   * Pattern 24個 + Fill 6個
   *
   * 01 02 03 04 05 06 07 08 F1 F2
   * 09 10 11 12 13 14 15 16 F3 F4
   * 17 18 19 20 21 22 23 24 F5 F6
   */
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 10; column++) {
      const isFill =
        column >= 8;

      const slotIndex = isFill
        ? row * 2 + (column - 8)
        : row * 8 + column;

      const button =
        document.createElement("button");

      button.type = "button";

      button.className = isFill
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
          state.selectedPatternIndex ===
          slotIndex
        ) {
          button.classList.add("active");
        }
      }

      button.addEventListener(
        "click",
        () => {
          if (!isFill) {
            state.selectedPatternIndex =
              slotIndex;

            renderPatternManager();

            restorePatternFocus(
              `pattern-${slotIndex}`
            );

            return;
          }

          restorePatternFocus(
            `fill-${slotIndex}`
          );
        }
      );

      patternGrid.appendChild(button);
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

  sections.forEach(
    (section, sectionIndex) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        "section-selector-cell";

      button.textContent =
        section.id;

      button.dataset.focusKey =
        `section-${sectionIndex}`;

      button.setAttribute(
        "aria-label",
        `section ${section.id}`
      );

      if (
        state.selectedSectionIndex ===
        sectionIndex
      ) {
        button.classList.add("active");
      }

      button.addEventListener(
        "click",
        () => {
          state.selectedSectionIndex =
            sectionIndex;

          renderPatternManager();

          restorePatternFocus(
            `section-${sectionIndex}`
          );
        }
      );

      sectionSelector.appendChild(button);
    }
  );

  /*
   * 選択中Sectionの中身
   */
  sectionList.innerHTML = "";

  const selectedSection =
    sections[
      state.selectedSectionIndex ?? 0
    ];

  const sectionContents =
    document.createElement("div");

  sectionContents.className =
    "section-contents";

  sectionContents.dataset.sectionIndex =
    String(
      state.selectedSectionIndex ?? 0
    );

  if (
    selectedSection.patternIndexes.length ===
    0
  ) {
    const empty =
      document.createElement("span");

    empty.className =
      "section-contents-empty";

    empty.textContent = "—";

    sectionContents.appendChild(empty);
  } else {
    selectedSection.patternIndexes.forEach(
      (patternIndex, itemIndex) => {
        const item =
          document.createElement("button");

        item.type = "button";
        item.className =
          "section-pattern-cell";

        item.textContent =
          String(patternIndex + 1)
            .padStart(2, "0");

        item.dataset.focusKey =
          `section-pattern-${itemIndex}`;

        item.setAttribute(
          "aria-label",
          `section pattern ${patternIndex + 1}`
        );

        sectionContents.appendChild(item);
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

  sectionList.appendChild(
    sectionContents
  );
}

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
  renderSequence();
  renderEditor();
  renderPatternManager();
}
