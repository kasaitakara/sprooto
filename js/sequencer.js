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

    /*
     * Trackごとの最終Swing値。
     * -8〜+8、0がストレート。
     */
    swing: 0,

    /*
     * 将来のサウンドプリセット表示用。
     */
    soundName: `sound ${String(id).padStart(2, "0")}`,

    steps:
      filled(false),

    muted: false,
    solo: false,

    base: {
      note: 0,
      sine: 100,
      noise: 0,
      velocity: 70,
      attack: 1,
      decay: 5,
      fmDepth: 0,
      fmRatio: 1,
      tone: 50,
      pan: 50,
      delay: 0,
      delayTime: 25,
      delayFeedback: 35,
      probability: 100
    },

    offsets: {
      note:
        filled(0),

      velocity:
        filled(0),

      attack: filled(0),

      decay:
        filled(0),

      fmDepth:
        filled(0),

      tone:
        filled(0),

      pan:
        filled(0),

      delay:
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
      )
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
  id: "attack",
  label: "attack",
  icon: "attack",
  min: 1,
  max: 50,
  step: 1,
  offsetMode: "offset"
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
    id: "delay",
    label: "delay",
    icon: "delay",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "offset",

    children: [
      {
        id: "delay",
        label: "level"
      },

      {
        id: "delayTime",
        label: "time",
        baseOnly: true,
        min: 1,
        max: 100,
        step: 1
      },

      {
        id: "delayFeedback",
        label: "fdbk",
        baseOnly: true,
        min: 0,
        max: 95,
        step: 1
      }
    ]
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

/*
 * Trackごとの独立ループ計算に使う、
 * Pattern終端でリセットしない連続ステップ位置。
 *
 * Pattern／Fill／SectionのSourceが
 * 切り替わった時だけ0へ戻す。
 */
playbackTickIndex: null,

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
    editingSectionIndex: 0,

  /*
   * 実際に再生しているPattern／Fill。
   *
   * selected～は画面編集対象、
   * playing～は再生対象として分離する。
   */
  playingSourceType: null,
  playingPatternIndex: null,
  playingFillIndex: null,

  /*
   * 次回切替予約。
   */
  queuedSourceType: null,
  queuedPatternIndex: null,
  queuedFillIndex: null,

/*
 * Pattern／Fill単体再生か、
 * Section再生かを示す。
 */
selectedPlaybackType:
  "source",

/*
 * 現在再生中のSection。
 * nullならPattern／Fill単体再生。
 */
playingSectionIndex:
  null,

/*
 * Section内で現在再生中の位置。
 */
playingSectionItemIndex:
  null,

/*
 * 次回再生予約中のSection。
 */
queuedSectionIndex:
  null
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

  state.selectedPlaybackType =
  "source";

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

export function clearQueuedSource() {
  state.queuedSourceType =
    null;

  state.queuedPatternIndex =
    null;

  state.queuedFillIndex =
    null;

  state.queuedSectionIndex =
    null;
}

export function queuePattern(
  patternIndex
) {
  if (
    patternIndex < 0 ||
    patternIndex >=
      patterns.length
  ) {
    return false;
  }

  /*
   * 同じPatternがすでに予約中なら
   * 再選択で予約解除。
   */
  if (
    state.queuedSourceType ===
      "pattern" &&
    state.queuedPatternIndex ===
      patternIndex
  ) {
    clearQueuedSource();

    return true;
  }

  /*
   * 現在再生中のPatternを押した場合は
   * 切替予約を作らない。
   */
  if (
    state.playingSourceType ===
      "pattern" &&
    state.playingPatternIndex ===
      patternIndex
  ) {
    clearQueuedSource();

    return true;
  }

  state.queuedSourceType =
    "pattern";

  state.queuedPatternIndex =
    patternIndex;

  state.queuedFillIndex =
    null;

  return true;
}

export function queueFill(
  fillIndex
) {
  if (
    fillIndex < 0 ||
    fillIndex >=
      fills.length
  ) {
    return false;
  }

  /*
   * 同じFillがすでに予約中なら
   * 再選択で予約解除。
   */
  if (
    state.queuedSourceType ===
      "fill" &&
    state.queuedFillIndex ===
      fillIndex
  ) {
    clearQueuedSource();

    return true;
  }

  /*
   * 現在再生中のFillを押した場合は
   * 切替予約を作らない。
   */
  if (
    state.playingSourceType ===
      "fill" &&
    state.playingFillIndex ===
      fillIndex
  ) {
    clearQueuedSource();

    return true;
  }

  state.queuedSourceType =
    "fill";

  state.queuedPatternIndex =
    null;

  state.queuedFillIndex =
    fillIndex;

  return true;
}

export function queueSection(
  sectionIndex
) {
  if (
    sectionIndex < 0 ||
    sectionIndex >=
      sections.length
  ) {
    return false;
  }

  const section =
    sections[sectionIndex];

  /*
   * 空のSectionは予約しない。
   */
  if (
    !section ||
    section.sequence.length === 0
  ) {
    return false;
  }

  /*
   * 同じSectionを再選択したら
   * 予約解除。
   */
  if (
    state.queuedSectionIndex ===
      sectionIndex
  ) {
    clearQueuedSource();

    return true;
  }

  /*
   * 現在再生中のSectionを押した場合も
   * 予約を作らない。
   */
  if (
    state.playingSectionIndex ===
      sectionIndex
  ) {
    clearQueuedSource();

    return true;
  }

  clearQueuedSource();

  state.queuedSectionIndex =
    sectionIndex;

  return true;
}

function activatePlayingSource(
  type,
  index
) {
  const loaded =
    loadSourceTracks(
      type,
      index
    );

  if (!loaded) {
    return false;
  }

  state.selectedSourceType =
    type;

  if (type === "fill") {
    state.selectedFillIndex =
      index;

    state.playingSourceType =
      "fill";

    state.playingPatternIndex =
      null;

    state.playingFillIndex =
      index;
  } else {
    state.selectedPatternIndex =
      index;

    state.selectedFillIndex =
      null;

    state.playingSourceType =
      "pattern";

    state.playingPatternIndex =
      index;

    state.playingFillIndex =
      null;
  }

  return true;
}

export function startSectionPlayback(
  sectionIndex
) {
  const section =
    sections[sectionIndex];

  if (
    !section ||
    section.sequence.length === 0
  ) {
    return false;
  }

  const firstSource =
    section.sequence[0];

  if (
    !firstSource ||
    !activatePlayingSource(
      firstSource.type,
      firstSource.index
    )
  ) {
    return false;
  }

  state.selectedPlaybackType =
    "section";

  state.selectedSectionIndex =
    sectionIndex;

  state.playingSectionIndex =
    sectionIndex;

  state.playingSectionItemIndex =
    0;

  return true;
}

export function beginSelectedPlayback() {
  /*
   * Sectionが選択されている場合。
   */
  if (
    state.selectedPlaybackType ===
      "section"
  ) {
    const started =
      startSectionPlayback(
        state.selectedSectionIndex
      );

    if (started) {
      return true;
    }
  }

  /*
   * 空Sectionなどの場合は、
   * 現在表示中のPattern／Fillを再生する。
   */
  state.selectedPlaybackType =
    "source";

  state.playingSectionIndex =
    null;

  state.playingSectionItemIndex =
    null;

  return activatePlayingSource(
    state.selectedSourceType,
    state.selectedSourceType ===
      "fill"
      ? state.selectedFillIndex ?? 0
      : state.selectedPatternIndex
  );
}

export function applyQueuedSource() {
  const queuedType =
    state.queuedSourceType;

  /*
   * Pattern予約
   */
  if (
    queuedType === "pattern" &&
    state.queuedPatternIndex !==
      null
  ) {
    const patternIndex =
      state.queuedPatternIndex;

    const selected =
      selectPattern(
        patternIndex
      );

    if (!selected) {
      clearQueuedSource();

      return false;
    }

    state.selectedPlaybackType =
  "source";

state.playingSectionIndex =
  null;

state.playingSectionItemIndex =
  null;

    state.playingSourceType =
      "pattern";

    state.playingPatternIndex =
      patternIndex;

    state.playingFillIndex =
      null;

    clearQueuedSource();

    return true;
  }

  /*
   * Fill予約
   */
  if (
    queuedType === "fill" &&
    state.queuedFillIndex !==
      null
  ) {
    const fillIndex =
      state.queuedFillIndex;

    const selected =
      selectFill(
        fillIndex
      );

    if (!selected) {
      clearQueuedSource();

      return false;
    }

    state.selectedPlaybackType =
  "source";

state.playingSectionIndex =
  null;

state.playingSectionItemIndex =
  null;

    state.playingSourceType =
      "fill";

    state.playingPatternIndex =
      null;

    state.playingFillIndex =
      fillIndex;

    clearQueuedSource();

    return true;
  }

  return false;
}

export function advancePlaybackSource() {
  /*
   * Section再生中ではない場合。
   */
  if (
    state.playingSectionIndex ===
      null
  ) {
    /*
     * Section予約がある場合は
     * Pattern終端でSectionを開始。
     */
    if (
      state.queuedSectionIndex !==
        null
    ) {
      const sectionIndex =
        state.queuedSectionIndex;

      clearQueuedSource();

      return startSectionPlayback(
        sectionIndex
      );
    }

    return applyQueuedSource();
  }

  /*
   * Section再生中にPattern／Fillが
   * 直接予約された場合は、
   * 次の終端でSection再生を終了する。
   */
  if (
    state.queuedSourceType ===
      "pattern" ||
    state.queuedSourceType ===
      "fill"
  ) {
    return applyQueuedSource();
  }

  const section =
    sections[
      state.playingSectionIndex
    ];

  if (
    !section ||
    section.sequence.length === 0
  ) {
    state.playingSectionIndex =
      null;

    state.playingSectionItemIndex =
      null;

    return false;
  }

  const currentItemIndex =
    state.playingSectionItemIndex ??
    0;

  const nextItemIndex =
    currentItemIndex + 1;

  /*
   * Section内に次のSourceがある。
   */
  if (
    nextItemIndex <
    section.sequence.length
  ) {
    const nextSource =
      section.sequence[
        nextItemIndex
      ];

    const changed =
      activatePlayingSource(
        nextSource.type,
        nextSource.index
      );

    if (!changed) {
      return false;
    }

    state.playingSectionItemIndex =
      nextItemIndex;

    return true;
  }

  /*
   * Section末尾。
   * Section予約があれば切り替える。
   */
  if (
    state.queuedSectionIndex !==
      null
  ) {
    const sectionIndex =
      state.queuedSectionIndex;

    clearQueuedSource();

    return startSectionPlayback(
      sectionIndex
    );
  }

  /*
   * 予約がなければ、
   * 現在のSection先頭へ戻る。
   */
  const firstSource =
    section.sequence[0];

  const changed =
    activatePlayingSource(
      firstSource.type,
      firstSource.index
    );

  if (!changed) {
    return false;
  }

  state.playingSectionItemIndex =
    0;

  return true;
}

export function addSourceToSection(
  type,
  sourceIndex,
  sectionIndex =
    state.editingSectionIndex
) {
  const section =
    sections[sectionIndex];

  if (!section) {
    return false;
  }

  if (
    section.sequence.length >= 7
  ) {
    return false;
  }

  /*
   * Pattern／Fillの種類と番号を検証。
   */
  if (
    type === "pattern"
  ) {
    if (
      sourceIndex < 0 ||
      sourceIndex >=
        patterns.length
    ) {
      return false;
    }
  } else if (
    type === "fill"
  ) {
    if (
      sourceIndex < 0 ||
      sourceIndex >=
        fills.length
    ) {
      return false;
    }
  } else {
    return false;
  }

  section.sequence.push({
    type,
    index: sourceIndex
  });

  return true;
}

export function addCurrentSourceToSection(
  sectionIndex =
    state.editingSectionIndex
) {
  const type =
    state.selectedSourceType ===
      "fill"
      ? "fill"
      : "pattern";

  const sourceIndex =
    type === "fill"
      ? state.selectedFillIndex ?? 0
      : state.selectedPatternIndex ?? 0;

  return addSourceToSection(
    type,
    sourceIndex,
    sectionIndex
  );
}

export function moveSectionSource(
  fromIndex,
  toIndex,
  sectionIndex =
    state.editingSectionIndex
) {
  const section =
    sections[sectionIndex];

  if (
    !section ||
    fromIndex < 0 ||
    fromIndex >=
      section.sequence.length ||
    toIndex < 0 ||
    toIndex >=
      section.sequence.length ||
    fromIndex === toIndex
  ) {
    return false;
  }

  const [source] =
    section.sequence.splice(
      fromIndex,
      1
    );

  section.sequence.splice(
    toIndex,
    0,
    source
  );

  return true;
}

export function removeSectionSource(
  itemIndex,
  sectionIndex =
    state.editingSectionIndex
) {
  const section =
    sections[sectionIndex];

  if (
    !section ||
    itemIndex < 0 ||
    itemIndex >=
      section.sequence.length
  ) {
    return false;
  }

  section.sequence.splice(
    itemIndex,
    1
  );

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

  state.selectedPlaybackType =
  "source";

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

  state.selectedPlaybackType =
    "section";

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

export function createSnapshot() {
  return structuredClone({
    patterns,
    fills,
    sections,
    state
  });
}


function normalizeTrackData(track) {
  if (!track || typeof track !== "object") {
    return;
  }

  track.base ??= {};
  track.offsets ??= {};

  if (
    typeof track.base.delay !==
    "number"
  ) {
    track.base.delay = 0;
  }

  if (
    typeof track.base.delayTime !==
    "number"
  ) {
    track.base.delayTime = 25;
  }

  if (
    typeof track.base.delayFeedback !==
    "number"
  ) {
    track.base.delayFeedback = 35;
  }

  if (
    !Array.isArray(
      track.offsets.delay
    )
  ) {
    track.offsets.delay =
      filled(0);
  }
}

function normalizeSnapshotData(
  snapshot
) {
  [
    ...(snapshot.patterns ?? []),
    ...(snapshot.fills ?? [])
  ].forEach(source => {
    source?.tracks?.forEach(
      normalizeTrackData
    );
  });

  return snapshot;
}

export function restoreSnapshot(
  snapshot
) {
  normalizeSnapshotData(
    snapshot
  );
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

export function clearSelectedTrackSequence() {
  const track = selectedTrack();

  if (!track) {
    return false;
  }

  const hasActiveStep =
    track.steps.some(Boolean);

  if (!hasActiveStep) {
    return false;
  }

  saveHistory();
  track.steps.fill(false);

  return true;
}

export function clearSelectedParameterOffsets(
  parameterId
) {
  const track = selectedTrack();
  const offsets =
    track?.offsets?.[parameterId];

  if (!offsets) {
    return false;
  }

  const hasOffset =
    offsets.some(
      value => value !== 0
    );

  if (!hasOffset) {
    return false;
  }

  saveHistory();
  offsets.fill(0);

  return true;
}

