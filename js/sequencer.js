export const STEP_COUNT = 64;
export const PAGE_STEP_COUNT = 32;
export const TRACK_COUNT = 4;

export const PATTERN_SLOT_COUNT = 24;
export const FILL_SLOT_COUNT = 8;
export const SECTION_SLOT_COUNT = 16;

const filled = value =>
  Array(STEP_COUNT).fill(value);

function makeTrack(id) {
  return {
    id,

    stepLength: 32,

    steps:
      filled(false),

    muted: false,
    solo: false,

    base: {
      note: 0,
      sine: 100,
      noise: 0,
      velocity: 70,
      decay: 5,
      fmDepth: 0,
      fmRatio: 1,
      tone: 50,
      pan: 50,
      probability: 100
    },

    offsets: {
      note:
        filled(0),

      velocity:
        filled(0),

      decay:
        filled(0),

      fmDepth:
        filled(0),

      tone:
        filled(0),

      pan:
        filled(0),

      probability:
        filled(0)
    }
  };
}

function makePatternData() {
  return {
    tracks:
      Array.from(
        {
          length:
            TRACK_COUNT
        },
        (_, index) =>
          makeTrack(index + 1)
      ),

    patternSwing: 0
  };
}

function makeSectionData() {
  return {
    /*
     * Pattern／Fillの並び
     *
     * [
     *   {
     *     type: "pattern",
     *     index: 0
     *   },
     *   {
     *     type: "fill",
     *     index: 1
     *   }
     * ]
     */
    sequence: []
  };
}

/*
 * Pattern 01へ、
 * 現在使用中の初期データを移す。
 */
function applyInitialPatternData(
  patternData
) {
  const patternTracks =
    patternData.tracks;

  /*
   * Track 1
   * 1、9、17、25
   */
  [0, 8, 16, 24].forEach(
    stepIndex => {
      patternTracks[0]
        .steps[stepIndex] =
        true;
    }
  );

  /*
   * Track 2
   * 5、13、21、29
   */
  [4, 12, 20, 28].forEach(
    stepIndex => {
      patternTracks[1]
        .steps[stepIndex] =
        true;
    }
  );

  patternTracks[1]
    .base.note = 11;

  /*
   * Track 3
   */
  [4, 12, 20, 28].forEach(
    stepIndex => {
      patternTracks[2]
        .steps[stepIndex] =
        true;
    }
  );

  patternTracks[2]
    .base.noise = 70;

  patternTracks[2]
    .base.sine = 0;

  patternTracks[2]
    .base.decay = 1;

  /*
   * Track 4
   */
  [
    0,
    6,
    8,
    14,
    16,
    22,
    24,
    30
  ].forEach(
    stepIndex => {
      patternTracks[3]
        .steps[stepIndex] =
        true;
    }
  );

  patternTracks[3]
    .base.noise = 45;

  patternTracks[3]
    .base.sine = 0;

  patternTracks[3]
    .base.decay = 1;
}

/*
 * パターンとフィルの保存領域
 */
export const patterns =
  Array.from(
    {
      length:
        PATTERN_SLOT_COUNT
    },
    () =>
      makePatternData()
  );

export const fills =
  Array.from(
    {
      length:
        FILL_SLOT_COUNT
    },
    () =>
      makePatternData()
  );

 export const sections =
  Array.from(
    {
      length:
        SECTION_SLOT_COUNT
    },
    () =>
      makeSectionData()
  );
/*
 * 現在の初期データは
 * Pattern 01へ入れる。
 */
applyInitialPatternData(
  patterns[0]
);

/*
 * ui.jsやmain.jsは、
 * 引き続きtracksを参照する。
 *
 * 中身だけ選択中パターンの
 * Trackへ差し替える。
 */
export const tracks = [
  ...patterns[0].tracks
];

export const parameters = [
  {
    id: "note",
    label: "note",
    icon: "note",
    min: -24,
    max: 24,
    step: 1,
    offsetMode: "result"
  },

  {
    id: "velocity",
    label: "volume",
    icon: "volume",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "sine",
    label: "sine",
    icon: "sine",
    min: 0,
    max: 100,
    step: 1,
    baseOnly: true
  },

  {
    id: "noise",
    label: "noise",
    icon: "noise",
    min: 0,
    max: 100,
    step: 1,
    baseOnly: true
  },

  {
    id: "decay",
    label: "decay",
    icon: "decay",
    min: 1,
    max: 50,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "fmDepth",
    label: "fm",
    icon: "fm",
    min: 0,
    max: 20,
    step: 1,
    offsetMode: "offset",

    children: [
      {
        id: "fmDepth",
        label: "depth"
      },

      {
        id: "fmRatio",
        label: "ratio",
        baseOnly: true
      }
    ]
  },

  {
    id: "tone",
    label: "tone",
    icon: "tone",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "pan",
    label: "pan",
    icon: "pan",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "probability",
    label: "prob",
    icon: "probability",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "result"
  }
];

export const state = {
  selectedTrackIndex: 0,

  selectedParameterId: null,
  selectedChildId: null,

  sequencePage: 0,
  patternLength: 32,

  playingStepIndex: null,
  isPlaying: false,

  /*
   * 現在画面に読み込まれている
   * データの種類と番号。
   */
  selectedSourceType:
    "pattern",

   selectedPatternIndex: 0,
  selectedFillIndex: null,

  /*
   * Sectionボタンで選択する
   * 再生対象Section。
   */
  selectedSectionIndex: 0,

  /*
   * Sectionバー左端に表示する
   * 編集対象Section。
   */
  editingSectionIndex: 0
};

function sourceData(
  type,
  index
) {
  if (type === "fill") {
    return fills[index];
  }

  return patterns[index];
}

/*
 * 選択したPattern／Fillの
 * Trackをtracksへ読み込む。
 *
 * オブジェクト自体は同じ参照なので、
 * tracksへ加えた編集は
 * 各Pattern／Fillへ直接保存される。
 */
function loadSourceTracks(
  type,
  index
) {
  const data =
    sourceData(
      type,
      index
    );

  if (!data) {
    return false;
  }

  tracks.splice(
    0,
    tracks.length,
    ...data.tracks
  );

  syncPatternLength();

  return true;
}

export function selectPattern(
  patternIndex
) {
  if (
    patternIndex < 0 ||
    patternIndex >=
      patterns.length
  ) {
    return false;
  }

  state.selectedSourceType =
    "pattern";

  state.selectedPatternIndex =
    patternIndex;

  state.selectedFillIndex =
    null;

  loadSourceTracks(
    "pattern",
    patternIndex
  );

  return true;
}

export function addCurrentSourceToSection(
  sectionIndex =
    state.editingSectionIndex
) {
  const section =
    sections[sectionIndex];

  if (!section) {
    return false;
  }

  /*
   * Sectionバー内は
   * 最大7ブロック。
   */
  if (
    section.sequence.length >= 7
  ) {
    return false;
  }

  const sourceIndex =
    state.selectedSourceType ===
    "fill"
      ? state.selectedFillIndex
      : state.selectedPatternIndex;

  if (
    sourceIndex === null ||
    sourceIndex === undefined
  ) {
    return false;
  }

  section.sequence.push({
    type:
      state.selectedSourceType,

    index:
      sourceIndex
  });

  return true;
}

export function selectFill(
  fillIndex
) {
  if (
    fillIndex < 0 ||
    fillIndex >=
      fills.length
  ) {
    return false;
  }

  state.selectedSourceType =
    "fill";

  state.selectedFillIndex =
    fillIndex;

  loadSourceTracks(
    "fill",
    fillIndex
  );

  return true;
}

export function selectSection(
  sectionIndex
) {
  if (
    sectionIndex < 0 ||
    sectionIndex >=
      sections.length
  ) {
    return false;
  }

  state.selectedSectionIndex =
    sectionIndex;

  return true;
}

export function selectEditingSection(
  sectionIndex
) {
  if (
    sectionIndex < 0 ||
    sectionIndex >=
      sections.length
  ) {
    return false;
  }

  state.editingSectionIndex =
    sectionIndex;

  return true;
}

export function changeEditingSection(
  difference
) {
  const nextIndex =
    clamp(
      state.editingSectionIndex +
        difference,
      0,
      sections.length - 1
    );

  if (
    nextIndex ===
    state.editingSectionIndex
  ) {
    return false;
  }

  state.editingSectionIndex =
    nextIndex;

  return true;
}

export function currentEditingSection() {
  return sections[
    state.editingSectionIndex
  ];
}

export function currentEditingSectionLabel() {
  return String.fromCharCode(
    65 +
    state.editingSectionIndex
  );
}

export function currentSourceData() {
  if (
    state.selectedSourceType ===
    "fill"
  ) {
    return fills[
      state.selectedFillIndex ?? 0
    ];
  }

  return patterns[
    state.selectedPatternIndex
  ];
}

export function currentSourceLabel() {
  if (
    state.selectedSourceType ===
    "fill"
  ) {
    return `F${
      (state.selectedFillIndex ?? 0) +
      1
    }`;
  }

  return String(
    state.selectedPatternIndex + 1
  ).padStart(
    2,
    "0"
  );
}

const HISTORY_LIMIT = 100;

const undoStack = [];
const redoStack = [];

function createSnapshot() {
  return structuredClone({
    patterns,
    fills,
    sections,
    state
  });
}

function restoreSnapshot(
  snapshot
) {
  patterns.splice(
    0,
    patterns.length,
    ...structuredClone(
      snapshot.patterns
    )
  );

  fills.splice(
    0,
    fills.length,
    ...structuredClone(
      snapshot.fills
    )
  );

  sections.splice(
  0,
  sections.length,
  ...structuredClone(
    snapshot.sections
  )
);

  Object.assign(
    state,
    structuredClone(
      snapshot.state
    )
  );

  if (
    state.selectedSourceType ===
    "fill"
  ) {
    loadSourceTracks(
      "fill",
      state.selectedFillIndex ?? 0
    );
  } else {
    loadSourceTracks(
      "pattern",
      state.selectedPatternIndex
    );
  }
}

export function saveHistory() {
  undoStack.push(
    createSnapshot()
  );

  if (
    undoStack.length >
    HISTORY_LIMIT
  ) {
    undoStack.shift();
  }

  redoStack.length = 0;

  window.dispatchEvent(
    new Event(
      "historychange"
    )
  );
}

export function undo() {
  if (
    undoStack.length === 0
  ) {
    return false;
  }

  redoStack.push(
    createSnapshot()
  );

  const snapshot =
    undoStack.pop();

  restoreSnapshot(
    snapshot
  );

  window.dispatchEvent(
    new Event(
      "historychange"
    )
  );

  return true;
}

export function redo() {
  if (
    redoStack.length === 0
  ) {
    return false;
  }

  undoStack.push(
    createSnapshot()
  );

  const snapshot =
    redoStack.pop();

  restoreSnapshot(
    snapshot
  );

  window.dispatchEvent(
    new Event(
      "historychange"
    )
  );

  return true;
}

export function canUndo() {
  return (
    undoStack.length > 0
  );
}

export function canRedo() {
  return (
    redoStack.length > 0
  );
}

export function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}

export function getMaxTrackLength() {
  return Math.max(
    ...tracks.map(
      track =>
        track.stepLength
    )
  );
}

export function syncPatternLength() {
  state.patternLength =
    getMaxTrackLength();

  if (
    state.patternLength <=
      PAGE_STEP_COUNT &&
    state.sequencePage === 1
  ) {
    state.sequencePage = 0;
  }
}

export function selectedTrack() {
  return tracks[
    state.selectedTrackIndex
  ];
}

export function parameterById(
  id
) {
  return parameters.find(
    parameter =>
      parameter.id === id
  );
}