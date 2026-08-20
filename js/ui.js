import {
  STEP_COUNT,
  PAGE_STEP_COUNT,
  CHORD_NAMES,
  tracks,
  parameters,
  state,
  sections,
  song,
  addSourceToSong,
  moveSongSource,
  removeSongSource,
  selectSongPart,
  queueSongPart,
  selectedTrack as mainSelectedTrack,
  parameterById,
  clamp,
  getMaxTrackLength,
  syncPatternLength,
  saveHistory,
  saveTrackHistory,
  saveMasterMixHistory,
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
  copySource,
  pasteSource,
    clearSource,
  hasSourceClipboard,
  sourceHasData,
  sectionHasData,
  currentSourceLabel,
  selectSection,
  queueSection,
  selectEditingSection,
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


import {
  getProjectList,
  getCurrentProjectMeta,
  createNewProject,
  openProject,
  saveCurrentProject,
  hasUnsavedChanges,
  saveAsProject,
  renameProject,
  deleteProject
} from "./storage.js";

import {
  setMasterMixEqBand,
  setMasterMixVolume,
  setMasterLimiterThreshold,
  setMasterReverb,
  getMasterMixMeterData
} from "./audio.js";

import {
  renderExportWav
} from "./export.js";



const currentProjectName =
  document.getElementById("current-project-name");
const projectButton =
  document.getElementById("project-button");
const exportButton =
  document.getElementById("export-button");

const sequenceGrid = document.getElementById("sequence-grid");
const sequencePageButton = document.getElementById("sequence-page-button");
const patternLengthInput = document.getElementById("pattern-length-input");
const currentSourceDisplay = document.getElementById("current-source-display");
const editor = document.getElementById("editor");
const songMasterMix = document.getElementById("song-master-mix");
const songParts = document.getElementById("song-parts");
const songGrid = document.getElementById("song-grid");
const songPageButton = document.getElementById("song-page-button");
const sequenceViewToggle =
  document.getElementById(
    "sequence-view-toggle"
  );

const songEditorViewToggle =
  document.getElementById(
    "song-editor-view-toggle"
  );

  let mixerView = false;
let songEditorView = false;

let pinPlacementMode = false;
let pinEditSlot = null;

const PIN_SOUND_KEYS = new Set([
  "base",
  "offsets",
  "fxMuted",
  "envelopeSelectedId",
  "oscSelectedId",
  "articulationSelectedId",
  "lfoSelected",
  "soundName"
]);

function isPinModeEnabled(
  track = mainSelectedTrack()
) {
  return Boolean(
    track?.pinEnabled
  );
}

function currentPinSound(track = mainSelectedTrack()) {
  if (
    !isPinModeEnabled(track) ||
    !pinEditSlot
  ) {
    return null;
  }

  return track?.pinSounds?.[pinEditSlot] ?? null;
}

function editorTrack() {
  const track = mainSelectedTrack();
  const pinSound = currentPinSound(track);

  if (!pinSound) {
    return track;
  }

  return new Proxy(track, {
    get(target, property) {
      if (PIN_SOUND_KEYS.has(property)) {
        return pinSound[property];
      }

      return target[property];
    },

    set(target, property, value) {
      if (PIN_SOUND_KEYS.has(property)) {
        pinSound[property] = value;
        return true;
      }

      target[property] = value;
      return true;
    }
  });
}

function setPinEditSlot(slot) {
  pinEditSlot =
    slot === "a" || slot === "b" || slot === "c"
      ? slot
      : null;

  document.body.classList.toggle(
    "pin-sound-edit-mode",
    Boolean(pinEditSlot)
  );
}

function setPinModeEnabled(enabled) {
  const track =
    mainSelectedTrack();

  if (!track) {
    return;
  }

  track.pinEnabled =
    Boolean(enabled);

  pinPlacementMode = false;

  /*
   * ON直後はMain Sound（・）を編集対象にする。
   * OFF時もMainへ戻す。
   */
  setPinEditSlot(null);
}

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
  "1/32t",
  "1/32",
  "1/16t",
  "1/16",
  "1/8t",
  "1/8",
  "1/4t",
  "1/4",
  "1/2t",
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

    articulation: `
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

    glide: `
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

nudge: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 12h6"></path>
    <path d="M6.5 9.5L4 12l2.5 2.5"></path>

    <path d="M14 12h6"></path>
    <path d="M17.5 9.5L20 12l-2.5 2.5"></path>

    <path d="M12 6v12"></path>
  </svg>
`,

strum: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 17h5"></path>
    <path d="M7 13h5"></path>
    <path d="M10 9h5"></path>
    <path d="M13 5h5"></path>
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
        <path d="M5 5v14"></path>
        <path d="M10 5v14"></path>
        <path d="M15 5v14"></path>
        <path d="M20 5v14"></path>
      </svg>
    `,

    pin: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="6" r="3"></circle>
    <path d="M12 9V21"></path>
  </svg>
`,

    reverb: `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="5" cy="12" r="1.5"></circle>
        <path d="M9 8.5c2 1.7 2 5.3 0 7"></path>
        <path d="M13 6c3.5 3 3.5 9 0 12"></path>
        <path d="M17 3.5c5 4.5 5 12.5 0 17"></path>
      </svg>
    `,

    crush: `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- head + claw -->
    <path
      fill="currentColor"
      stroke="none"
      d="
        M4.2 7.2
        L7.1 4.3
        L9.2 5.4
        L13.8 2.4
        L17.4 1.7
        L17.8 3.5
        L14.8 6.1
        L13.3 8.3
        L15.1 10.1
        L12.8 11.9
        L10.1 8.8
        L7.7 10.5
        Z
      "
    ></path>

    <!-- striking face -->
    <path
      fill="currentColor"
      stroke="none"
      d="
        M3.1 7.6
        L6.2 10.7
        L4.2 12.7
        L1.3 9.8
        Z
      "
    ></path>

    <!-- metal shaft -->
    <path
      fill="currentColor"
      stroke="none"
      d="
        M10.1 9.1
        L11.8 8.0
        L17.0 15.6
        L15.3 16.8
        Z
      "
    ></path>

    <!-- grip -->
    <path
      fill="currentColor"
      stroke="none"
      d="
        M14.8 15.5
        L17.4 13.8
        L22.1 18.5
        Q23.0 19.5 22.2 20.5
        L19.4 23
        Q18.6 23.7 17.7 22.8
        L13.5 18.2
        Z
      "
    ></path>

    <!-- grip grooves -->
    <path
      d="M15.3 18.2l2.1-1.4"
      stroke="var(--bg)"
      stroke-width="0.9"
    ></path>
    <path
      d="M16.4 19.5l2.1-1.4"
      stroke="var(--bg)"
      stroke-width="0.9"
    ></path>
    <path
      d="M17.5 20.7l2.1-1.4"
      stroke="var(--bg)"
      stroke-width="0.9"
    ></path>
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


const noteParameter = {
  id: "note",
  label: "NOTE",
  icon: "note",
  children: [
    { id: "note", label: "note", min: -60, max: 67, step: 1, offsetMode: "result" },
    { id: "chord", label: "chord", min: 0, max: CHORD_NAMES.length - 1, step: 1, offsetMode: "result" },
    { id: "voices", label: "voices", min: 1, max: 4, step: 1, offsetMode: "result" },
    { id: "inversion", label: "inv", min: 0, max: 3, step: 1, offsetMode: "result" },
  ]
};

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

const articulationParameter = {
  id: "articulation",
  label: "ART",
  icon: "glide",
  children: [
    {
      id: "glide",
      label: "glide",
      icon: "glide",
      min: 0,
      max: 8,
      step: 1,
      offsetMode: "result"
    },
    {
      id: "nudge",
      label: "nudge",
      icon: "nudge",
      min: -4,
      max: 4,
      step: 1,
      offsetMode: "result"
    },
    {
      id: "strum",
      label: "strum",
      icon: "strum",
      min: -3,
      max: 3,
      step: 1,
      offsetMode: "result"
    }
  ]
};

const subParameter = {
  id: "sub",
  label: "SUB",
  icon: "sub",
  children: [
    { id: "subPattern", label: "pattern", min: -1, max: 6, step: 1, offsetMode: "result" },
    { id: "subCrescendo", label: "cres.", min: -3, max: 3, step: 1, offsetMode: "result" },
    { id: "subProbability", label: "prob", min: 0, max: 100, step: 1, offsetMode: "result" }
  ]
};


const reverbParameter = {
  id: "reverb",
  label: "FX3",
  icon: "reverb",
  children: [
    { id: "reverbSend", label: "send", min: 0, max: 100, step: 1, offsetMode: "result" },
    { id: "reverbSize", label: "size", min: 1, max: 8, step: 1, offsetMode: "result" }
  ]
};

const crushParameter = {
  id: "crush",
  label: "FX2",
  icon: "crush",
  children: [
    { id: "crushLevel", label: "level", min: 0, max: 100, step: 1, offsetMode: "result" },
    { id: "crushBit", label: "bit", min: 1, max: 16, step: 1, offsetMode: "result" },
    { id: "crushRate", label: "rate", min: 1, max: 32, step: 1, offsetMode: "result" }
  ]
};

const CRUSH_RATE_VALUES = Object.freeze([
  1, 2, 4, 8, 16, 32
]);

function crushRateIndex(value) {
  const numericValue = Number(value) || 1;

  return CRUSH_RATE_VALUES.reduce(
    (bestIndex, candidate, index) =>
      Math.abs(candidate - numericValue) <
      Math.abs(CRUSH_RATE_VALUES[bestIndex] - numericValue)
        ? index
        : bestIndex,
    0
  );
}

function crushRateValue(index) {
  return CRUSH_RATE_VALUES[
    clamp(
      Math.round(Number(index) || 0),
      0,
      CRUSH_RATE_VALUES.length - 1
    )
  ];
}

const SUB_PATTERN_FIGURES = Object.freeze([
  { label: "32", divisions: 2, active: [0, 1] },
  { label: "32 back", divisions: 2, active: [1] },
  { label: "32T", divisions: 3, active: [0, 1, 2] },
  { label: "64", divisions: 4, active: [0, 1, 2, 3] },
  { label: "64 odd", divisions: 4, active: [0, 2] },
  { label: "64 front", divisions: 4, active: [0, 1] },
  { label: "64T", divisions: 6, active: [0, 1, 2, 3, 4, 5] }
]);

function subPatternLabel(value) {
  const index = Math.round(Number(value));
  return index < 0
    ? "off"
    : SUB_PATTERN_FIGURES[index]?.label ?? "off";
}

function subPatternFigureHtml(value) {
  const index = Math.round(Number(value));

  if (index < 0) {
    return `<span class="sub-pattern-off">off</span>`;
  }

  const figure = SUB_PATTERN_FIGURES[index];

  if (!figure) {
    return `<span class="sub-pattern-off">off</span>`;
  }

  const active = new Set(figure.active);
  const cells = Array.from(
    { length: figure.divisions },
    (_, cellIndex) =>
      `<span class="sub-pattern-cell${active.has(cellIndex) ? " active" : ""}"></span>`
  ).join("");

  return `
    <span
      class="sub-pattern-figure"
      style="--sub-divisions:${figure.divisions}"
      aria-label="${figure.label}"
    >${cells}</span>
  `;
}

const parameterMenuItems = [
  { label: "OSC", parameter: oscParameter, icon: "sine" },
  { label: "NOTE", parameter: noteParameter, icon: "note" },
  { label: "ENV", parameter: envelopeParameter, icon: "decay" },
  { label: "FM", parameterId: "fmDepth", icon: "fm" },
  { label: "FILTER", parameterId: "filterCutoff", icon: "tone" },
  { label: "PAN", parameterId: "pan", icon: "pan" },
  { label: "LFO", parameterId: "lfo", icon: "lfo" },
  { label: "art", parameter: articulationParameter, icon: "articulation" },
  { label: "fx", placeholderId: "fx", icon: "fx" },
  { label: "fx1", parameterId: "delay", icon: "delay" },
  { label: "fx2", parameter: crushParameter, icon: "crush" },
  { label: "fx3", parameter: reverbParameter, icon: "reverb" },
  { label: "fx4", placeholderId: "fx4", icon: "fx" },
  { label: "fx5", placeholderId: "fx5", icon: "fx" },
  { label: "prob", parameterId: "probability", icon: "probability" },
  { label: "sub", parameter: subParameter, icon: "sub" }
];

function editorParameterById(id) {
  if (id === "note") {
    return noteParameter;
  }

  if (id === "osc") {
    return oscParameter;
  }

  if (id === "envelope") {
    return envelopeParameter;
  }

  if (id === "sub") {
    return subParameter;
  }

  if (id === "articulation") {
    return articulationParameter;
  }

  if (id === "crush") {
    return crushParameter;
  }

  if (id === "reverb") {
    return reverbParameter;
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

      const currentMin =
  typeof min === "function"
    ? min()
    : min;

const currentMax =
  typeof max === "function"
    ? max()
    : max;

const nextValue =
  roundToStep(
    clamp(
      startValue +
        stepCount * step,
      currentMin,
      currentMax
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



/* =========================
 * Range selection / clipboard
 * ========================= */
const LONG_PRESS_MS = 450;

const editSelection = {
  mode: null, // null | "step" | "offset"
  scope: "all", // step mode: "all" | "track"
  selected: new Set(),
  clipboard: null,
  sweepPointerId: null,
  sweepValue: true,
  sweepAnchor: null,
  sweepBaseline: null
};

function selectionKey(trackIndex, stepIndex) {
  return `${trackIndex}:${stepIndex}`;
}

function parseSelectionKey(key) {
  const [trackIndex, stepIndex] = key.split(":").map(Number);
  return { trackIndex, stepIndex };
}

function clearEditSelection() {
  editSelection.selected.clear();
}

function finishEditMode({ returnToMenu = false } = {}) {
  clearEditSelection();
  editSelection.mode = null;
  document.body.classList.remove(
    "step-edit-mode",
    "step-edit-scope-all",
    "step-edit-scope-track",
    "offset-selection-mode"
  );
  renderEditActionToolbar();

  if (returnToMenu) {
    state.selectedParameterId = null;
  }

  renderSequence();
  renderEditor();
}

function selectedKeysSorted() {
  return Array.from(editSelection.selected)
    .map(parseSelectionKey)
    .sort(
      (a, b) =>
        a.stepIndex - b.stepIndex ||
        a.trackIndex - b.trackIndex
    );
}

function isWholeStepSelected(stepIndex) {
  return tracks.every((track, trackIndex) => {
    if (stepIndex >= track.stepLength) {
      return true;
    }

    return editSelection.selected.has(
      selectionKey(trackIndex, stepIndex)
    );
  });
}

function updateSelectionClasses() {
  document
    .querySelectorAll(".sequence-step[data-step-index]")
    .forEach(button => {
      const stepIndex = Number(button.dataset.stepIndex);

      button.classList.toggle(
        "range-selected",
        editSelection.mode === "step" &&
          editSelection.scope === "all" &&
          isWholeStepSelected(stepIndex)
      );

      button
        .querySelectorAll(
          ".track-lane[data-track-index]"
        )
        .forEach(lane => {
          const trackIndex =
            Number(
              lane.dataset.trackIndex
            );

          lane.classList.toggle(
            "range-selected",
            editSelection.mode === "step" &&
              editSelection.scope === "track" &&
              trackIndex ===
                state.selectedTrackIndex &&
              editSelection.selected.has(
                selectionKey(
                  trackIndex,
                  stepIndex
                )
              )
          );
        });
    });

  document
    .querySelectorAll(".step-edit-cell[data-step-index]")
    .forEach(button => {
      const key = selectionKey(
        state.selectedTrackIndex,
        Number(button.dataset.stepIndex)
      );

      button.classList.toggle(
        "range-selected",
        false
      );
    });

  document
    .querySelectorAll(".offset-step[data-step-index]")
    .forEach(button => {
      const key = selectionKey(
        state.selectedTrackIndex,
        Number(button.dataset.stepIndex)
      );

      button.classList.toggle(
        "range-selected",
        editSelection.mode === "offset" &&
          editSelection.selected.has(key)
      );
    });

  renderEditActionToolbar();
}

function setSelectionCell(trackIndex, stepIndex, selected) {
  if (
    trackIndex < 0 ||
    trackIndex >= tracks.length ||
    stepIndex < 0 ||
    stepIndex >= STEP_COUNT
  ) {
    return;
  }

  const key = selectionKey(trackIndex, stepIndex);

  if (selected) {
    editSelection.selected.add(key);
  } else {
    editSelection.selected.delete(key);
  }
}

function setWholeStepSelection(stepIndex, selected) {
  tracks.forEach((track, trackIndex) => {
    if (stepIndex >= track.stepLength) {
      return;
    }

    setSelectionCell(
      trackIndex,
      stepIndex,
      selected
    );
  });
}

function applyStepEditScopeClass() {
  document.body.classList.toggle(
    "step-edit-scope-all",
    editSelection.mode === "step" &&
      editSelection.scope === "all"
  );

  document.body.classList.toggle(
    "step-edit-scope-track",
    editSelection.mode === "step" &&
      editSelection.scope === "track"
  );
}

function selectStepForCurrentScope(stepIndex, selected) {
  if (editSelection.scope === "all") {
    setWholeStepSelection(stepIndex, selected);
    return;
  }

  setSelectionCell(
    state.selectedTrackIndex,
    stepIndex,
    selected
  );
}

function isStepSelectedForCurrentScope(stepIndex) {
  if (editSelection.scope === "all") {
    return isWholeStepSelected(stepIndex);
  }

  return editSelection.selected.has(
    selectionKey(
      state.selectedTrackIndex,
      stepIndex
    )
  );
}

function beginStepEditMode(stepIndex) {
  clearEditSelection();
  editSelection.mode = "step";
  editSelection.scope = "all";

  document.body.classList.add(
    "step-edit-mode"
  );

  document.body.classList.remove(
    "offset-selection-mode"
  );

  applyStepEditScopeClass();
  selectStepForCurrentScope(stepIndex, true);
  renderSequence();
  renderEditor();
  updateSelectionClasses();
}

function beginOffsetSelectionMode(stepIndex) {
  clearEditSelection();
  editSelection.mode = "offset";

  document.body.classList.add(
    "offset-selection-mode"
  );

  document.body.classList.remove(
    "step-edit-mode",
    "step-edit-scope-all",
    "step-edit-scope-track"
  );

  setSelectionCell(
    state.selectedTrackIndex,
    stepIndex,
    true
  );

  updateSelectionClasses();
}

function finishOffsetSelectionMode() {
  clearEditSelection();

  editSelection.mode = null;

  document.body.classList.remove(
    "offset-selection-mode"
  );

  renderEditor();
}

function clearOffsetSelectionMode() {
  if (editSelection.mode !== "offset") {
    return;
  }

  clearEditSelection();
  editSelection.mode = null;

  document.body.classList.remove(
    "offset-selection-mode"
  );
}

function captureClipboard() {
  const cells = selectedKeysSorted();

  if (!cells.length) {
    return false;
  }

  const minTrack = Math.min(
    ...cells.map(cell => cell.trackIndex)
  );

  const minStep = Math.min(
    ...cells.map(cell => cell.stepIndex)
  );

  editSelection.clipboard = {
    mode: editSelection.scope,
    cells: cells.map(
      ({ trackIndex, stepIndex }) => {
        const track = tracks[trackIndex];

        return {
          trackOffset:
            trackIndex - minTrack,
          stepOffset:
            stepIndex - minStep,
          stepOn:
            Boolean(track.steps[stepIndex]),
          pin:
            track.pins?.[stepIndex] ?? null,
          offsets:
            Object.fromEntries(
              Object.entries(track.offsets)
                .map(([id, values]) => [
                  id,
                  Number(values?.[stepIndex]) || 0
                ])
            )
        };
      }
    )
  };

  return true;
}

function deleteSelectedSequenceCells({ save = true } = {}) {
  const cells = selectedKeysSorted();

  if (!cells.length) {
    return false;
  }

  if (save) {
    saveHistory();
  }

  cells.forEach(({ trackIndex, stepIndex }) => {
    const track = tracks[trackIndex];

    track.steps[stepIndex] = false;

    if (Array.isArray(track.pins)) {
      track.pins[stepIndex] = null;
    }

    Object.values(track.offsets)
      .forEach(values => {
        if (Array.isArray(values)) {
          values[stepIndex] = 0;
        }
      });
  });

  return true;
}

function pasteClipboardAt(targetStepIndex) {
  const clipboard = editSelection.clipboard;

  if (!clipboard?.cells?.length) {
    return false;
  }

  const minimumSourceTrack =
    Math.min(
      ...clipboard.cells.map(
        cell => cell.trackOffset
      )
    );

  saveHistory();

  clipboard.cells.forEach(cell => {
    const trackIndex =
      clipboard.mode === "all"
        ? cell.trackOffset -
          minimumSourceTrack
        : state.selectedTrackIndex;

    const stepIndex =
      targetStepIndex +
      cell.stepOffset;

    if (
      trackIndex < 0 ||
      trackIndex >= tracks.length ||
      stepIndex < 0 ||
      stepIndex >= STEP_COUNT
    ) {
      return;
    }

    const track = tracks[trackIndex];

    track.steps[stepIndex] =
      cell.stepOn;

    if (Array.isArray(track.pins)) {
      track.pins[stepIndex] =
        cell.pin === "a" || cell.pin === "b" || cell.pin === "c"
          ? cell.pin
          : null;
    }

    Object.entries(cell.offsets)
      .forEach(([id, value]) => {
        if (Array.isArray(track.offsets[id])) {
          track.offsets[id][stepIndex] = value;
        }
      });
  });

  return true;
}

function renderEditActionToolbar() {
  const header =
    document.querySelector(
      ".app-header"
    );

  if (!header) {
    return;
  }

  let toolbar =
    header.querySelector(
      ".edit-action-toolbar"
    );

  if (editSelection.mode !== "step") {
    toolbar?.remove();

    header.classList.remove(
      "editing-actions-visible"
    );

    return;
  }

  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className =
      "edit-action-toolbar";
    header.appendChild(toolbar);
  }

  header.classList.add(
    "editing-actions-visible"
  );

  const hasSelection =
    editSelection.selected.size > 0;

  const hasClipboard =
    Boolean(
      editSelection.clipboard?.cells?.length
    );

  const canPaste =
    hasClipboard && hasSelection;

  toolbar.innerHTML = `
    <button type="button" data-action="cancel">cancel</button>
    <button type="button" data-action="copy" ${hasSelection ? "" : "disabled"}>copy</button>
    <button type="button" data-action="cut" ${hasSelection ? "" : "disabled"}>cut</button>
    <button type="button" data-action="delete" ${hasSelection ? "" : "disabled"}>delete</button>
    <button type="button" data-action="paste" ${canPaste ? "" : "disabled"}>paste</button>
  `;

  toolbar.querySelector(
    '[data-action="cancel"]'
  ).onclick = () => finishEditMode();

  toolbar.querySelector(
    '[data-action="copy"]'
  ).onclick = () => {
    if (!captureClipboard()) {
      return;
    }

    clearEditSelection();
    renderSequence();
    renderEditor();
    updateSelectionClasses();
  };

  toolbar.querySelector(
    '[data-action="cut"]'
  ).onclick = () => {
    if (!captureClipboard()) {
      return;
    }

    saveHistory();
    deleteSelectedSequenceCells({ save: false });
    clearEditSelection();
    renderSequence();
    renderEditor();
    updateSelectionClasses();
  };

  toolbar.querySelector(
    '[data-action="delete"]'
  ).onclick = () => {
    if (!deleteSelectedSequenceCells()) {
      return;
    }

    clearEditSelection();
    renderSequence();
    renderEditor();
    updateSelectionClasses();
  };

  toolbar.querySelector(
    '[data-action="paste"]'
  ).onclick = () => {
    const targets =
      selectedKeysSorted();

    if (!targets.length) {
      return;
    }

    const targetStepIndex =
      Math.min(
        ...targets.map(
          target => target.stepIndex
        )
      );

    if (!pasteClipboardAt(
      targetStepIndex
    )) {
      return;
    }

    finishEditMode();
  };
}

function enableSelectionPointer({
  element,
  mode,
  source,
  getStepIndex
}) {
  let pointerId = null;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let interactionActive = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cellFromPoint(clientX, clientY) {
    const target = document.elementFromPoint(
      clientX,
      clientY
    );

    const selector =
      source === "sequence"
        ? ".sequence-step[data-step-index]"
        : source === "step-editor"
          ? ".step-edit-cell[data-step-index]"
          : ".offset-step[data-step-index]";

    const cellElement =
      target?.closest?.(selector);

    if (!cellElement) {
      return null;
    }

    return {
      trackIndex:
        source === "sequence"
          ? 0
          : state.selectedTrackIndex,
      stepIndex:
        Number(cellElement.dataset.stepIndex)
    };
  }

  function keySelected(cell) {
    if (source === "sequence") {
      return isStepSelectedForCurrentScope(
        cell.stepIndex
      );
    }

    return editSelection.selected.has(
      selectionKey(
        cell.trackIndex,
        cell.stepIndex
      )
    );
  }

  function applyCell(cell, selected) {
    if (source === "sequence") {
      selectStepForCurrentScope(
        cell.stepIndex,
        selected
      );
      return;
    }

    setSelectionCell(
      cell.trackIndex,
      cell.stepIndex,
      selected
    );
  }

  function applySweep(currentCell) {
    const anchor = editSelection.sweepAnchor;
    const baseline =
      editSelection.sweepBaseline ?? new Set();

    if (!anchor || !currentCell) {
      return;
    }

    editSelection.selected =
      new Set(baseline);

    const minimumStep = Math.min(
      anchor.stepIndex,
      currentCell.stepIndex
    );

    const maximumStep = Math.max(
      anchor.stepIndex,
      currentCell.stepIndex
    );

    for (
      let stepIndex = minimumStep;
      stepIndex <= maximumStep;
      stepIndex++
    ) {
      applyCell(
        {
          trackIndex:
            source === "sequence"
              ? 0
              : state.selectedTrackIndex,
          stepIndex
        },
        editSelection.sweepValue
      );
    }

    updateSelectionClasses();
  }

  function startSelectionInteraction(
    event,
    cell
  ) {
    interactionActive = true;

    editSelection.sweepPointerId =
      event.pointerId;

    editSelection.sweepAnchor = cell;

    editSelection.sweepBaseline =
      new Set(editSelection.selected);

    editSelection.sweepValue =
      !keySelected(cell);

    applySweep(cell);

    element.setPointerCapture?.(
      event.pointerId
    );
  }

  element.style.touchAction = "none";

  element.addEventListener(
    "pointerdown",
    event => {
      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      interactionActive = false;

      const cell = {
        trackIndex:
          source === "sequence"
            ? 0
            : state.selectedTrackIndex,
        stepIndex: getStepIndex(element)
      };

      if (editSelection.mode === mode) {
  event.preventDefault();

  startSelectionInteraction(
    event,
    cell
  );

  /*
   * Offset選択モード中に
   * もう一度長押しすると解除する。
   *
   * 指を動かした場合は、
   * 通常の範囲選択スイープとして扱う。
   */
  if (
    mode === "offset" &&
    source === "offset"
  ) {
    clearTimer();

    timer = window.setTimeout(
      () => {
        interactionActive = false;

        finishOffsetSelectionMode();
      },
      LONG_PRESS_MS
    );
  }

  return;
}

      const canLongPress =
        (
          mode === "step" &&
          source === "sequence"
        ) ||
        (
          mode === "offset" &&
          source === "offset"
        );

      if (!canLongPress) {
        return;
      }

      clearTimer();

      timer = window.setTimeout(
        () => {
          if (mode === "step") {
            beginStepEditMode(
              cell.stepIndex
            );
          } else {
            beginOffsetSelectionMode(
              cell.stepIndex
            );
          }

          interactionActive = true;
          editSelection.sweepPointerId =
            event.pointerId;
          editSelection.sweepAnchor = cell;
          editSelection.sweepBaseline =
            new Set();
          editSelection.sweepValue = true;

          element.setPointerCapture?.(
            event.pointerId
          );
        },
        LONG_PRESS_MS
      );
    }
  );

  element.addEventListener(
    "pointermove",
    event => {
      if (pointerId !== event.pointerId) {
        return;
      }

      const movement = Math.hypot(
        event.clientX - startX,
        event.clientY - startY
      );

      if (!interactionActive) {
        if (movement > 12) {
          clearTimer();
        }

        return;
      }

      if (
  interactionActive &&
  movement > 12
) {
  clearTimer();
}

      if (editSelection.mode !== mode) {
        return;
      }

      event.preventDefault();

      applySweep(
        cellFromPoint(
          event.clientX,
          event.clientY
        )
      );
    }
  );

  function finish(event) {
    if (pointerId !== event.pointerId) {
      return;
    }

    clearTimer();

    if (
      element.hasPointerCapture?.(
        event.pointerId
      )
    ) {
      element.releasePointerCapture(
        event.pointerId
      );
    }

    pointerId = null;
    interactionActive = false;
    editSelection.sweepPointerId = null;
    editSelection.sweepAnchor = null;
    editSelection.sweepBaseline = null;
  }

  element.addEventListener(
    "pointerup",
    finish
  );

  element.addEventListener(
    "pointercancel",
    finish
  );

  element.addEventListener(
    "click",
    event => {
      if (editSelection.mode !== mode) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
}

function applyOffsetDeltaToSelection(
  parameter,
  delta,
  startValues
) {
  if (
    editSelection.mode !==
      "offset" ||
    editSelection.selected.size ===
      0 ||
    !(startValues instanceof Map)
  ) {
    return false;
  }

  const track =
    editorTrack();

  const values =
    track.offsets[
      parameter.id
    ];

  if (!Array.isArray(values)) {
    return false;
  }

  const baseValue =
    Number(
      track.base[
        parameter.id
      ]
    );

  const baseIndex =
    parameter.id === "crushRate"
      ? crushRateIndex(baseValue)
      : null;

  const minOffset =
    parameter.id === "crushRate"
      ? -baseIndex
      : parameter.min -
        baseValue;

  const maxOffset =
    parameter.id === "crushRate"
      ? CRUSH_RATE_VALUES.length - 1 - baseIndex
      : parameter.max -
        baseValue;

  selectedKeysSorted()
    .forEach(
      ({
        trackIndex,
        stepIndex
      }) => {
        if (
          trackIndex !==
          state.selectedTrackIndex
        ) {
          return;
        }

        const key =
          selectionKey(
            trackIndex,
            stepIndex
          );

        const startOffset =
          Number(
            startValues.get(
              key
            )
          ) || 0;

        values[
          stepIndex
        ] =
          roundToStep(
            clamp(
              startOffset +
                delta,
              minOffset,
              maxOffset
            ),
            parameter.step ??
              1
          );
      }
    );

  return true;
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

  enableSelectionPointer({
    element: button,
    mode: "step",
    source: "sequence",
    getStepIndex: element =>
      Number(element.dataset.stepIndex)
  });

  if (
    editSelection.mode === "step" &&
    isWholeStepSelected(stepIndex)
  ) {
    button.classList.add(
      "range-selected"
    );
  }

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
      if (editSelection.mode === "step") return;
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

      saveTrackHistory();

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
  x="5"
  y="5"
  width="14"
  height="14"
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

function renderStepEditScopeControl() {
  const toolbar =
    document.querySelector(
      ".sequence-toolbar"
    );

  if (!toolbar) {
    return;
  }

  toolbar
    .querySelector(
      ".step-edit-scope-control"
    )
    ?.remove();

  if (editSelection.mode !== "step") {
    return;
  }

  const control =
    document.createElement("div");

  control.className =
    "step-edit-scope-control";

  ["all", "track"].forEach(scope => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.textContent = scope;
    button.className =
      "step-edit-scope-button";

    button.classList.toggle(
      "active",
      editSelection.scope === scope
    );

    button.setAttribute(
      "aria-pressed",
      String(
        editSelection.scope === scope
      )
    );

    button.addEventListener(
      "click",
      () => {
        if (editSelection.scope === scope) {
          return;
        }

        editSelection.scope = scope;
        clearEditSelection();
        applyStepEditScopeClass();
        renderSequence();
        updateSelectionClasses();
      }
    );

    control.appendChild(button);
  });

  const sourceDisplay =
  toolbar.querySelector(
    ".current-source-display"
  );

if (sourceDisplay) {
  sourceDisplay.appendChild(
    control
  );
} else {
  toolbar.prepend(control);
}
}

export function renderSequence() {
  sequenceGrid.innerHTML = "";
  renderEditActionToolbar();

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

  renderStepEditScopeControl();
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
  const track = editorTrack();
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
      return "c";
    }

    if (value < 50) {
      return `l${50 - value}`;
    }

    return `r${value - 50}`;
  }

  if (
  parameter.id === "probability" ||
  parameter.id === "subProbability"
) {
  return `${value}`;
}

if (parameter.id === "crushLevel") {
  return String(value);
}

  if (parameter.id === "crushBit") {
    return `${Math.round(Number(value) || 1)}bit`;
  }

  if (parameter.id === "crushRate") {
    return `x${crushRateValue(crushRateIndex(value))}`;
  }

  if (parameter.id === "subPattern") {
    return subPatternLabel(value);
  }

  if (parameter.id === "subCrescendo") {
    const amount = Math.round(Number(value) || 0);
    return amount > 0 ? `+${amount}` : String(amount);
  }

  if (parameter.id === "glide") {
    const amount = Math.round(Number(value) || 0);
    return amount === 0 ? "off" : String(amount);
  }

  if (parameter.id === "nudge" || parameter.id === "strum") {
    const amount = Math.round(Number(value) || 0);
    return amount > 0 ? `+${amount}` : String(amount);
  }

  if (parameter.id === "filterCutoff") {
    if (value === 0) {
      return "off";
    }

    return value < 0
      ? `lp${Math.abs(value)}`
      : `hp${value}`;
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
  const track = editorTrack();

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

  const articulationSelectedId =
    articulationParameter.children.some(
      child => child.id === editorTrack().articulationSelectedId
    )
      ? editorTrack().articulationSelectedId
      : "glide";

  const parentSweepParameter =
  parameter?.id === "crush"
    ? parameterById("crushLevel")
    : parameter?.id === "reverb"
    ? parameterById("reverbSend")
    : parameter?.id === "sub"
    ? parameterById("subPattern")
    : parameter?.id === "articulation"
  ? parameterById(
      articulationSelectedId
    )
    : parameter?.id === "lfo"
    ? parameterById(
        editorTrack().lfoSelected === 2
          ? "lfo2Depth"
          : "lfo1Depth"
      )
    : parameter?.id === "osc"
      ? parameterById(
          editorTrack().oscSelectedId ===
            "noiseVolume" ||
          editorTrack().oscSelectedId ===
            "noiseDecay"
            ? "noiseVolume"
            : "sineVolume"
        )
      : parameter?.id === "envelope"
        ? parameterById(
            editorTrack().envelopeSelectedId ??
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
              editorTrack().envelopeSelectedId
          )
            ? editorTrack().envelopeSelectedId
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
    : parameter?.id === "articulation"
      ? parameterById(articulationSelectedId)
    : parameter?.id === "crush"
      ? parameterById("crushLevel")
    : parameter?.id === "reverb"
      ? parameterById("reverbSend")
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
    : parameter?.id === "articulation"
      ? articulationParameter.children.find(
          child =>
            child.id ===
            articulationSelectedId
        )?.icon ?? "glide"
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
          ? `<span class="lfo-menu-number">${editorTrack().lfoSelected === 2 ? "2" : "1"}</span>`
          : ""
      }
    </span>

    <span class="parameter-value">
  ${
    parameter?.id === "sub"
      ? subPatternFigureHtml(
          editorTrack().base.subPattern ?? -1
        )
      : valueText
  }
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
      editorTrack().fxMuted
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
          editorTrack();

        /*
         * ミュート中は
         * シングルタップで即解除。
         */
        if (track.fxMuted) {
          saveTrackHistory();

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
          saveTrackHistory();

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
        editorTrack().base[
          parentSweepParameter.id
        ]
      );
    },

    setValue: nextValue => {
      if (!parentSweepHistorySaved) {
        saveTrackHistory();

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

      editorTrack().base[
        parentSweepParameter.id
      ] = correctedValue;

      const valueElement =
        button.querySelector(
          ".parameter-value"
        );

      if (valueElement) {
        if (parameter?.id === "sub") {
          valueElement.innerHTML =
            subPatternFigureHtml(
              editorTrack().base.subPattern ?? -1
            );
        } else {
          valueElement.textContent =
            displayBaseValue(
              parentSweepParameter
            );
        }
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
                editorTrack().envelopeSelectedId
            )
              ? editorTrack().envelopeSelectedId
              : "decay"
          )
        : parameter.id === "osc"
          ? (
              oscParameter.children.some(
                child =>
                  child.id ===
                  editorTrack().oscSelectedId
              )
                ? editorTrack().oscSelectedId
                : "sineVolume"
            )
          : parameter.id === "lfo"
            ? "settings"
          : parameter.id === "articulation"
            ? articulationSelectedId
          : parameter.id === "reverb"
            ? "reverbSend"
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
  const track = editorTrack();

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
        saveTrackHistory();
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
              saveTrackHistory();

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
  const track = editorTrack();

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
        saveTrackHistory();
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
              saveTrackHistory();

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
    editorTrack();

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
      saveTrackHistory();

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

      saveTrackHistory();

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
        ${editorTrack().id}
      </span>
    </button>

    <div class="editor-header-spacer"></div>

    <button
      class="mini-button mute ${editorTrack().muted ? "active" : ""}"
      type="button"
      data-focus-key="menu-mute"
    >
      M
    </button>

    <button
      class="mini-button solo ${editorTrack().solo ? "active" : ""}"
      type="button"
      data-focus-key="menu-solo"
    >
      S
    </button>
  `;

  topRow.appendChild(
    createTrackVolumeControl()
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

  topRow.appendChild(
    sequenceEraseButton
  );

  const songEditorToggle =
  document.createElement("button");

songEditorToggle.type =
  "button";

songEditorToggle.className =
  "view-toggle-button editor-view-toggle";

songEditorToggle.dataset.focusKey =
  "editor-view-toggle";

songEditorToggle.setAttribute(
  "aria-label",
  "Song編集へ切り替え"
);

songEditorToggle.innerHTML = `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 3h11l3 3v15H5z"></path>
    <path d="M16 3v4h4"></path>

    <path d="M14 8v8"></path>
<circle cx="11.5" cy="16" r="1.5"></circle>
  </svg>
`;

songEditorToggle.addEventListener(
  "click",
  () => {
    songEditorView = true;
    renderSongMode();
  }
);

topRow.appendChild(
  songEditorToggle
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
    editorTrack().soundName ||
    `sound ${String(editorTrack().id).padStart(2, "0")}`;

  soundName.setAttribute(
    "aria-label",
    `サウンド名 ${soundName.textContent}。プリセットを開く`
  );

  soundName.addEventListener(
    "click",
    openSoundPresetModal
  );

  const pinButton =
    document.createElement("button");

  pinButton.type = "button";
  pinButton.className = "mini-button pin-button";
  pinButton.dataset.focusKey = "menu-pin";
  pinButton.innerHTML = getParameterIcon("pin");

  const pinEnabled =
    isPinModeEnabled();

  bottomRow.classList.toggle(
    "pin-mode-enabled-row",
    pinEnabled
  );

  pinButton.classList.toggle(
    "active",
    pinEnabled
  );

  pinButton.setAttribute(
    "aria-label",
    pinEnabled
      ? pinEditSlot
        ? `pin ${pinEditSlot} editing`
        : "pin main editing"
      : "pin off"
  );

  let pinLongPressTimer = null;
  let pinLongPressTriggered = false;

  pinButton.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    pinLongPressTriggered = false;

    pinLongPressTimer = window.setTimeout(() => {
      pinLongPressTriggered = true;

      saveTrackHistory();

      setPinModeEnabled(
        !isPinModeEnabled()
      );

      state.selectedParameterId = null;
      state.selectedChildId = null;

      renderEditorAndRestore("menu-pin");
    }, LONG_PRESS_MS);
  });

  function clearPinLongPress() {
    if (pinLongPressTimer !== null) {
      clearTimeout(pinLongPressTimer);
      pinLongPressTimer = null;
    }
  }

  pinButton.addEventListener("pointerup", clearPinLongPress);
  pinButton.addEventListener("pointercancel", clearPinLongPress);
  pinButton.addEventListener("pointerleave", clearPinLongPress);

  pinButton.addEventListener("click", event => {
    if (pinLongPressTriggered) {
      event.preventDefault();
      pinLongPressTriggered = false;
      return;
    }

    if (!isPinModeEnabled()) {
      return;
    }

    pinPlacementMode = true;
    renderEditor();
  });

  const pinTabs =
    document.createElement("div");

  pinTabs.className = "pin-sound-tabs";
  pinTabs.hidden = !pinEnabled;

  [null, "a", "b", "c"].forEach(slot => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.textContent = slot ?? "・";
    button.className = "pin-sound-tab";
    button.classList.toggle("active", pinEditSlot === slot);
    button.setAttribute(
      "aria-label",
      slot ? `pin ${slot}` : "main sound"
    );

    button.addEventListener("click", () => {
      setPinEditSlot(slot);
      state.selectedParameterId = null;
      renderEditor();
    });

    pinTabs.appendChild(button);
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
    pinTabs,
    pinButton,
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

      /*
       * Track対象の範囲選択中は、
       * Track切替前の選択を引き継がない。
       */
      if (
        editSelection.mode === "step" &&
        editSelection.scope === "track"
      ) {
        clearEditSelection();
      }

      renderSequence();

      renderEditorAndRestore(
        "menu-track"
      );

      updateSelectionClasses();
    }
  );

  topRow
    .querySelector(
      ".mute"
    )
    .addEventListener(
      "click",
      () => {
        editorTrack().muted =
          !editorTrack().muted;

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
        editorTrack().solo =
          !editorTrack().solo;

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
  parameterMenuItems.slice(0, 8);

const fxParameterItems =
  parameterMenuItems.slice(8, 14);

const timingParameterItems =
  parameterMenuItems.slice(14, 16);

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
  editorTrack().fxMuted
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
  const track = editorTrack();

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

  if (
    parameter.id === "note" &&
    Number(track.base.chord) === 0 &&
    ["voices", "inversion",].includes(id)
  ) {
    value.classList.add("chord-inactive");
  }

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
    if (id === "chord") {
      return CHORD_NAMES[clamp(Math.round(Number(track.base[id]) || 0), 0, CHORD_NAMES.length - 1)] ?? "off";
    }

    if (id === "inversion") {
      const inversion = clamp(Math.round(Number(track.base[id]) || 0), 0, 3);
      return String(inversion);
    }

    if (id === "subPattern") {
      return subPatternLabel(track.base[id]);
    }

    if (id === "subCrescendo") {
      const amount = Math.round(Number(track.base[id]) || 0);
      return amount > 0 ? `+${amount}` : String(amount);
    }

    if (id === "subProbability") {
      return `${Math.round(Number(track.base[id]) || 0)}`;
    }

    if (id === "delayTime") {
      return (
        delayNames[
          Math.round(
            track.base[id]
          )
        ] ?? "1/16"
      );
    }

    if (id === "crushRate") {
      return `x${crushRateValue(crushRateIndex(track.base[id]))}`;
    }

    if (id === "filterCutoff") {
      const cutoffValue =
        Number(track.base[id]) || 0;

      if (cutoffValue === 0) {
        return "0";
      }

      return cutoffValue < 0
        ? `lp${Math.abs(cutoffValue)}`
        : `hp${cutoffValue}`;
    }

    return String(
      track.base[id]
    );
  }

  if (id === "subPattern") {
    value.innerHTML =
      subPatternFigureHtml(track.base[id]);

    value.setAttribute(
      "aria-label",
      `base ${subPatternLabel(track.base[id])}`
    );
  } else {
    value.textContent =
      displayValue();
  }

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
let offsetSelectionStartValues =
  null;

value.addEventListener(
  "pointerdown",
  () => {
    offsetSelectionStartValues =
      null;

    if (
      editSelection.mode !==
        "offset" ||
      !Array.isArray(
        track.offsets[id]
      )
    ) {
      return;
    }

    offsetSelectionStartValues =
      new Map();

    selectedKeysSorted()
      .forEach(
        ({
          trackIndex,
          stepIndex
        }) => {
          if (
            trackIndex !==
            state.selectedTrackIndex
          ) {
            return;
          }

          offsetSelectionStartValues.set(
            selectionKey(
              trackIndex,
              stepIndex
            ),
            Number(
              track.offsets[id][
                stepIndex
              ]
            ) || 0
          );
        }
      );
  }
);

  enableVerticalSweep({
  element: value,

  getValue: () => {
    if (
      editSelection.mode ===
        "offset"
    ) {
      return 0;
    }

    if (id === "crushRate") {
      return crushRateIndex(
        track.base[id]
      );
    }

    return Number(
      track.base[id]
    );
  },

    setValue: nextValue => {
      if (!sweepHistorySaved) {
        saveTrackHistory();

        sweepHistorySaved =
          true;
      }

      const finiteValue =
  Number.isFinite(
    Number(nextValue)
  )
    ? Number(nextValue)
    : 0;

if (
  editSelection.mode ===
    "offset" &&
  Array.isArray(
    track.offsets[id]
  )
) {
  const delta =
    roundToStep(
      finiteValue,
      definition.step
    );

  applyOffsetDeltaToSelection(
    {
      ...definition,
      id
    },
    delta,
    offsetSelectionStartValues
  );
} else {
  if (id === "crushRate") {
    track.base[id] =
      crushRateValue(
        finiteValue
      );
  } else {
    const clampedValue =
      clamp(
        finiteValue,
        definition.min,
        definition.max
      );

    const correctedValue =
      id === "delayTime"
        ? Math.round(
            clampedValue
          )
        : roundToStep(
            clampedValue,
            definition.step
          );

    track.base[id] =
      correctedValue;
  }
}

      if (id === "subPattern") {
        value.innerHTML =
          subPatternFigureHtml(track.base[id]);

        value.setAttribute(
          "aria-label",
          `base ${subPatternLabel(track.base[id])}`
        );
      } else {
        value.textContent =
          displayValue();
      }

/*
 * ベース値変更中も、
 * 各ステップの実効値をリアルタイム更新する。
 */
document
  .querySelectorAll(
    ".offset-step[data-step-index]"
  )
  .forEach(
    offsetButton => {
      const stepIndex =
        Number(
          offsetButton.dataset
            .stepIndex
        );

      const displayParameter =
        parameterById(id) ??
        {
          ...definition,
          id,
          offsetMode: activeChild.offsetMode ?? parameter.offsetMode ?? "offset"
        };

      if (id === "subPattern") {
        const result = clamp(
          Math.round(
            Number(track.base.subPattern) +
            Number(track.offsets.subPattern?.[stepIndex] ?? 0)
          ),
          -1,
          6
        );

        offsetButton.innerHTML =
          subPatternFigureHtml(result);

        offsetButton.setAttribute(
          "aria-label",
          subPatternLabel(result)
        );
      } else {
        offsetButton.textContent =
          displayStepValue(
            displayParameter,
            stepIndex
          );
      }

      const stepOffset =
        Number(
          track.offsets[id]?.[
            stepIndex
          ]
        ) || 0;

      offsetButton.classList.toggle(
        "base-value-step",
        stepOffset === 0
      );
    }
  );
    },

    min: () =>
  editSelection.mode ===
    "offset"
    ? -10000
    : id === "crushRate"
      ? 0
      : definition.min,

max: () =>
  editSelection.mode ===
    "offset"
    ? 10000
    : id === "crushRate"
      ? CRUSH_RATE_VALUES.length - 1
      : definition.max,

step:
  id === "crushRate"
    ? 1
    : definition.step,

    /*
     * Delay Timeは選択肢が
     * 11段階だけなので加速しない。
     */
    acceleration:
      id !== "delayTime" &&
      id !== "crushRate",

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

      offsetSelectionStartValues =
  null;

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
          saveTrackHistory();

          if (
            editSelection.mode === "offset" &&
            Array.isArray(track.offsets[id])
          ) {
            applyOffsetDeltaToSelection(
              { ...definition, id },
              currentIndex - previousValue
            );
          } else {
            track.base[id] = currentIndex;
          }
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

      if (id === "crushRate") {
        const input =
          document.createElement(
            "input"
          );

        input.type = "text";
        input.readOnly = true;
        input.className = "base-input";
        input.dataset.focusKey = valueKey;
        input.dataset.keyboardEditing = "true";

        let currentIndex =
          crushRateIndex(
            track.base[id]
          );

        const startIndex =
          currentIndex;

        input.value =
          `x${crushRateValue(currentIndex)}`;

        value.replaceWith(input);
        input.focus();
        input.select();

        let finished = false;

        const finish =
          shouldCommit => {
            if (finished) return;
            finished = true;

            if (shouldCommit) {
              const previousIndex =
                crushRateIndex(
                  track.base[id]
                );

              if (
                currentIndex !==
                previousIndex
              ) {
                saveTrackHistory();

                if (
                  editSelection.mode === "offset" &&
                  Array.isArray(track.offsets[id])
                ) {
                  applyOffsetDeltaToSelection(
                    { ...definition, id },
                    currentIndex - previousIndex
                  );
                } else {
                  track.base[id] =
                    crushRateValue(currentIndex);
                }
              }
            } else {
              currentIndex = startIndex;
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
              currentIndex = clamp(
                currentIndex + 1,
                0,
                CRUSH_RATE_VALUES.length - 1
              );
              input.value = `x${crushRateValue(currentIndex)}`;
              input.select();
              return;
            }

            if (
              event.key === "ArrowDown" ||
              event.key === "ArrowLeft"
            ) {
              event.preventDefault();
              event.stopPropagation();
              currentIndex = clamp(
                currentIndex - 1,
                0,
                CRUSH_RATE_VALUES.length - 1
              );
              input.value = `x${crushRateValue(currentIndex)}`;
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
              saveTrackHistory();

              if (
                editSelection.mode === "offset" &&
                Array.isArray(track.offsets[id])
              ) {
                applyOffsetDeltaToSelection(
                  { ...definition, id },
                  nextValue - previousValue
                );
              } else {
                track.base[id] = nextValue;
              }
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

function displayStepValue(
  parameter,
  stepIndex
) {
  const track =
    editorTrack();

  const offset =
    track.offsets[
      parameter.id
    ]?.[stepIndex] ?? 0;

  const result =
    parameter.id === "crushRate"
      ? crushRateValue(
          crushRateIndex(
            track.base.crushRate
          ) +
          Math.round(
            Number(offset) || 0
          )
        )
      : roundToStep(
          clamp(
            Number(
              track.base[
                parameter.id
              ]
            ) +
              Number(offset),
            parameter.min,
            parameter.max
          ),
          parameter.step ?? 1
        );

  /*
   * NOTEだけは従来どおり
   * 実際の音名で表示する。
   */
  if (
    parameter.id === "note"
  ) {
    const names = [
      "C", "C#", "D", "D#",
      "E", "F", "F#", "G",
      "G#", "A", "A#", "B"
    ];

    const midi =
      60 + result;

    return `${
      names[
        (midi % 12 + 12) % 12
      ]
    }${
      Math.floor(
        midi / 12
      ) - 1
    }`;
  }

  if (parameter.id === "chord") {
    return CHORD_NAMES[clamp(Math.round(result), 0, CHORD_NAMES.length - 1)] ?? "off";
  }

  if (parameter.id === "inversion") {
    const inversion = clamp(Math.round(result), 0, 3);
    return String(inversion);
  }

  /*
   * Delay Timeは
   * 実効値を音価で表示。
   */
  if (
    parameter.id ===
      "delayTime"
  ) {
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

    return (
      delayNames[
        Math.round(result)
      ] ?? "1/16"
    );
  }

  /*
   * Filter Cutoffも
   * ベース値表示と同じ形式。
   */
  if (
    parameter.id ===
      "filterCutoff"
  ) {
    if (result === 0) {
      return "0";
    }

    return result < 0
      ? `lp${Math.abs(result)}`
      : `hp${result}`;
  }

  /*
   * Panも実際の位置を表示。
   */
  if (
    parameter.id === "pan"
  ) {
    if (result === 50) {
      return "c";
    }

    return result < 50
      ? `l${50 - result}`
      : `r${result - 50}`;
  }

  if (parameter.id === "glide") {
    const amount = Math.round(Number(result) || 0);
    return amount === 0 ? "off" : String(amount);
  }

  if (parameter.id === "nudge" || parameter.id === "strum") {
    const amount = Math.round(Number(result) || 0);
    return amount > 0 ? `+${amount}` : String(amount);
  }

  if (parameter.id === "crushRate") {
    return `x${result}`;
  }

  /*
   * Probabilityは実効値を表示。
   */
  if (parameter.id === "subPattern") {
    return subPatternLabel(result);
  }

  if (parameter.id === "subCrescendo") {
    const amount = Math.round(Number(result) || 0);
    return amount > 0 ? `+${amount}` : String(amount);
  }

  if (
    parameter.id === "probability" ||
    parameter.id === "subProbability"
  ) {
    return `${result}`;
  }

  /*
   * その他はすべて
   * base + offset の実効値を表示。
   */
  return String(result);
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
    editorTrack().stepLength
  );

  for (
    let stepIndex = firstStepIndex;
    stepIndex < lastStepIndex;
    stepIndex++
  ) {
    const track = editorTrack();

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

    if (parameter.id === "subPattern") {
      const result = clamp(
        Math.round(
          Number(track.base.subPattern) +
          Number(track.offsets.subPattern?.[stepIndex] ?? 0)
        ),
        -1,
        6
      );

      button.innerHTML =
        subPatternFigureHtml(result);

      button.setAttribute(
        "aria-label",
        subPatternLabel(result)
      );
    } else {
      button.textContent =
        displayStepValue(
          parameter,
          stepIndex
        );
    }

      button.classList.toggle(
  "base-value-step",
  (
    Number(
      track.offsets[
        parameter.id
      ]?.[stepIndex]
    ) || 0
  ) === 0
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

    enableSelectionPointer({
      element: button,
      mode: "offset",
      source: "offset",
      getStepIndex: element =>
        Number(element.dataset.stepIndex)
    });

    if (editSelection.mode === "offset" && editSelection.selected.has(selectionKey(state.selectedTrackIndex, stepIndex))) {
      button.classList.add("range-selected");
    }


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
        if (editSelection.mode === "offset") {
          return;
        }

        /*
         * Undo履歴は
         * 1回のスイープにつき1回だけ保存。
         */
        if (!sweepHistorySaved) {
          saveTrackHistory();
          sweepHistorySaved = true;
        }

        track.offsets[
          parameter.id
        ][stepIndex] =
          nextOffset;

        if (parameter.id === "subPattern") {
          const result = clamp(
            Math.round(
              Number(track.base.subPattern) +
              Number(track.offsets.subPattern?.[stepIndex] ?? 0)
            ),
            -1,
            6
          );

          button.innerHTML =
            subPatternFigureHtml(result);

          button.setAttribute(
            "aria-label",
            subPatternLabel(result)
          );
        } else {
          button.textContent =
            displayStepValue(
              parameter,
              stepIndex
            );
        }
      },

      min:
        parameter.id === "crushRate"
          ? -crushRateIndex(
              track.base.crushRate
            )
          : parameter.min -
            Number(
              track.base[
                parameter.id
              ]
            ),

      max:
        parameter.id === "crushRate"
          ? CRUSH_RATE_VALUES.length - 1 -
            crushRateIndex(
              track.base.crushRate
            )
          : parameter.max -
            Number(
              track.base[
                parameter.id
              ]
            ),

      step:
        parameter.step ?? 1,

      acceleration:
        parameter.id !== "crushRate",

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
          parameter.id === "crushRate"
            ? -crushRateIndex(
                track.base.crushRate
              )
            : parameter.min -
              Number(
                track.base[
                  parameter.id
                ]
              );

        const maximumOffset =
          parameter.id === "crushRate"
            ? CRUSH_RATE_VALUES.length - 1 -
              crushRateIndex(
                track.base.crushRate
              )
            : parameter.max -
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
                saveTrackHistory();

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
  const track = editorTrack();

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

    clearOffsetSelectionMode();

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
    editorTrack();

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
      clearOffsetSelectionMode();

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
  const track = editorTrack();

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
      clearOffsetSelectionMode();

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
  const track = editorTrack();
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
    clearOffsetSelectionMode();

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
    saveTrackHistory();

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
            ? `${(Number(value) / 10).toFixed(1)}hz`
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
          ).toFixed(1)}hz`
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
    saveTrackHistory();

    if (editSelection.mode === "offset") {
      applyOffsetDeltaToSelection(
        { ...activeParameter, id: activeBaseId },
        keyboardValue - keyboardStartValue
      );
    } else {
      track.base[activeBaseId] = keyboardValue;
    }
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
let offsetSelectionStartValues =
  null;

baseValue.addEventListener(
  "pointerdown",
  () => {
    offsetSelectionStartValues =
      null;

    if (
      editSelection.mode !==
        "offset" ||
      !Array.isArray(
        track.offsets[
          activeBaseId
        ]
      )
    ) {
      return;
    }

    offsetSelectionStartValues =
      new Map();

    selectedKeysSorted()
      .forEach(
        ({
          trackIndex,
          stepIndex
        }) => {
          if (
            trackIndex !==
            state.selectedTrackIndex
          ) {
            return;
          }

          offsetSelectionStartValues.set(
            selectionKey(
              trackIndex,
              stepIndex
            ),
            Number(
              track.offsets[
                activeBaseId
              ][stepIndex]
            ) || 0
          );
        }
      );
  }
);

    enableVerticalSweep({
      element: baseValue,
      getValue: () => {
  if (
    editSelection.mode ===
      "offset"
  ) {
    return 0;
  }

  return Number(
    track.base[
      activeBaseId
    ]
  );
},
      setValue: nextValue => {
        if (!sweepHistorySaved) {
          saveTrackHistory();
          sweepHistorySaved = true;
        }
        const finiteValue =
  Number.isFinite(
    Number(nextValue)
  )
    ? Number(nextValue)
    : 0;

if (
  editSelection.mode ===
    "offset"
) {
  const delta =
    roundToStep(
      finiteValue,
      activeParameter.step ??
        1
    );

  applyOffsetDeltaToSelection(
    {
      ...activeParameter,
      id: activeBaseId
    },
    delta,
    offsetSelectionStartValues
  );
} else {
  const correctedValue =
    roundToStep(
      clamp(
        finiteValue,
        activeParameter.min,
        activeParameter.max
      ),
      activeParameter.step ??
        1
    );

  track.base[
    activeBaseId
  ] =
    correctedValue;
}
        updateBaseValue();

/*
 * LFOのベース値変更中も、
 * 各ステップの実効値をリアルタイム更新。
 */
document
  .querySelectorAll(
    ".offset-step[data-step-index]"
  )
  .forEach(
    offsetButton => {
      const stepIndex =
        Number(
          offsetButton.dataset
            .stepIndex
        );

      offsetButton.textContent =
        displayStepValue(
          activeParameter,
          stepIndex
        );

      const stepOffset =
        Number(
          track.offsets[
            activeBaseId
          ]?.[stepIndex]
        ) || 0;

      offsetButton.classList.toggle(
        "base-value-step",
        stepOffset === 0
      );
    }
  );
      },
      min: () =>
  editSelection.mode ===
    "offset"
    ? -10000
    : activeParameter.min,

max: () =>
  editSelection.mode ===
    "offset"
    ? 10000
    : activeParameter.max,

step:
  activeParameter.step ?? 1,
      onCommit: (startValue, currentValue, changed) => {
        sweepHistorySaved = false;
        offsetSelectionStartValues =
  null;

        if (changed) {
          renderEditorAndRestore(
            "lfo-base-value"
          );
        }
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
    saveTrackHistory();
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
    return `<svg viewBox="0 0 76 28" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[waveId] ?? paths.sine}</svg>`;
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
  if (parameter.id === "note") {
    header.classList.add("note-edit-toolbar");
  }

  if (parameter.id === "articulation") {
    header.classList.add("articulation-edit-toolbar");

    const selectedId =
      articulationParameter.children.some(
        child => child.id === editorTrack().articulationSelectedId
      )
        ? editorTrack().articulationSelectedId
        : "glide";

    editorTrack().articulationSelectedId = selectedId;
    state.selectedChildId = selectedId;
  }

  const back = document.createElement("button");
  back.type = "button";
  back.className = "track-cycle";
  back.dataset.focusKey = "edit-track";

  back.innerHTML = `
    <span class="track-icon">
      ${getParameterIcon("track")}
    </span>

    <span class="track-number">
      ${editorTrack().id}
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

  const editIconId =
  parameter.id === "articulation"
    ? (
        articulationParameter.children.find(
          child =>
            child.id ===
            editorTrack().articulationSelectedId
        )?.icon ?? "glide"
      )
    : parameter.icon;

icon.innerHTML =
  getParameterIcon(editIconId);

  icon.addEventListener("click", () => {
    clearOffsetSelectionMode();

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
      tab.textContent =
  child.label;

      if (state.selectedChildId === child.id) {
        tab.classList.add("active");
      }

      if (
        parameter.id === "note" &&
        Number(editorTrack().base.chord) === 0 &&
        ["voices", "inversion",].includes(child.id)
      ) {
        tab.classList.add("chord-inactive");
      }

      tab.addEventListener("click", () => {
        state.selectedChildId = child.id;

        if (parameter.id === "articulation") {
          editorTrack().articulationSelectedId = child.id;
        }

        renderEditorAndRestore(
          `base-value-${child.id}`
        );
      });

      tabs.appendChild(tab);
    });

    header.appendChild(tabs);

    activeId =
      parameter.children.some(
        child =>
          child.id ===
          state.selectedChildId
      )
        ? state.selectedChildId
        : parameter.children[0].id;

    state.selectedChildId =
      activeId;
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

  const activeOffsetId =
  activeChild?.id ??
  parameter.id;

const hasOffsets =
  !parameter.baseOnly &&
  !activeChild?.baseOnly &&
  Boolean(
    editorTrack().offsets[
      activeOffsetId
    ]
  );

  if (hasOffsets) {
    enableDoubleTapAction({
      element: offsetEraseButton,

      onDoubleTap: () => {
        const cleared =
  clearSelectedParameterOffsets(
    activeOffsetId
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

  if (!activeChild?.stepOnly) {
    header.appendChild(
      editValueControl(parameter, activeId)
    );
  }

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
  editorTrack().offsets[
    activeOffsetId
  ]
) {
  const offsetParameter =
    activeChild
      ? {
          ...parameter,
          ...activeChild,
          id: activeOffsetId,
          offsetMode: activeChild.offsetMode ?? parameter.offsetMode ?? "offset"
        }
      : parameter;

  editor.appendChild(
    renderOffsetGrid(
      offsetParameter
    )
  );
}
}


function restorePatternFocus(focusKey) {
  restoreFocusKey(focusKey);
}

const SOURCE_EDIT_LONG_PRESS_MS = 450;

const sourceEditState = {
  active: false,
  type: null,
  index: null
};

function closeSourceEditMode() {
  sourceEditState.active = false;
  sourceEditState.type = null;
  sourceEditState.index = null;

  document
    .querySelector(
      ".source-edit-toolbar"
    )
    ?.remove();

  document.body.classList.remove(
    "source-edit-mode"
  );
}

function openSourceEditMode(
  type,
  index
) {
  sourceEditState.active = true;
  sourceEditState.type = type;
  sourceEditState.index = index;

  document.body.classList.add(
    "source-edit-mode"
  );

  renderSourceEditToolbar();
}

function renderSourceEditToolbar() {
  document
    .querySelector(
      ".source-edit-toolbar"
    )
    ?.remove();

  if (!sourceEditState.active) {
    return;
  }

  const patternHeader =
  patternGrid
    ?.closest(".pattern-section")
    ?.querySelector(
      ".pattern-section-header"
    );

if (!patternHeader) {
  return;
}

  const toolbar =
    document.createElement("div");

  toolbar.className =
    "source-edit-toolbar";

  toolbar.innerHTML = `
    <button type="button" data-action="cancel">
      cancel
    </button>

    <button type="button" data-action="copy">
      copy
    </button>

    <button type="button" data-action="delete">
      delete
    </button>

    <button
      type="button"
      data-action="paste"
      ${
        hasSourceClipboard()
          ? ""
          : "disabled"
      }
    >
      paste
    </button>
  `;

  toolbar
    .querySelector(
      '[data-action="cancel"]'
    )
    .addEventListener(
      "click",
      () => {
        closeSourceEditMode();
        renderPatternManager();
      }
    );

    toolbar
  .querySelector(
    '[data-action="copy"]'
  )
  .addEventListener(
    "click",
    () => {
      const copied =
        copySource(
          sourceEditState.type,
          sourceEditState.index
        );

      if (!copied) {
        return;
      }

      renderSourceEditToolbar();
    }
  );

toolbar
  .querySelector(
    '[data-action="delete"]'
  )
  .addEventListener(
    "click",
    () => {
      const cleared =
        clearSource(
          sourceEditState.type,
          sourceEditState.index
        );

      if (!cleared) {
        return;
      }

      closeSourceEditMode();

      render();
    }
  );

toolbar
  .querySelector(
    '[data-action="paste"]'
  )
  .addEventListener(
    "click",
    () => {
      const pasted =
        pasteSource(
          sourceEditState.type,
          sourceEditState.index
        );

      if (!pasted) {
        return;
      }

      closeSourceEditMode();

      render();
    }
  );

  patternHeader.appendChild(
  toolbar
);
}


/* =========================
 * Song editor - stage 1
 * ========================= */
const SONG_PARTS_PER_PAGE = 32;
const SONG_PAGE_COUNT = 2;
const SONG_DRAG_START_DISTANCE = 6;
const SONG_DELETE_DISTANCE = 24;

function songPartLabel(source) {
  if (!source) return "";

  if (source.type === "fill") {
    return `f${source.index + 1}`;
  }

  if (source.type === "section") {
    return String.fromCharCode(65 + source.index);
  }

  return String(source.index + 1).padStart(2, "0");
}

function songInsertIndexFromPoint(clientX, clientY) {
  if (!songGrid) return song.sequence.length;

  const cell = document
    .elementFromPoint(clientX, clientY)
    ?.closest?.(".song-part-cell");

  if (!cell || !songGrid.contains(cell)) {
    return song.sequence.length;
  }

  const localIndex = Number(cell.dataset.songLocalIndex) || 0;
  const rect = cell.getBoundingClientRect();
  const afterCenter = clientX > rect.left + rect.width / 2;
  const pageStart = state.songPage * SONG_PARTS_PER_PAGE;

  return Math.max(
    0,
    Math.min(
      pageStart + localIndex + (afterCenter ? 1 : 0),
      song.sequence.length
    )
  );
}

function pointerInsideSongGrid(event) {
  if (!songGrid || !songEditorView) return false;
  const rect = songGrid.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function createSongDragGhost(button, event) {
  document
    .querySelectorAll(".song-drag-ghost")
    .forEach(ghost => ghost.remove());

  const rect = button.getBoundingClientRect();
  const ghost = button.cloneNode(true);
  ghost.classList.add("song-drag-ghost");
  ghost.removeAttribute("data-focus-key");
  ghost.tabIndex = -1;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);

  return {
    ghost,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
}

function enableExternalSourceDragToSong(
  button,
  sourceType,
  sourceIndex
) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let suppressClick = false;
  let ghostState = null;

  function moveGhost(event) {
    if (!ghostState) return;
    ghostState.ghost.style.left = `${event.clientX - ghostState.offsetX}px`;
    ghostState.ghost.style.top = `${event.clientY - ghostState.offsetY}px`;
  }

  function cleanup() {
    ghostState?.ghost.remove();
    ghostState = null;
    button.classList.remove("song-drag-origin");
    songGrid?.classList.remove("dragging");
  }

  function onMove(event) {
    if (event.pointerId !== pointerId) return;

    const distance = Math.hypot(
      event.clientX - startX,
      event.clientY - startY
    );

    if (!dragging && distance < SONG_DRAG_START_DISTANCE) return;

    if (!dragging) {
      dragging = true;
      suppressClick = true;
      button.classList.add("song-drag-origin");
      ghostState = createSongDragGhost(button, event);
    }

    event.preventDefault();
    moveGhost(event);
    songGrid?.classList.toggle("dragging", pointerInsideSongGrid(event));
  }

  function finish(event, cancelled = false) {
    if (event.pointerId !== pointerId) return;

    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);

    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    pointerId = null;

    const dropped =
      dragging &&
      !cancelled &&
      pointerInsideSongGrid(event);

    cleanup();

    if (!dropped || song.sequence.length >= 64) {
      dragging = false;
      return;
    }

    const insertIndex = songInsertIndexFromPoint(
      event.clientX,
      event.clientY
    );

    saveHistory();

    if (addSourceToSong(sourceType, sourceIndex, insertIndex)) {
      state.songPage = Math.floor(
        Math.min(insertIndex, 63) / SONG_PARTS_PER_PAGE
      );
      renderSongMode();
    }

    dragging = false;
  }

  function onUp(event) {
    finish(event, false);
  }

  function onCancel(event) {
    finish(event, true);
  }

  button.addEventListener("pointerdown", event => {
    if (!songEditorView) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    suppressClick = false;

    button.setPointerCapture(event.pointerId);

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
  });

  button.addEventListener(
    "click",
    event => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    },
    true
  );
}

function enableSongItemDrag(button, initialIndex) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let suppressClick = false;
  let historySaved = false;
  let currentIndex = initialIndex;
  let ghostState = null;

  function moveGhost(event) {
    if (!ghostState) return;
    ghostState.ghost.style.left = `${event.clientX - ghostState.offsetX}px`;
    ghostState.ghost.style.top = `${event.clientY - ghostState.offsetY}px`;
  }

  function songGridOutside(event) {
    const rect = songGrid.getBoundingClientRect();
    return (
      event.clientX < rect.left - SONG_DELETE_DISTANCE ||
      event.clientX > rect.right + SONG_DELETE_DISTANCE ||
      event.clientY < rect.top - SONG_DELETE_DISTANCE ||
      event.clientY > rect.bottom + SONG_DELETE_DISTANCE
    );
  }

  function onMove(event) {
    if (event.pointerId !== pointerId) return;

    const distance = Math.hypot(
      event.clientX - startX,
      event.clientY - startY
    );

    if (!dragging && distance < SONG_DRAG_START_DISTANCE) return;

    if (!dragging) {
      dragging = true;
      suppressClick = true;
      button.classList.add("song-drag-origin");
      ghostState = createSongDragGhost(button, event);
    }

    event.preventDefault();
    moveGhost(event);

    const deleteReady = songGridOutside(event);
    ghostState?.ghost.classList.toggle("delete-ready", deleteReady);
    songGrid.classList.toggle("delete-ready", deleteReady);

    if (deleteReady || !pointerInsideSongGrid(event)) return;

    let targetIndex = songInsertIndexFromPoint(event.clientX, event.clientY);
    if (targetIndex > currentIndex) targetIndex -= 1;
    targetIndex = Math.max(0, Math.min(targetIndex, song.sequence.length - 1));

    if (targetIndex === currentIndex) return;

    if (!historySaved) {
      saveHistory();
      historySaved = true;
    }

    if (moveSongSource(currentIndex, targetIndex)) {
      currentIndex = targetIndex;
      renderSongGrid();
    }
  }

  function finish(event, cancelled = false) {
    if (event.pointerId !== pointerId) return;

    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);

    if (button.hasPointerCapture?.(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    pointerId = null;

    if (dragging && !cancelled && songGridOutside(event)) {
      if (!historySaved) saveHistory();
      removeSongSource(currentIndex);
    }

    ghostState?.ghost.remove();
    ghostState = null;
    songGrid.classList.remove("delete-ready", "dragging");

    /*
     * 単純タップ時はここで再描画しない。
     *
     * pointerup直後に発生するclickを
     * 同じSongセルへ通すため。
     * 並べ替え／削除を行った時だけ再描画する。
     */
    if (dragging) {
      renderSongGrid();
    }

    dragging = false;
  }

  function onUp(event) { finish(event, false); }
  function onCancel(event) { finish(event, true); }

  button.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    suppressClick = false;
    historySaved = false;
    currentIndex = initialIndex;

    button.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
  });

  button.addEventListener(
    "click",
    event => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    },
    true
  );
}

const MASTER_EQ_LABELS = [
  "60", "120", "250", "500",
  "1k", "2k", "4k", "8k"
];

function ensureSongMasterMix() {
  if (!song.masterMix || typeof song.masterMix !== "object") {
    song.masterMix = {};
  }

  if (!Array.isArray(song.masterMix.eq)) {
    song.masterMix.eq = Array(8).fill(0);
  }

  song.masterMix.eq = Array.from(
    { length: 8 },
    (_, index) => clamp(
      Number(song.masterMix.eq[index]) || 0,
      -12,
      12
    )
  );

  song.masterMix.volume = clamp(
    Number.isFinite(Number(song.masterMix.volume))
      ? Number(song.masterMix.volume)
      : 100,
    0,
    100
  );

  song.masterMix.limiter = clamp(
    Number.isFinite(Number(song.masterMix.limiter))
      ? Number(song.masterMix.limiter)
      : -1,
    -24,
    0
  );

  song.masterMix.reverb = clamp(
    Number(song.masterMix.reverb) || 0,
    0,
    100
  );

  return song.masterMix;
}

function syncSongMasterMixAudio() {
  const mix = ensureSongMasterMix();

  mix.eq.forEach((value, index) => {
    setMasterMixEqBand(index, value);
  });

  setMasterMixVolume(mix.volume);
  setMasterLimiterThreshold(mix.limiter);
  setMasterReverb(mix.reverb);
}

/* =========================
 * Master Mix meter
 * lightweight realtime update
 * ========================= */

let masterMixMeterFrame = null;

const MASTER_MIX_METER_INTERVAL_MS = 50;
// 約20fps。
// ミキサーメーターとしては十分滑らかで、
// 60fps更新よりiPhone負荷を大幅に下げる。

let masterMixMeterLastTime = 0;

let masterMixMeterElements = {
  eq: [],
  volume: null,
  limiter: null
};

const masterMixMeterDisplay = {
  eq: Array(8).fill(0),
  volume: 0,
  limiter: 0
};

const masterMixMeterWritten = {
  eq: Array(8).fill(-1),
  volume: -1,
  limiter: -1
};

/*
 * renderSongMasterMix() 後に1回だけ呼ぶ。
 * 毎フレームquerySelectorしない。
 */
function cacheMasterMixMeterElements() {
  if (!songMasterMix) {
    masterMixMeterElements = {
      eq: [],
      volume: null,
      limiter: null
    };

    return;
  }

  /*
   * EQメーターはCanvasで描画。
   * サイズ・色・contextはここで1回だけ取得する。
   */
  masterMixMeterElements.eq =
    Array.from(
      songMasterMix.querySelectorAll(
        ".master-eq-meter-canvas[data-band-index]"
      )
    ).map(canvas => {
      const width =
        Math.max(
          1,
          canvas.clientWidth
        );

      const height =
        Math.max(
          1,
          canvas.clientHeight
        );

      const pixelRatio =
        Math.min(
          window.devicePixelRatio || 1,
          2
        );

      canvas.width =
        Math.round(
          width * pixelRatio
        );

      canvas.height =
        Math.round(
          height * pixelRatio
        );

      const context =
        canvas.getContext(
          "2d",
          {
            alpha: true
          }
        );

      context?.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
      );

      const style =
        getComputedStyle(
          canvas
        );

      return {
        canvas,
        context,
        width,
        height,
        pixelRatio,
        color:
  style.getPropertyValue(
    "--selected-bg"
  ).trim() ||
  style.color
      };
    });

  masterMixMeterElements.volume =
    songMasterMix.querySelector(
      '.master-mix-fader[data-control-key="volume"]'
    );

  masterMixMeterElements.limiter =
    songMasterMix.querySelector(
      '.master-mix-fader[data-control-key="limiter"]'
    );
}

export function refreshMasterMixMeterColor() {
  const selectedColor =
    getComputedStyle(
      document.body
    )
      .getPropertyValue(
        "--selected-bg"
      )
      .trim();

  if (!selectedColor) {
    return;
  }

  masterMixMeterElements.eq
    .forEach(
      (entry, index) => {
        if (!entry) {
          return;
        }

        entry.color =
          selectedColor;

        /*
         * 色変更をその場で反映。
         * メーター値が変わるまで
         * 待たなくていいように再描画する。
         */
        drawEqMeterCanvas(
          entry,
          masterMixMeterDisplay.eq[
            index
          ]
        );
      }
    );
}

function drawEqMeterCanvas(
  meterEntry,
  value
) {
  if (!meterEntry) return;

  const {
    context,
    width,
    height,
    color
  } = meterEntry;

  if (!context) return;

  context.clearRect(
    0,
    0,
    width,
    height
  );

  const level =
    clamp(
      Number(value) || 0,
      0,
      1
    );

  if (level <= 0) {
    return;
  }

  /*
   * 旧DOM版EQメーターと同じ寸法。
   *
   * CSS:
   * left/right 4px
   * bottom 4px
   * 最大高 141px
   */
  const meterLeft = 4;
  const meterRight = 4;
  const meterBottom = 4;

  const meterWidth =
    Math.max(
      0,
      width -
      meterLeft -
      meterRight
    );

  const maxMeterHeight =
    Math.max(
      0,
      height - 12
    );

  const meterHeight =
    maxMeterHeight * level;

  const meterTop =
    height -
    meterBottom -
    meterHeight;

  /*
   * 旧CSSの
   * color-mix(
   *   in srgb,
   *   var(--selected-bg) 42%,
   *   transparent
   * )
   * と同等の透明度。
   */
  context.globalAlpha = 0.42;
  context.fillStyle =
    color ||
    "#ffffff";

  context.fillRect(
    meterLeft,
    meterTop,
    meterWidth,
    meterHeight
  );

  context.globalAlpha = 1;
}

/*
 * 上がる時は素早く、
 * 下がる時だけゆっくり落とす。
 */
function smoothMeterValue(
  currentValue,
  targetValue,
  releaseRate
) {
  const current =
    clamp(
      Number(currentValue) || 0,
      0,
      1
    );

  const target =
    clamp(
      Number(targetValue) || 0,
      0,
      1
    );

  if (target >= current) {
    return target;
  }

  return (
    current +
    (target - current) *
      releaseRate
  );
}


/*
 * CSS更新差分が小さい場合は
 * style.setProperty自体を行わない。
 */
function meterValueChanged(
  previousValue,
  nextValue
) {
  return (
    Math.abs(
      nextValue -
      previousValue
    ) >= 0.008
  );
}


function stopMasterMixMeterAnimation() {
  if (
    masterMixMeterFrame !==
    null
  ) {
    cancelAnimationFrame(
      masterMixMeterFrame
    );

    masterMixMeterFrame =
      null;
  }

  masterMixMeterLastTime =
    0;
}


function startMasterMixMeterAnimation() {
  stopMasterMixMeterAnimation();

  cacheMasterMixMeterElements();

  /*
   * 表示状態を初期化。
   */
  masterMixMeterDisplay.eq.fill(0);
  masterMixMeterDisplay.volume = 0;
  masterMixMeterDisplay.limiter = 0;

  masterMixMeterWritten.eq.fill(-1);
  masterMixMeterWritten.volume = -1;
  masterMixMeterWritten.limiter = -1;

  const animate = timestamp => {
    /*
     * Song画面を抜けたら
     * 次フレームを予約せず完全終了。
     */
    if (
  !mixerView ||
  !songMasterMix?.isConnected
) {
      masterMixMeterFrame =
        null;

      return;
    }

    /*
     * requestAnimationFrame自体は
     * ブラウザに任せつつ、
     * 実処理は約20fpsに制限する。
     */
    if (
      masterMixMeterLastTime !== 0 &&
      timestamp -
        masterMixMeterLastTime <
        MASTER_MIX_METER_INTERVAL_MS
    ) {
      masterMixMeterFrame =
        requestAnimationFrame(
          animate
        );

      return;
    }

    masterMixMeterLastTime =
      timestamp;

    const meter =
  getMasterMixMeterData();

    /*
     * EQは感度を少し下げる。
     *
     * 以前は低域が簡単に100%へ
     * 張り付いていたので、
     * 表示用だけ約72%へ圧縮。
     *
     * 音には一切影響しない。
     */
    for (
      let bandIndex = 0;
      bandIndex < 8;
      bandIndex++
    ) {
      const rawValue =
        clamp(
          Number(
            meter.bands[
              bandIndex
            ]
          ) || 0,
          0,
          1
        );

      const targetValue =
        clamp(
          rawValue * 0.72,
          0,
          1
        );

      /*
       * EQは下降をほどほどに残す。
       */
      const displayedValue =
        smoothMeterValue(
          masterMixMeterDisplay
            .eq[
              bandIndex
            ],
          targetValue,
          0.99
        );

      masterMixMeterDisplay.eq[
        bandIndex
      ] =
        displayedValue;

      if (
        meterValueChanged(
          masterMixMeterWritten
            .eq[
              bandIndex
            ],
          displayedValue
        )
      ) {
        drawEqMeterCanvas(
  masterMixMeterElements.eq[
    bandIndex
  ],
  displayedValue
);

        masterMixMeterWritten.eq[
          bandIndex
        ] =
          displayedValue;
      }
    }


    /*
     * VOLはEQよりゆっくり下降。
     * ピークを目で追いやすくする。
     */
    const volumeTarget =
      clamp(
        Number(meter.level) || 0,
        0,
        1
      );

    const volumeDisplayed =
      smoothMeterValue(
        masterMixMeterDisplay.volume,
        volumeTarget,
        0.16
      );

    masterMixMeterDisplay.volume =
      volumeDisplayed;

    if (
      meterValueChanged(
        masterMixMeterWritten.volume,
        volumeDisplayed
      )
    ) {
      masterMixMeterElements
        .volume
        ?.style
        .setProperty(
          "--mix-meter",
          volumeDisplayed.toFixed(
            3
          )
        );

      masterMixMeterWritten.volume =
        volumeDisplayed;
    }


    /*
     * LimiterはReduction量。
     * 0〜24dBを0〜1へ正規化。
     */
    const limiterTarget =
      clamp(
        Number(
          meter.limiterReduction
        ) || 0,
        0,
        24
      ) /
      24;

    const limiterDisplayed =
      smoothMeterValue(
        masterMixMeterDisplay.limiter,
        limiterTarget,
        0.22
      );

    masterMixMeterDisplay.limiter =
      limiterDisplayed;

    if (
      meterValueChanged(
        masterMixMeterWritten.limiter,
        limiterDisplayed
      )
    ) {
      masterMixMeterElements
        .limiter
        ?.style
        .setProperty(
          "--mix-meter",
          limiterDisplayed.toFixed(
            3
          )
        );

      masterMixMeterWritten.limiter =
        limiterDisplayed;
    }

    masterMixMeterFrame =
      requestAnimationFrame(
        animate
      );
  };

  masterMixMeterFrame =
    requestAnimationFrame(
      animate
    );
}

function renderSongMasterMix() {
  if (!songMasterMix) return;

  const mix = ensureSongMasterMix();
  syncSongMasterMixAudio();

  songMasterMix.innerHTML = "";

  const title =
  document.createElement("div");

title.className =
  "song-master-mix-title";

const titleLabel =
  document.createElement("span");

titleLabel.className =
  "area-title-icon";

titleLabel.setAttribute(
  "aria-label",
  "mixer"
);

titleLabel.title =
  "mixer";

titleLabel.innerHTML = `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 4v16"></path>
    <path d="M12 4v16"></path>
    <path d="M19 4v16"></path>

    <rect
      x="3"
      y="7"
      width="4"
      height="4"
    ></rect>

    <rect
      x="10"
      y="13"
      width="4"
      height="4"
    ></rect>

    <rect
      x="17"
      y="6"
      width="4"
      height="4"
    ></rect>
  </svg>
`;

  const mixerBackButton =
  document.createElement("button");

mixerBackButton.type =
  "button";

mixerBackButton.className =
  "view-toggle-button";

mixerBackButton.setAttribute(
  "aria-label",
  "シーケンサーへ切り替え"
);

mixerBackButton.innerHTML = `
  <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect
  x="5"
  y="5"
  width="14"
  height="14"
  rx="1"
></rect>
      </svg>
    </span>
`;

mixerBackButton.addEventListener(
  "click",
  () => {
    mixerView = false;
    renderSongMode();
  }
);

const reverbHeader =
  document.createElement("div");

reverbHeader.className =
  "master-reverb-control compact-value";

const reverbLabel =
  document.createElement("span");

reverbLabel.className =
  "compact-value-label";

reverbLabel.textContent =
  "rev";

const reverbValue =
  document.createElement("button");

reverbValue.type =
  "button";

reverbValue.className =
  "master-reverb-value";

reverbValue.dataset.focusKey =
  "master-mix-reverb";

reverbValue.textContent =
  String(mix.reverb);

let reverbHistorySaved = false;

enableVerticalSweep({
  element: reverbValue,

  getValue: () =>
    mix.reverb,

  setValue: nextValue => {
    if (!reverbHistorySaved) {
      saveMasterMixHistory();

      reverbHistorySaved = true;
    }

    const corrected =
      clamp(
        Math.round(
          Number(nextValue) || 0
        ),
        0,
        100
      );

    mix.reverb = corrected;

    setMasterReverb(
      corrected
    );

    reverbValue.textContent =
      String(corrected);
  },

  min: 0,
  max: 100,
  step: 1,

  pixelsPerStep: 8,
  acceleration: false,

  onCommit: () => {
    reverbHistorySaved = false;
  }
});

reverbHeader.append(
  reverbLabel,
  reverbValue
);

title.append(
  titleLabel,
  reverbHeader,
  mixerBackButton
);

  const content = document.createElement("div");
  content.className = "master-mix-content";

  const eq = document.createElement("div");
  eq.className = "master-eq";

  mix.eq.forEach((gainValue, bandIndex) => {
  const band = document.createElement("div");
  band.className = "master-eq-band";

  const gain = document.createElement("button");
  gain.type = "button";
  gain.className = "master-eq-gain";
  gain.dataset.focusKey = `master-eq-${bandIndex}`;
  gain.dataset.bandIndex = String(bandIndex);

  gain.style.setProperty(
    "--eq-position",
    String((gainValue + 12) / 24)
  );

  const meter = document.createElement("canvas");
  meter.className = "master-eq-meter-canvas";
  meter.dataset.bandIndex = String(bandIndex);

  const marker = document.createElement("span");
  marker.className = "master-eq-marker";

  gain.append(meter, marker);

    const footer = document.createElement("div");
    footer.className = "master-mix-control-footer master-eq-footer";

    const label = document.createElement("span");
    label.className = "master-eq-label";
    label.textContent = MASTER_EQ_LABELS[bandIndex];

    const value = document.createElement("span");
    value.className = "master-eq-value";
    value.textContent =
      gainValue > 0
        ? `+${gainValue}`
        : String(gainValue);

    footer.append(label, value);

    let historySaved = false;

    enableVerticalSweep({
      element: gain,
      getValue: () => mix.eq[bandIndex],
      setValue: nextValue => {
        if (!historySaved) {
          saveMasterMixHistory();
          historySaved = true;
        }

        const corrected = clamp(
          Math.round(Number(nextValue) || 0),
          -12,
          12
        );

        mix.eq[bandIndex] = corrected;
        setMasterMixEqBand(bandIndex, corrected);

        gain.style.setProperty(
          "--eq-position",
          String((corrected + 12) / 24)
        );

        value.textContent =
          corrected > 0
            ? `+${corrected}`
            : String(corrected);
      },
      min: -12,
      max: 12,
      step: 1,
      pixelsPerStep: 6,
      acceleration: false,
      onCommit: () => {
        historySaved = false;
      }
    });

    gain.addEventListener("dblclick", event => {
      event.preventDefault();
      if (mix.eq[bandIndex] === 0) return;
      saveMasterMixHistory();
      mix.eq[bandIndex] = 0;
      setMasterMixEqBand(bandIndex, 0);
      renderSongMasterMix();
    });

    band.append(gain, footer);
    eq.appendChild(band);
  });

  const side = document.createElement("div");
  side.className = "master-mix-side";

  function createFaderControl({
    labelText,
    key,
    min,
    max,
    format,
    apply,
    className = ""
  }) {
    const control = document.createElement("div");
    control.className = `master-mix-fader-control ${className}`.trim();

    const fader = document.createElement("button");
    fader.type = "button";
    fader.className = "master-mix-fader";
    fader.dataset.controlKey = key;
    fader.dataset.focusKey = `master-mix-${key}`;

    const normalized =
      (mix[key] - min) / Math.max(1, max - min);

    fader.style.setProperty(
      "--mix-position",
      String(clamp(normalized, 0, 1))
    );
    fader.style.setProperty("--mix-meter", "0");

    const meter = document.createElement("span");
    meter.className = "master-mix-fader-meter";

    const marker = document.createElement("span");
    marker.className = "master-mix-fader-marker";

    fader.append(meter, marker);

    const footer = document.createElement("div");
    footer.className = "master-mix-control-footer master-mix-fader-footer";

    const label = document.createElement("span");
    label.className = "master-mix-fader-label";
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = "master-mix-fader-value";
    value.textContent = format(mix[key]);

    footer.append(label, value);

    let historySaved = false;

    enableVerticalSweep({
      element: fader,
      getValue: () => mix[key],
      setValue: nextValue => {
        if (!historySaved) {
          saveMasterMixHistory();
          historySaved = true;
        }

        const corrected = clamp(
          Math.round(Number(nextValue) || 0),
          min,
          max
        );

        mix[key] = corrected;
        apply(corrected);

        fader.style.setProperty(
          "--mix-position",
          String(
            (corrected - min) /
            Math.max(1, max - min)
          )
        );

        value.textContent = format(corrected);
      },
      min,
      max,
      step: 1,
      pixelsPerStep: 7,
      acceleration: false,
      onCommit: () => {
        historySaved = false;
      }
    });

    control.append(fader, footer);
    return control;
  }

  side.appendChild(
    createFaderControl({
      labelText: "vol",
      key: "volume",
      min: 0,
      max: 100,
      format: value => String(value),
      apply: setMasterMixVolume,
      className: "master-volume-fader-control"
    })
  );

  const limiterControl = createFaderControl({
    labelText: "limit",
    key: "limiter",
    min: -24,
    max: 0,
    format: value => String(value),
    apply: setMasterLimiterThreshold,
    className: "master-limit-fader-control"
  });

  side.appendChild(limiterControl);

  content.append(eq, side);
  songMasterMix.append(title, content);

  startMasterMixMeterAnimation();
}

function renderSongGrid() {
  if (!songGrid) return;

  songGrid.innerHTML = "";
  const pageStart = state.songPage * SONG_PARTS_PER_PAGE;

  for (let localIndex = 0; localIndex < SONG_PARTS_PER_PAGE; localIndex++) {
    const globalIndex = pageStart + localIndex;
    const source = song.sequence[globalIndex] ?? null;
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "song-part-cell";
    cell.dataset.songLocalIndex = String(localIndex);
    cell.dataset.songIndex = String(globalIndex);
    cell.dataset.focusKey = `song-part-${globalIndex}`;

    if (source) {
      cell.classList.add("filled");

      cell.classList.toggle(
        "selected",
        !state.isPlaying &&
        state.selectedPlaybackType ===
          "song" &&
        globalIndex ===
          state.selectedSongPartIndex
      );

      cell.classList.toggle(
        "playing",
        state.isPlaying &&
        state.selectedPlaybackType ===
          "song" &&
        globalIndex ===
          state.playingSongPartIndex
      );

      cell.classList.toggle(
        "queued",
        state.queuedSongPartIndex ===
          globalIndex
      );
      cell.textContent = songPartLabel(source);
      cell.setAttribute(
        "aria-label",
        `song part ${globalIndex + 1}: ${source.type} ${songPartLabel(source)}`
      );
      enableSongItemDrag(cell, globalIndex);

      cell.addEventListener(
        "click",
        () => {
          if (state.isPlaying) {
            queueSongPart(
              globalIndex
            );

            /*
             * Song予約でPattern / Fill / Section側の
             * 既存予約表示が解除されるため両方更新する。
             */
            renderPatternManager();
            renderSongGrid();

            return;
          }

          selectSongPart(
            globalIndex
          );

          renderPatternManager();
          renderSongGrid();
        }
      );
    } else {
      cell.textContent = "・";
      cell.classList.add("empty");
      cell.setAttribute("aria-label", `song part ${globalIndex + 1} empty`);
    }

    songGrid.appendChild(cell);
  }
}

export function renderSongMode() {
  /*
   * 上段
   * Sequencer / Mixer
   */
  sequenceGrid.hidden =
    mixerView;

  document
    .querySelector(
      ".sequence-toolbar"
    )
    ?.toggleAttribute(
      "hidden",
      mixerView
    );

  if (songMasterMix) {
    songMasterMix.hidden =
      !mixerView;
  }

  /*
   * 下段
   * Editor / Song Editor
   */
  editor.hidden =
    songEditorView;

  if (songParts) {
    songParts.hidden =
      !songEditorView;
  }

  /*
   * Songページ表示。
   */
  if (songPageButton) {
    songPageButton.textContent =
      state.songPage === 0
        ? "◧"
        : "◨";

    songPageButton.setAttribute(
      "aria-label",
      state.songPage === 0
        ? "Song 1～32を表示中。33～64へ切り替え"
        : "Song 33～64を表示中。1～32へ切り替え"
    );
  }

  /*
   * Mixer表示中だけ
   * メーターを動かす。
   */
  if (mixerView) {
    renderSongMasterMix();
  } else {
    stopMasterMixMeterAnimation();
    syncSongMasterMixAudio();
  }

  /*
   * Song Editor表示中だけ
   * Song Partsを描画。
   */
  if (songEditorView) {
    renderSongGrid();
  }
}

sequenceViewToggle?.addEventListener(
  "click",
  () => {
    mixerView = true;
    renderSongMode();
  }
);

songEditorViewToggle?.addEventListener(
  "click",
  () => {
    songEditorView = false;
    renderSongMode();
    renderEditor();
  }
);

songPageButton?.addEventListener("click", () => {
  state.songPage = (state.songPage + 1) % SONG_PAGE_COUNT;
  renderSongMode();
});


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

  function getSectionInsertIndex(
    pointerX
  ) {
    const sectionItems =
      Array.from(
        sectionContents
          .querySelectorAll(
            ".section-pattern-cell"
          )
      );

    let insertIndex = 0;

    sectionItems.forEach(
      item => {
        const rect =
          item.getBoundingClientRect();

        const centerX =
          rect.left +
          rect.width / 2;

        if (
          pointerX >
          centerX
        ) {
          insertIndex += 1;
        }
      }
    );

    return insertIndex;
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

    const insertIndex =
      getSectionInsertIndex(
        event.clientX
      );

    saveHistory();

    const added =
      addSourceToSection(
        sourceType,
        sourceIndex,
        state.editingSectionIndex,
        insertIndex
      );

    dragging = false;

    if (!added) {
      return;
    }

    renderPatternManager();

    restorePatternFocus(
      `section-source-${insertIndex}`
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
      if (state.songMode) {
        return;
      }

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
        const sourceType =
  isFill
    ? "fill"
    : "pattern";

    if (
  !sourceHasData(
    sourceType,
    slotIndex
  )
) {
  button.classList.add(
    "source-empty"
  );
}

if (
  sourceEditState.active &&
  sourceEditState.type ===
    sourceType &&
  sourceEditState.index ===
    slotIndex
) {
  button.classList.add(
    "source-edit-target"
  );
}

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
  state.selectedPlaybackType ===
    "source" &&
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
  state.selectedPlaybackType ===
    "source" &&
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
    /*
     * Pattern / Fill編集モード中。
     * 通常選択は動かさず、
     * 編集対象の枠だけ移動する。
     */
    if (sourceEditState.active) {
      sourceEditState.type =
        isFill
          ? "fill"
          : "pattern";

      sourceEditState.index =
        slotIndex;

      renderPatternManager();

      restorePatternFocus(
        isFill
          ? `fill-${slotIndex}`
          : `pattern-${slotIndex}`
      );

      return;
    }

    /*
     * 通常モード：Fill
     */
    if (isFill) {
      if (state.isPlaying) {
        queueFill(
          slotIndex
        );

        renderPatternManager();
        renderSongGrid();

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
     * 通常モード：Pattern再生中
     */
    if (state.isPlaying) {
      queuePattern(
        slotIndex
      );

      renderPatternManager();
      renderSongGrid();

      restorePatternFocus(
        `pattern-${slotIndex}`
      );

      return;
    }

    /*
     * 通常モード：Pattern停止中
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

let sourceLongPressTimer = null;
let sourceLongPressStartX = 0;
let sourceLongPressStartY = 0;
let sourceLongPressTriggered = false;

button.addEventListener(
  "pointerdown",
  event => {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    sourceLongPressTriggered =
      false;

    sourceLongPressStartX =
      event.clientX;

    sourceLongPressStartY =
      event.clientY;

    clearTimeout(
      sourceLongPressTimer
    );

    sourceLongPressTimer =
      window.setTimeout(
        () => {
          sourceLongPressTriggered =
            true;

          openSourceEditMode(
            isFill
              ? "fill"
              : "pattern",
            slotIndex
          );

          renderPatternManager();
        },
        SOURCE_EDIT_LONG_PRESS_MS
      );
  }
);

button.addEventListener(
  "pointermove",
  event => {
    const movement =
      Math.hypot(
        event.clientX -
          sourceLongPressStartX,
        event.clientY -
          sourceLongPressStartY
      );

    if (movement > 10) {
      clearTimeout(
        sourceLongPressTimer
      );
    }
  }
);

function clearSourceLongPress() {
  clearTimeout(
    sourceLongPressTimer
  );
}

button.addEventListener(
  "pointerup",
  clearSourceLongPress
);

button.addEventListener(
  "pointercancel",
  clearSourceLongPress
);

button.addEventListener(
  "click",
  event => {
    if (!sourceLongPressTriggered) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    sourceLongPressTriggered =
      false;
  },
  true
);

enablePatternSourceDrag(
  button,
  isFill
    ? "fill"
    : "pattern",
  slotIndex
);

enableExternalSourceDragToSong(
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

      if (
  !sectionHasData(
    sectionIndex
  )
) {
  button.classList.add(
    "section-empty"
  );
}

    button.textContent =
      sectionLabel;

    button.dataset.focusKey =
      `section-${sectionIndex}`;

    button.setAttribute(
      "aria-label",
      `section ${sectionLabel}`
    );

    /*
 * 停止中に、
 * 次回再生対象として選択されているSection。
 */
if (
  !state.isPlaying &&
  state.selectedPlaybackType ===
    "section" &&
  state.selectedSectionIndex ===
    sectionIndex
) {
  button.classList.add(
    "selected"
  );
}

/*
 * 現在再生中のSection。
 */
if (
  state.selectedPlaybackType ===
    "section" &&
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
     * 再生中に空Sectionを押した場合は、
     * 予約もバー表示切替も行わない。
     */
    if (
      state.isPlaying &&
      section.sequence.length === 0
    ) {
      restorePatternFocus(
        `section-${sectionIndex}`
      );

      return;
    }

    /*
     * 有効なSectionを押した時点で、
     * Sectionバー表示もそのSectionへ切り替える。
     */
    selectEditingSection(
      sectionIndex
    );

    /*
     * 再生中は、
     * 次回Section予約にする。
     */
    if (state.isPlaying) {
      queueSection(
        sectionIndex
      );

      renderPatternManager();
      renderSongGrid();

      restorePatternFocus(
        `section-${sectionIndex}`
      );

      return;
    }

    /*
     * 停止中は、
     * 空Sectionを含めて表示・編集対象にできる。
     * 再生対象としての選択も行う。
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

    enableExternalSourceDragToSong(
      button,
      "section",
      sectionIndex
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

/*
 * Sectionバー左端は、
 * 現在表示しているSection名を示すだけ。
 *
 * Section切替は上のA〜P記号から行う。
 */
function updateSectionEditorButton() {
  const sectionLabel =
    currentEditingSectionLabel();

  sectionEditorButton.textContent =
    sectionLabel;

  sectionEditorButton.setAttribute(
    "aria-label",
    `表示中のセクション ${sectionLabel}`
  );
}

updateSectionEditorButton();

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

  empty.textContent = "-";

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

/*
 * 現在表示しているSectionが
 * 実際に再生中のSectionと同じで、
 * さらに現在再生中の位置なら強調する。
 */
if (
  state.playingSectionIndex ===
    state.editingSectionIndex &&
  state.playingSectionItemIndex ===
    itemIndex
) {
  item.classList.add(
    "playing"
  );
}

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



let projectModal = null;

export async function refreshProjectName() {
  const meta =
    await getCurrentProjectMeta();

  if (!currentProjectName) {
    return;
  }

  const name = meta?.name || "project";
  currentProjectName.textContent = name;
  currentProjectName.title = name;
}

function closeProjectModal() {
  projectModal?.remove();
  projectModal = null;
}

function createProjectTextDialog({
  title,
  value = "",
  submitLabel = "ok",
  onSubmit
}) {
  if (!projectModal) return;

  const shade = document.createElement("div");
  shade.className = "project-dialog-shade";

  const form = document.createElement("form");
  form.className = "project-dialog";

  const label = document.createElement("div");
  label.className = "project-dialog-title";
  label.textContent = title;

  const input = document.createElement("input");
  input.className = "project-name-input";
  input.type = "text";
  input.value = value;
  input.maxLength = 80;
  input.autocomplete = "off";
  input.spellcheck = false;

  const buttons = document.createElement("div");
  buttons.className = "project-dialog-buttons";

  const cancel = createModalButton("cancel");
  const submit = createModalButton(submitLabel);
  submit.type = "submit";

  cancel.addEventListener("click", () => {
    shade.remove();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    submit.disabled = true;
    await onSubmit(name);
    shade.remove();
  });

  buttons.append(cancel, submit);
  form.append(label, input, buttons);
  shade.append(form);
  projectModal.append(shade);

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function createProjectConfirmDialog({
  message,
  confirmLabel = "delete",
  onConfirm
}) {
  if (!projectModal) return;

  const shade = document.createElement("div");
  shade.className = "project-dialog-shade";

  const box = document.createElement("div");
  box.className = "project-dialog";

  const messageNode = document.createElement("div");
  messageNode.className = "project-dialog-title";
  messageNode.textContent = message;

  const buttons = document.createElement("div");
  buttons.className = "project-dialog-buttons";

  const cancel = createModalButton("cancel");
  const confirm = createModalButton(confirmLabel);
  confirm.classList.add("danger");

  cancel.addEventListener("click", () => shade.remove());
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    await onConfirm();
    shade.remove();
  });

  buttons.append(cancel, confirm);
  box.append(messageNode, buttons);
  shade.append(box);
  projectModal.append(shade);

  requestAnimationFrame(() => cancel.focus());
}

async function openProjectModal() {
  if (projectModal) return;

  const overlay = document.createElement("div");
  overlay.className = "project-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "project manager");

  const modal = document.createElement("div");
  modal.className = "project-modal";
  const header = document.createElement("div");
  header.className = "project-modal-header";
  const title = document.createElement("div");
  title.className = "project-modal-title";
  title.textContent = "project";
  const close = createModalButton("×", "project-modal-close");
  close.setAttribute("aria-label", "close");
  header.append(title, close);

  const actions = document.createElement("div");
  actions.className = "project-actions";
  const newButton = createModalButton("new");
  const openButton = createModalButton("open");
  const saveButton = createModalButton("save");
  const saveAsButton = createModalButton("save as");
  const renameButton = createModalButton("rename");
  const deleteButton = createModalButton("delete");
  actions.append(newButton, openButton, saveButton, saveAsButton, renameButton, deleteButton);

  const list = document.createElement("div");
  list.className = "project-list";
  modal.append(header, actions, list);
  overlay.append(modal);
  document.body.append(overlay);
  projectModal = overlay;

  let selectedProjectId = null;
  let selectedProjectName = "";

  function updateActionState() {
    const selected = Boolean(selectedProjectId);
    openButton.disabled = !selected;
    renameButton.disabled = !selected;
    deleteButton.disabled = !selected;
  }

  async function renderProjectList() {
    const [projects, current] = await Promise.all([getProjectList(), getCurrentProjectMeta()]);
    title.textContent = current?.name || "project";
    list.innerHTML = "";
    if (selectedProjectId && !projects.some(project => project.id === selectedProjectId)) {
      selectedProjectId = null;
      selectedProjectName = "";
    }
    projects.forEach(project => {
      const item = createModalButton(project.name, "project-list-item");
      item.dataset.projectId = project.id;
      item.classList.toggle("active", project.id === selectedProjectId);
      item.title = project.name;
      item.addEventListener("click", () => {
        selectedProjectId = project.id;
        selectedProjectName = project.name;
        list.querySelectorAll(".project-list-item").forEach(node => {
          node.classList.toggle("active", node.dataset.projectId === selectedProjectId);
        });
        updateActionState();
      });
      list.append(item);
    });
    updateActionState();
  }

  function confirmDiscard(onConfirm) {
    if (!hasUnsavedChanges()) { void onConfirm(); return; }
    createProjectConfirmDialog({
      message: "unsaved changes will be discarded. continue?",
      onConfirm
    });
  }

  close.addEventListener("click", closeProjectModal);
  overlay.addEventListener("pointerdown", event => { if (event.target === overlay) closeProjectModal(); });
  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      const shade = overlay.querySelector(".project-dialog-shade");
      if (shade) shade.remove(); else closeProjectModal();
    }
  }, true);

  newButton.addEventListener("click", () => confirmDiscard(async () => {
    newButton.disabled = true;
    const id = await createNewProject();
    if (id) closeProjectModal(); else newButton.disabled = false;
  }));

  openButton.addEventListener("click", () => {
    if (!selectedProjectId) return;
    confirmDiscard(async () => {
      openButton.disabled = true;
      const opened = await openProject(selectedProjectId);
      if (opened) closeProjectModal(); else openButton.disabled = false;
    });
  });

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    const saved = await saveCurrentProject();
    if (saved) closeProjectModal(); else saveButton.disabled = false;
  });

  saveAsButton.addEventListener("click", () => {
    createProjectTextDialog({ title: "save as", value: "", submitLabel: "save", onSubmit: async name => {
      const id = await saveAsProject(name); if (id) closeProjectModal();
    }});
  });

  renameButton.addEventListener("click", () => {
    if (!selectedProjectId) return;
    createProjectTextDialog({ title: "rename", value: selectedProjectName, submitLabel: "rename", onSubmit: async name => {
      await renameProject(selectedProjectId, name);
      selectedProjectName = name;
      await refreshProjectName();
      await renderProjectList();
    }});
  });

  deleteButton.addEventListener("click", () => {
    if (!selectedProjectId) return;
    createProjectConfirmDialog({ message: `delete ${selectedProjectName}?`, onConfirm: async () => {
      const deleted = await deleteProject(selectedProjectId);
      if (deleted) {
        selectedProjectId = null; selectedProjectName = "";
        await refreshProjectName(); await renderProjectList();
      }
    }});
  });

  await renderProjectList();
  close.focus();
}

projectButton?.addEventListener(
  "click",
  () => void openProjectModal()
);

window.addEventListener(
  "projectchange",
  () => {
    void refreshProjectName();
    render();
  }
);

let exportModal = null;

function closeExportModal() {
  exportModal?.remove();
  exportModal = null;
}

function safeExportFileName(name) {
  const cleaned = String(name || "project")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();

  return cleaned || "project";
}

function downloadExportBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

async function shareOrDownloadExport(blob, fileName) {
  const isIOS =
    /iPhone|iPad|iPod/i.test(
      navigator.userAgent
    ) ||
    (
      navigator.platform ===
        "MacIntel" &&
      navigator.maxTouchPoints > 1
    );

  const isAndroid =
    /Android/i.test(
      navigator.userAgent
    );

  const isMobile =
    isIOS || isAndroid;

  /*
   * iPhone / iPad / Android
   * → WAVファイルだけをOS共有シートへ渡す。
   * title / textは付けない。
   */
  if (isMobile) {
    const file = new File(
      [blob],
      fileName,
      {
        type: "audio/wav"
      }
    );

    if (
      navigator.share &&
      navigator.canShare?.({
        files: [file]
      })
    ) {
      try {
        await navigator.share({
          files: [file]
        });

        return;
      } catch (error) {
        /*
         * ユーザーが共有画面を閉じた場合は
         * ダウンロードへフォールバックしない。
         */
        if (
          error?.name ===
          "AbortError"
        ) {
          return;
        }
      }
    }
  }

  /*
   * PC、または共有非対応端末
   * → 通常ダウンロード
   */
  downloadExportBlob(
    blob,
    fileName
  );
}

function makeExportChoice(label, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "export-choice";
  button.textContent = label;
  button.dataset.value = value;
  return button;
}

function makeExportNumberRow({
  label,
  min,
  max,
  step,
  value
}) {
  const row = document.createElement("div");
  row.className = "export-row";

  const labelNode = document.createElement("div");
  labelNode.className = "export-label";
  labelNode.textContent = label;

  const control = document.createElement("div");
  control.className = "export-value-control";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "export-step-button";
  minus.textContent = "−";

  const output = document.createElement("output");
  output.className = "export-value";
  output.dataset.value = String(value);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "export-step-button";
  plus.textContent = "+";

  function formatted(number) {
    return step === 0.5
      ? `${Number(number).toFixed(1)}s`
      : `${Math.round(number)}s`;
  }

  function setValue(nextValue) {
    const next = clamp(
      Math.round(Number(nextValue) / step) * step,
      min,
      max
    );

    output.dataset.value = String(next);
    output.textContent = formatted(next);
  }

  minus.addEventListener("click", () => {
    setValue(Number(output.dataset.value) - step);
  });

  plus.addEventListener("click", () => {
    setValue(Number(output.dataset.value) + step);
  });

  setValue(value);
  control.append(minus, output, plus);
  row.append(labelNode, control);

  return {
    row,
    output,
    minus,
    plus,
    getValue: () => Number(output.dataset.value) || 0,
    setValue,
    setDisabled(disabled) {
      row.classList.toggle("disabled", disabled);
      minus.disabled = disabled;
      plus.disabled = disabled;
    }
  };
}

async function openExportModal() {
  if (exportModal) return;

  const overlay = document.createElement("div");
  overlay.className = "export-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "export");

  const modal = document.createElement("div");
  modal.className = "export-modal";

  const header = document.createElement("div");
  header.className = "export-modal-header";

  const title = document.createElement("div");
  title.className = "export-modal-title";
  title.textContent = "export";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "export-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "close");

  header.append(title, close);

  const targetRow = document.createElement("div");
  targetRow.className = "export-row";
  const targetLabel = document.createElement("div");
  targetLabel.className = "export-label";
  targetLabel.textContent = "target";
  const targetGroup = document.createElement("div");
  targetGroup.className = "export-choice-group";
  const targetSong = makeExportChoice("song", "song");
  const targetPart = makeExportChoice("part", "part");
  targetGroup.append(targetSong, targetPart);
  targetRow.append(targetLabel, targetGroup);

  const endRow = document.createElement("div");
  endRow.className = "export-row";
  const endLabel = document.createElement("div");
  endLabel.className = "export-label";
  endLabel.textContent = "end";
  const endGroup = document.createElement("div");
  endGroup.className = "export-choice-group";
  const endTail = makeExportChoice("tail", "tail");
  const endLoop = makeExportChoice("loop", "loop");
  endGroup.append(endTail, endLoop);
  endRow.append(endLabel, endGroup);

  const headControl = makeExportNumberRow({
    label: "head",
    min: 0,
    max: 5,
    step: 0.5,
    value: 0
  });

  const fadeInControl = makeExportNumberRow({
    label: "fade in",
    min: 0,
    max: 30,
    step: 1,
    value: 0
  });

  const fadeOutControl = makeExportNumberRow({
    label: "fade out",
    min: 0,
    max: 30,
    step: 1,
    value: 0
  });

  const formatRow = document.createElement("div");
  formatRow.className = "export-row";
  const formatLabel = document.createElement("div");
  formatLabel.className = "export-label";
  formatLabel.textContent = "format";
  const formatValue = document.createElement("div");
  formatValue.textContent = "wav / 48khz / 24bit / stereo";
  formatValue.style.fontSize = "var(--font-label)";
  formatRow.append(formatLabel, formatValue);

  const progressWrap = document.createElement("div");
  progressWrap.className = "export-progress-wrap";
  progressWrap.hidden = true;

  const progressRow = document.createElement("div");
  progressRow.className = "export-progress-row";
  const progressText = document.createElement("span");
  progressText.textContent = "exporting 0%";
  const progressStage = document.createElement("span");
  progressStage.textContent = "";
  progressRow.append(progressText, progressStage);

  const progressTrack = document.createElement("div");
  progressTrack.className = "export-progress-track";
  const progressBar = document.createElement("div");
  progressBar.className = "export-progress-bar";
  progressTrack.append(progressBar);

  const status = document.createElement("div");
  status.className = "export-status";

  progressWrap.append(progressRow, progressTrack, status);

  const actions = document.createElement("div");
  actions.className = "export-actions";
  const exportAction = document.createElement("button");
  exportAction.type = "button";
  exportAction.className = "export-action primary";
  exportAction.textContent = "export";
  actions.append(exportAction);

  modal.append(
    header,
    targetRow,
    endRow,
    headControl.row,
    fadeInControl.row,
    fadeOutControl.row,
    formatRow,
    progressWrap,
    actions
  );

  overlay.append(modal);
  document.body.append(overlay);
  exportModal = overlay;

  let target = "song";
  let endMode = "tail";
  let working = false;
  let progressTimer = null;
  let displayedProgress = 0;

  function updateProgress(value, stage = "") {
    displayedProgress = Math.max(
      displayedProgress,
      clamp(Math.round(value), 0, 100)
    );

    progressText.textContent =
      `exporting ${displayedProgress}%`;

    progressStage.textContent = stage;
    progressBar.style.width =
      `${displayedProgress}%`;
  }

  function clearProgressTimer() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function beginRenderProgressAnimation() {
    clearProgressTimer();

    progressTimer = setInterval(() => {
      if (displayedProgress < 90) {
        updateProgress(
          displayedProgress + 1,
          "rendering"
        );
      }
    }, 140);
  }

  function setWorking(nextWorking) {
    working = nextWorking;

    close.disabled = nextWorking;
    targetSong.disabled = nextWorking;
    targetPart.disabled = nextWorking;
    endTail.disabled = nextWorking;
    endLoop.disabled = nextWorking;
    exportAction.disabled = nextWorking;

    progressWrap.hidden =
      !nextWorking &&
      displayedProgress === 0;

    applyModeState();
  }

  function applyModeState() {
    const part = target === "part";

    /*
     * PARTはループ素材専用。
     * ENDはLOOP固定とし、TAIL自体をUIから消す。
     */
    if (part) {
      endMode = "loop";
    }

    targetSong.classList.toggle(
      "active",
      target === "song"
    );

    targetPart.classList.toggle(
      "active",
      part
    );

    endTail.hidden = part;
    endGroup.classList.toggle(
      "single-choice",
      part
    );

    endTail.classList.toggle(
      "active",
      !part && endMode === "tail"
    );

    endLoop.classList.toggle(
      "active",
      endMode === "loop"
    );

    const loop =
      endMode === "loop";

    if (loop) {
      headControl.setValue(0);
      fadeInControl.setValue(0);
      fadeOutControl.setValue(0);
    }

    const controlsDisabled =
      working || loop;

    headControl.setDisabled(
      controlsDisabled
    );

    fadeInControl.setDisabled(
      controlsDisabled
    );

    fadeOutControl.setDisabled(
      controlsDisabled
    );
  }

  function currentOptions() {
    return {
      target,
      endMode,
      headSeconds:
        headControl.getValue(),
      fadeInSeconds:
        fadeInControl.getValue(),
      fadeOutSeconds:
        fadeOutControl.getValue(),
      bpm:
        Number(
          document.getElementById(
            "bpm-input"
          )?.value
        ) || 120,
      masterVolume:
        Number(
          document.getElementById(
            "master-volume"
          )?.value
        ) || 70
    };
  }

  async function renderForExport() {
    displayedProgress = 0;
    updateProgress(0, "preparing");
    progressWrap.hidden = false;
    status.textContent = "";

    return renderExportWav({
      ...currentOptions(),

      onProgress(value, stage) {
        updateProgress(
          value,
          stage
        );

        if (stage === "rendering") {
          beginRenderProgressAnimation();
        } else if (value >= 93) {
          clearProgressTimer();
        }
      }
    });
  }

  targetSong.addEventListener(
    "click",
    () => {
      if (working) return;

      target = "song";
      endMode = "tail";
      applyModeState();
    }
  );

  targetPart.addEventListener(
    "click",
    () => {
      if (working) return;

      target = "part";
      endMode = "loop";
      applyModeState();
    }
  );

  endTail.addEventListener(
    "click",
    () => {
      if (
        working ||
        target === "part"
      ) {
        return;
      }

      endMode = "tail";
      applyModeState();
    }
  );

  endLoop.addEventListener(
    "click",
    () => {
      if (working) return;

      endMode = "loop";
      applyModeState();
    }
  );

  close.addEventListener(
    "click",
    () => {
      if (!working) {
        closeExportModal();
      }
    }
  );

  overlay.addEventListener(
    "pointerdown",
    event => {
      if (
        event.target === overlay &&
        !working
      ) {
        closeExportModal();
      }
    }
  );

  overlay.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        !working
      ) {
        event.preventDefault();
        closeExportModal();
      }
    }
  );

  exportAction.addEventListener(
    "click",
    async () => {
      if (working) return;

      if (state.isPlaying) {
        document
          .getElementById(
            "play-button"
          )
          ?.click();
      }

      setWorking(true);

      try {
        const result =
          await renderForExport();

        clearProgressTimer();

        const meta =
          await getCurrentProjectMeta();

        const projectName =
          safeExportFileName(
            meta?.name || "project"
          );

        const fileName =
          target === "part"
            ? `loop_${projectName}.wav`
            : `${projectName}.wav`;

        status.textContent =
          "complete";

        await shareOrDownloadExport(
          result.blob,
          fileName
        );
      } catch (error) {
        clearProgressTimer();

        console.error(
          "sprooto export failed:",
          error
        );

        status.textContent =
          error?.message ||
          "export failed";
      } finally {
        setWorking(false);
      }
    }
  );

  applyModeState();
  close.focus();
}

exportButton?.addEventListener(
  "click",
  () => void openExportModal()
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

  const track = editorTrack();
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

  const factoryTab = createModalButton("factory", "sound-preset-tab active");
  const userTab = createModalButton("user", "sound-preset-tab");
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
    selectedText.textContent = `current preset　${selected.name}${selected.type === "factory" ? "（factory）" : selected.type === "user" ? "（user）" : ""}`;

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
        createModalButton("no");

      const yesButton =
        createModalButton("yes");

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
  overlay.addEventListener("click", event => {
  if (event.target === overlay) {
    closeModal();
  }
});
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

function renderStepEditScreen() {
  const header = document.createElement("div");
  header.className =
    "edit-toolbar step-edit-toolbar";

  const trackButton =
    document.createElement("button");

  trackButton.type = "button";
  trackButton.className = "track-cycle";
  trackButton.dataset.focusKey =
    "step-edit-track";

  trackButton.innerHTML = `
    <span class="track-icon">
      ${getParameterIcon("track")}
    </span>
    <span class="track-number">
      ${editorTrack().id}
    </span>
  `;

  trackButton.setAttribute(
    "aria-label",
    `track ${editorTrack().id}`
  );

  trackButton.addEventListener(
    "click",
    () => {
      state.selectedTrackIndex =
        (
          state.selectedTrackIndex + 1
        ) % tracks.length;

      renderSequence();
      renderEditorAndRestore(
        "step-edit-track"
      );
    }
  );

  const label = document.createElement("span");
  label.className = "step-edit-label";
  label.textContent = false
    ? "paste position"
    : "step edit";

  header.append(
    trackButton,
    label
  );

  const grid = document.createElement("div");
  grid.className =
    "offset-grid step-edit-grid";

  const firstStepIndex =
    state.sequencePage * PAGE_STEP_COUNT;

  const lastStepIndex = Math.min(
    firstStepIndex + PAGE_STEP_COUNT,
    editorTrack().stepLength
  );

  for (
    let stepIndex = firstStepIndex;
    stepIndex < lastStepIndex;
    stepIndex++
  ) {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className =
      "offset-step step-edit-cell";
    button.dataset.stepIndex = stepIndex;
    button.dataset.focusKey =
      `step-edit-${stepIndex}`;
    button.setAttribute(
      "aria-label",
      `track ${editorTrack().id} step ${stepIndex + 1}`
    );

    enableSelectionPointer({
      element: button,
      mode: "step",
      source: "step-editor",
      getStepIndex: element =>
        Number(element.dataset.stepIndex)
    });

    if (
      editSelection.selected.has(
        selectionKey(
          state.selectedTrackIndex,
          stepIndex
        )
      )
    ) {
      button.classList.add(
        "range-selected"
      );
    }

    grid.appendChild(button);
  }

  editor.append(
    header,
    grid
  );
}

function renderPinPlacementScreen() {
  const track = mainSelectedTrack();

  const header = document.createElement("div");
  header.className = "edit-toolbar pin-placement-toolbar";

  const trackButton = document.createElement("button");
  trackButton.type = "button";
  trackButton.className = "track-cycle";
  trackButton.innerHTML = `
    <span class="track-icon">${getParameterIcon("track")}</span>
    <span class="track-number">${track.id}</span>
  `;

  trackButton.addEventListener("click", () => {
    state.selectedTrackIndex =
      (state.selectedTrackIndex + 1) % tracks.length;
    renderSequence();
    renderEditor();
  });

  const pinBack = document.createElement("button");
  pinBack.type = "button";
  pinBack.className = "edit-icon pin-button active";
  pinBack.innerHTML = getParameterIcon("pin");
  pinBack.setAttribute("aria-label", "pin selector close");
  pinBack.addEventListener("click", () => {
    pinPlacementMode = false;
    renderEditor();
  });

  const label = document.createElement("span");
  label.className = "pin-placement-label";
  label.textContent = "pin";

  header.append(trackButton, pinBack, label);

  const grid = document.createElement("div");
  grid.className = "offset-grid pin-selector-grid";

  const firstStepIndex = state.sequencePage * PAGE_STEP_COUNT;
  const lastStepIndex = Math.min(
    firstStepIndex + PAGE_STEP_COUNT,
    track.stepLength
  );

  const values = [null, "a", "b", "c"];

  for (let stepIndex = firstStepIndex; stepIndex < lastStepIndex; stepIndex++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "offset-step pin-selector-step";
    button.dataset.stepIndex = String(stepIndex);

    const value = track.pins?.[stepIndex] ?? null;
    button.textContent = value ?? "・";
    button.classList.toggle("base-value-step", value === null);

    if (track.steps[stepIndex]) {
      button.classList.add("note-on");
    }

    if (
      state.playbackTickIndex !== null &&
      stepIndex === state.playbackTickIndex % track.stepLength
    ) {
      button.classList.add("playing");
    }

    button.addEventListener("click", () => {
      saveTrackHistory();

      const current = track.pins?.[stepIndex] ?? null;
      const currentIndex = values.indexOf(current);
      const next = values[(currentIndex + 1) % values.length];

      track.pins[stepIndex] = next;
      button.textContent = next ?? "・";
      button.classList.toggle("base-value-step", next === null);
    });

    grid.appendChild(button);
  }

  editor.append(header, grid);
}

export function renderEditor() {
  editor.innerHTML = "";

  const pinEnabled =
    isPinModeEnabled();

  if (
    pinPlacementMode &&
    !pinEnabled
  ) {
    pinPlacementMode = false;
  }

  document.body.classList.toggle(
    "pin-sound-edit-mode",
    pinEnabled &&
      Boolean(pinEditSlot)
  );

  document.body.classList.toggle(
    "pin-placement-mode",
    pinPlacementMode
  );

  if (pinPlacementMode) {
    renderPinPlacementScreen();
    return;
  }

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
      editorTrack().stepLength;

      button.classList.toggle(
        "playing",
        Number(button.dataset.stepIndex) ===
          playingStep
      );
    });
}

export function render() {
  void refreshProjectName();
  renderCurrentSourceDisplay();
  renderSequence();
  renderEditor();
  renderPatternManager();
  renderSongMode();
  updateSelectionClasses();
}
