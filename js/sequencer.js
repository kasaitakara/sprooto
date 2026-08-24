import { createDefaultSound, normalizeSound } from "./sound-defaults.js";

const PERF_PATTERN_DEBUG = false;
function perfPatternLog(label, startedAt, detail = {}) {
  if (!PERF_PATTERN_DEBUG) return;
  const ms = performance.now() - startedAt;
  if (ms >= 0.5) {
    console.log(`[PERF ${label}]`, { ms: Number(ms.toFixed(3)), ...detail });
  }
}

export const STEP_COUNT = 64;
export const PAGE_STEP_COUNT = 32;
export const TRACK_COUNT = 4;

export const PATTERN_SLOT_COUNT = 24;
export const FILL_SLOT_COUNT = 8;
export const SECTION_SLOT_COUNT = 16;
export const SONG_PART_COUNT = 64;

const filled = value =>
  Array(STEP_COUNT).fill(value);


export const CHORD_NAMES = Object.freeze([
  "off", "maj", "min", "dim", "aug", "sus2", "sus4",
  "6", "m6", "7", "maj7", "m7", "mMaj7", "m7♭5", "dim7",
  "add9", "madd9", "9", "maj9", "m9", "7♭9", "7♯9", "7♯11", "7♭13"
]);

const CHORD_DEFINITIONS = Object.freeze([
  { intervals: [0] },
  { intervals: [0, 4, 7] },
  { intervals: [0, 3, 7] },
  { intervals: [0, 3, 6], protected: [6] },
  { intervals: [0, 4, 8], protected: [8] },
  { intervals: [0, 2, 7], protected: [2, 7] },
  { intervals: [0, 5, 7], protected: [5, 7] },
  { intervals: [0, 4, 7, 9] },
  { intervals: [0, 3, 7, 9] },
  { intervals: [0, 4, 7, 10] },
  { intervals: [0, 4, 7, 11] },
  { intervals: [0, 3, 7, 10] },
  { intervals: [0, 3, 7, 11] },
  { intervals: [0, 3, 6, 10], protected: [6] },
  { intervals: [0, 3, 6, 9], protected: [6] },
  { intervals: [0, 4, 7, 14] },
  { intervals: [0, 3, 7, 14] },
  { intervals: [0, 4, 7, 10, 14] },
  { intervals: [0, 4, 7, 11, 14] },
  { intervals: [0, 3, 7, 10, 14] },
  { intervals: [0, 4, 7, 10, 13] },
  { intervals: [0, 4, 7, 10, 15] },
  { intervals: [0, 4, 7, 10, 18] },
  { intervals: [0, 4, 7, 10, 20] }
]);

export function resolveChordNoteOffsets(
  chordIndex,
  voices = 4,
  inversion = 0,
) {
  const safeChordIndex = clamp(
    Math.round(Number(chordIndex) || 0),
    0,
    CHORD_DEFINITIONS.length - 1
  );

  if (safeChordIndex === 0) {
    return [0];
  }

  const definition = CHORD_DEFINITIONS[safeChordIndex];
  let intervals = [...definition.intervals];
  const targetVoices = clamp(Math.round(Number(voices) || 1), 1, 4);

  /*
   * 省略は基本的に5th → Root。
   * dim / aug / sus等、5th側がキャラクターになるコードは protected で守る。
   */
  while (intervals.length > targetVoices) {
    let removeIndex = intervals.findIndex((interval, index) =>
      index > 0 &&
      interval % 12 === 7 &&
      !definition.protected?.includes(interval)
    );

    if (removeIndex < 0 && intervals.length > 3) {
      removeIndex = intervals.findIndex(interval => interval === 0);
    }

    if (removeIndex < 0) {
      /* それでも多い場合は内声側から省略し、最上位のテンションを残す。 */
      removeIndex = Math.max(1, intervals.length - 2);
    }

    intervals.splice(removeIndex, 1);
  }

  /* トライアド等で4 voicesを選んだ場合はRootを1oct上へ重ねる。 */
  while (intervals.length < targetVoices) {
    intervals.push(12);
  }

  intervals.sort((a, b) => a - b);

  const safeInversion = clamp(
    Math.round(Number(inversion) || 0),
    0,
    Math.min(3, intervals.length - 1)
  );

  for (let index = 0; index < safeInversion; index++) {
    const lowest = intervals.shift();
    intervals.push(lowest + 12);
    intervals.sort((a, b) => a - b);
  }

  return intervals
  .sort((a, b) => a - b);
}

function makePinSound(slot) {
  const sound = createDefaultSound();

  return {
    ...sound,
    soundName: `pin ${slot}`
  };
}

function makePinSounds() {
  return {
    a: makePinSound("a"),
    b: makePinSound("b"),
    c: makePinSound("c")
  };
}

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

    /*
     * Pin機能の有効／無効。
     * Pattern / Fillごとの各Trackで独立して保持する。
     */
    pinEnabled: false,

    /* StepごとのPin Sound指定。nullはMain。 */
    pins: filled(null),

    /* Track内で共有する3つの独立Pin Sound。 */
    pinSounds: makePinSounds(),

    /* ENV親枠へ最後に表示した子パラメーター */
    envelopeSelectedId: "holdDecay",
    articulationSelectedId: "glide",

    /* LFO編集画面で最後に選択していた系統 */
    lfoSelected: 1,

    steps:
      filled(false),

    muted: false,
solo: false,

    base: {
  note: 0,
  chord: 0,
  voices: 4,
  inversion: 0,
  sineVolume: 100,
  velocity: 70,
  attack: 1,
  holdDecay: 0,
  fmDepth: 0,
fmRatio: 1,
fmFeedback: 0,
filterCutoff: 0,
      filterResonance: 0,
      pan: 0,
      probability: 100,
      subPattern: -1,
      subCrescendo: 0,
      subProbability: 100,
      glide: 0,
      nudge: 0,
      strum: 0,

      lfo1Target: "pitch",
      lfo1Wave: "sine",
      lfo1Depth: 0,
      lfo1Rate: 25,
      lfo1SyncMode: "free",

      lfo2Target: "pitch",
      lfo2Wave: "sine",
      lfo2Depth: 0,
      lfo2Rate: 25,
      lfo2SyncMode: "free"
    },

    offsets: {
  note:
    filled(0),

  chord:
    filled(0),

  voices:
    filled(0),

  inversion:
    filled(0),

  velocity:
    filled(0),

  attack:
  filled(0),

holdDecay:
  filled(0),

sineVolume:
  filled(0),

  fmDepth:
    filled(0),

    fmRatio:
  filled(0),

fmFeedback:
  filled(0),

  filterCutoff:
    filled(0),

  filterResonance:
    filled(0),

  pan:
    filled(0),

  probability:
    filled(0),

  subPattern:
    filled(0),

  subCrescendo:
    filled(0),

  subProbability:
    filled(0),

  glide:
    filled(0),

  nudge:
    filled(0),

  strum:
    filled(0),

  lfo1Depth:
    filled(0),

  lfo1Rate:
    filled(0),

  lfo2Depth:
    filled(0),

  lfo2Rate:
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
 * SongはPattern / Fill / Sectionへの参照を
 * 再生順に詰めた配列として保持する。
 * 初期仕様は最大64パーツ。
 */
function makeSongData() {
  return {
    sequence: [],

    /* Song全体へ掛けるMaster Mix */
    masterMix: {
      eq: [0, 0, 0, 0, 0, 0, 0, 0],
      volume: 100,
      limiter: -1,
      reverb: 0
    }
  };
}

export const song =
  makeSongData();

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
    min: -60,
    max: 67,
    step: 1,
    offsetMode: "result",
    children: [
      { id: "note", label: "note", min: -60, max: 67, step: 1, offsetMode: "result" },
      { id: "chord", label: "chord", min: 0, max: 23, step: 1, offsetMode: "result" },
      { id: "voices", label: "voices", min: 1, max: 4, step: 1, offsetMode: "result" },
      { id: "inversion", label: "inv", min: 0, max: 3, step: 1, offsetMode: "result" },
    ]
  },

  {
    id: "chord", label: "chord", icon: "note", min: 0, max: 23, step: 1, offsetMode: "result"
  },
  {
    id: "voices", label: "voices", icon: "note", min: 1, max: 4, step: 1, offsetMode: "result"
  },
  {
    id: "inversion", label: "inversion", icon: "note", min: 0, max: 3, step: 1, offsetMode: "result"
  },

  {
    id: "velocity",
    label: "volume",
    icon: "volume",
    min: 0,
    max: 150,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "sineVolume",
    label: "sine volume",
    icon: "volume",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "offset"
  },

  {
  id: "attack",
  label: "attack",
  icon: "attack",
  min: 1,
  max: 100,
  step: 1,
  offsetMode: "offset"
},

{
  id: "holdDecay",
  label: "h/d",
  icon: "decay",
  min: -50,
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
      label: "depth",
      min: 0,
      max: 20,
      step: 1
    },

    {
      id: "fmRatio",
      label: "ratio",
      min: 0.25,
      max: 8,
      step: 0.25
    },

    {
      id: "fmFeedback",
      label: "feedback",
      min: 0,
      max: 50,
      step: 1
    }
  ]
},

  {
    id: "filterCutoff",
    label: "cutoff",
    icon: "tone",
    min: -50,
    max: 50,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "filterResonance",
    label: "resonance",
    icon: "tone",
    min: 0,
    max: 50,
    step: 1,
    offsetMode: "offset"
  },

  {
    id: "pan",
    label: "pan",
    icon: "pan",
    min: -25,
    max: 25,
    step: 1,
    offsetMode: "offset"
  },

{
  id: "lfo1Depth",
  label: "LFO1 depth",
  icon: "lfo",
  min: 0,
  max: 100,
  step: 1,
  offsetMode: "offset"
},

{
  id: "lfo1Rate",
  label: "LFO1 rate",
  icon: "lfo",
  min: 1,
  max: 100,
  step: 1,
  offsetMode: "offset"
},

{
  id: "lfo2Depth",
  label: "LFO2 depth",
  icon: "lfo",
  min: 0,
  max: 100,
  step: 1,
  offsetMode: "offset"
},

{
  id: "lfo2Rate",
  label: "LFO2 rate",
  icon: "lfo",
  min: 1,
  max: 100,
  step: 1,
  offsetMode: "offset"
},

  {
  id: "lfo",
  label: "lfo",
  icon: "lfo",
  baseOnly: true,

  children: [
    {
      id: "lfoTarget",
      label: "target",
      baseOnly: true
    },

    {
      id: "lfoWave",
      label: "wave",
      baseOnly: true
    },

    {
      id: "lfoDepth",
      label: "depth",
      min: 0,
      max: 100,
      step: 1
    },

    {
      id: "lfoRate",
      label: "rate",
      min: 1,
      max: 100,
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
  },


  {
    id: "glide",
    label: "glide",
    icon: "articulation",
    min: 0,
    max: 8,
    step: 1,
    offsetMode: "result"
  },

  {
    id: "nudge",
    label: "nudge",
    icon: "articulation",
    min: -4,
    max: 4,
    step: 1,
    offsetMode: "result"
  },

  {
    id: "strum",
    label: "strum",
    icon: "articulation",
    min: -8,
    max: 8,
    step: 1,
    offsetMode: "result"
  },

  {
    id: "subPattern",
    label: "pattern",
    icon: "sub",
    min: -1,
    max: 6,
    step: 1,
    offsetMode: "result"
  },

  {
    id: "subCrescendo",
    label: "cres.",
    icon: "sub",
    min: -3,
    max: 3,
    step: 1,
    offsetMode: "result"
  },

  {
    id: "subProbability",
    label: "prob",
    icon: "sub",
    min: 0,
    max: 100,
    step: 1,
    offsetMode: "result"
  }
];

function makeDefaultRuntimeState() {
  return {
  selectedTrackIndex: 0,

  selectedParameterId: null,
  selectedChildId: null,

  sequencePage: 0,
  patternLength: 32,

  /* Song編集UI */
  songMode: false,
  songPage: 0,

  /*
   * Song再生開始位置と現在位置。
   * selectedは停止中にタップした開始位置、
   * playingは実際に再生中のSong枠。
   */
  selectedSongPartIndex: 0,
  playingSongPartIndex: null,
  queuedSongPartIndex: null,

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
  null,

/*
 * 単発Fill再生後に戻る場所。
 *
 * Pattern単体再生：
 * {
 *   type: "pattern",
 *   patternIndex: 0
 * }
 *
 * Section再生：
 * {
 *   type: "section",
 *   sectionIndex: 0,
 *   sectionItemIndex: 0
 * }
 */
fillReturnTarget:
  null
};
}

export const state =
  makeDefaultRuntimeState();



export function resolveStepSound(
  track,
  stepIndex
) {

  /*
   * PinモードOFF中は、Stepにa/b/cの配置情報が残っていても
   * 完全に無視してMain Soundを使う。
   */
  if (!track?.pinEnabled) {
    return track;
  }

  const slot =
    track?.pins?.[stepIndex];

  if (
    (slot === "a" || slot === "b" || slot === "c") &&
    track?.pinSounds?.[slot]
  ) {
    return track.pinSounds[slot];
  }

  return track;
}

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
  const perfStartedAt = performance.now();
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

  perfPatternLog(
    "LOAD_SOURCE",
    perfStartedAt,
    { type, index: index + 1, patternLength: state.patternLength }
  );

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

  state.queuedSongPartIndex =
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
   * 再生予約は常に1つだけ。
   * Section / Fillなど既存予約を消してから
   * Pattern予約へ切り替える。
   */
  clearQueuedSource();

  state.queuedSourceType =
    "pattern";

  state.queuedPatternIndex =
    patternIndex;

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
   * 再生予約は常に1つだけ。
   * Section / Patternなど既存予約を消してから
   * Fill予約へ切り替える。
   */
  clearQueuedSource();

  state.queuedSourceType =
    "fill";

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


function songPartIsPlayable(
  songPartIndex
) {
  const part =
    song.sequence[
      songPartIndex
    ];

  if (!part) {
    return false;
  }

  if (
    part.type === "section"
  ) {
    return Boolean(
      sections[
        part.index
      ]?.sequence?.length
    );
  }

  return (
    part.type === "pattern" ||
    part.type === "fill"
  );
}

function nextPlayableSongPartIndex(
  startIndex
) {
  const minimumIndex =
    Math.max(
      0,
      Math.round(
        Number(startIndex) || 0
      )
    );

  for (
    let songPartIndex = minimumIndex;
    songPartIndex < song.sequence.length;
    songPartIndex++
  ) {
    if (
      songPartIsPlayable(
        songPartIndex
      )
    ) {
      return songPartIndex;
    }
  }

  return null;
}

export function selectSongPart(
  songPartIndex
) {
  if (
    !songPartIsPlayable(
      songPartIndex
    )
  ) {
    return false;
  }

  state.selectedPlaybackType =
    "song";

  state.selectedSongPartIndex =
    songPartIndex;

  return true;
}

export function queueSongPart(
  songPartIndex
) {
  if (
    !songPartIsPlayable(
      songPartIndex
    )
  ) {
    return false;
  }

  /*
   * 同じSong枠を再選択したら予約解除。
   */
  if (
    state.queuedSongPartIndex ===
      songPartIndex
  ) {
    clearQueuedSource();

    return true;
  }

  /*
   * Pattern / Fill / Sectionを含め、
   * 再生予約は常に1つだけ。
   */
  clearQueuedSource();

  state.queuedSongPartIndex =
    songPartIndex;

  state.selectedSongPartIndex =
    songPartIndex;

  return true;
}

function activateSongPart(
  songPartIndex
) {
  const part =
    song.sequence[
      songPartIndex
    ];

  if (
    !part ||
    !songPartIsPlayable(
      songPartIndex
    )
  ) {
    return false;
  }

  clearQueuedSource();
  state.fillReturnTarget =
    null;

  state.selectedPlaybackType =
    "song";

  state.playingSongPartIndex =
    songPartIndex;

  state.selectedSongPartIndex =
    songPartIndex;

  state.songPage =
    Math.floor(
      songPartIndex / 32
    );

  if (
    part.type === "section"
  ) {
    const section =
      sections[
        part.index
      ];

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

    state.playingSectionIndex =
      part.index;

    state.playingSectionItemIndex =
      0;

    return true;
  }

  state.playingSectionIndex =
    null;

  state.playingSectionItemIndex =
    null;

  return activatePlayingSource(
    part.type,
    part.index
  );
}

export function beginSongPlayback() {
  if (
    song.sequence.length === 0
  ) {
    state.playingSongPartIndex =
      null;

    return false;
  }

  const requestedIndex =
    clamp(
      Math.round(
        Number(
          state.selectedSongPartIndex
        ) || 0
      ),
      0,
      Math.max(
        0,
        song.sequence.length - 1
      )
    );

  let startIndex =
    nextPlayableSongPartIndex(
      requestedIndex
    );

  if (
    startIndex === null &&
    requestedIndex > 0
  ) {
    startIndex =
      nextPlayableSongPartIndex(
        0
      );
  }

  if (
    startIndex === null
  ) {
    state.playingSongPartIndex =
      null;

    return false;
  }

  return activateSongPart(
    startIndex
  );
}

function advanceSongPlaybackSource() {
  const songPartIndex =
    state.playingSongPartIndex;

  if (
    songPartIndex === null
  ) {
    return false;
  }

  const part =
    song.sequence[
      songPartIndex
    ];

  if (
    part?.type === "section" &&
    state.playingSectionIndex !==
      null
  ) {
    const section =
      sections[
        state.playingSectionIndex
      ];

    const currentItemIndex =
      state.playingSectionItemIndex ??
      0;

    const nextItemIndex =
      currentItemIndex + 1;

    if (
      section &&
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
  }

  const nextSongPartIndex =
    nextPlayableSongPartIndex(
      songPartIndex + 1
    );

  if (
    nextSongPartIndex === null
  ) {
    state.playingSongPartIndex =
      null;

    state.playingSectionIndex =
      null;

    state.playingSectionItemIndex =
      null;

    return false;
  }

  return activateSongPart(
    nextSongPartIndex
  );
}

export function beginSelectedPlayback() {
  /*
   * 停止中に最後に選ばれた再生対象を開始する。
   * Song画面でもPattern / Fill / Section / Songを
   * 同列の再生対象として扱う。
   */
  if (
    state.selectedPlaybackType ===
      "song"
  ) {
    return beginSongPlayback();
  }

  state.playingSongPartIndex =
    null;

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

function captureFillReturnTarget() {
  /*
   * すでにFillからの戻り先を
   * 持っている場合は上書きしない。
   */
  if (state.fillReturnTarget) {
    return;
  }

  /*
   * Section再生中。
   */
  if (
    state.playingSectionIndex !==
      null
  ) {
    state.fillReturnTarget = {
      type: "section",

      sectionIndex:
        state.playingSectionIndex,

      sectionItemIndex:
        state.playingSectionItemIndex ??
        0
    };

    return;
  }

  /*
   * Pattern単体再生中。
   */
  if (
    state.playingSourceType ===
      "pattern" &&
    state.playingPatternIndex !==
      null
  ) {
    state.fillReturnTarget = {
      type: "pattern",

      patternIndex:
        state.playingPatternIndex
    };
  }
}

function returnFromFill() {
  const target =
    state.fillReturnTarget;

  if (!target) {
    return false;
  }

  state.fillReturnTarget =
    null;

  /*
   * Pattern単体へ戻る。
   */
  if (
    target.type ===
      "pattern"
  ) {
    const changed =
      activatePlayingSource(
        "pattern",
        target.patternIndex
      );

    if (!changed) {
      return false;
    }

    state.selectedPlaybackType =
      "source";

    state.playingSectionIndex =
      null;

    state.playingSectionItemIndex =
      null;

    return true;
  }

  /*
   * Sectionへ戻り、
   * Fillを挟んだ次の項目から
   * 再生を続行する。
   */
  if (
    target.type ===
      "section"
  ) {
    const section =
      sections[
        target.sectionIndex
      ];

    if (
      !section ||
      section.sequence.length === 0
    ) {
      return false;
    }

    const nextItemIndex =
      (
        target.sectionItemIndex +
        1
      ) %
      section.sequence.length;

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

    state.selectedPlaybackType =
      "section";

    state.selectedSectionIndex =
      target.sectionIndex;

    state.playingSectionIndex =
      target.sectionIndex;

    state.playingSectionItemIndex =
      nextItemIndex;

    return true;
  }

  return false;
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

  /*
   * Patternを直接予約した場合は、
   * Section再生から完全に抜けて
   * Pattern単体再生へ移行する。
   */
  state.selectedPlaybackType =
    "source";

  state.playingSectionIndex =
    null;

  state.playingSectionItemIndex =
    null;

  state.fillReturnTarget =
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

/*
 * Fillへ切り替える前に、
 * 現在のPattern／Sectionを保存する。
 */
captureFillReturnTarget();

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
   * Song枠が予約されている場合。
   *
   * Pattern / Fill / Section / Songのどこを再生中でも、
   * 現在Sourceの終端で予約したSong枠へ切り替える。
   */
  if (
    state.queuedSongPartIndex !==
      null
  ) {
    const songPartIndex =
      state.queuedSongPartIndex;

    return activateSongPart(
      songPartIndex
    );
  }

  /*
   * Song再生中にPattern / Fill / Sectionが予約された場合。
   *
   * 現在のSongブロック終端でSong再生から完全に抜け、
   * 予約先を通常再生へ切り替える。
   * Songへは自動復帰しない。
   */
  if (
    state.playingSongPartIndex !==
      null &&
    (
      state.queuedSourceType ===
        "pattern" ||
      state.queuedSourceType ===
        "fill" ||
      state.queuedSectionIndex !==
        null
    )
  ) {
    const queuedSectionIndex =
      state.queuedSectionIndex;

    const queuedSourceType =
      state.queuedSourceType;

    state.playingSongPartIndex =
      null;

    state.playingSectionIndex =
      null;

    state.playingSectionItemIndex =
      null;

    state.fillReturnTarget =
      null;

    state.selectedPlaybackType =
      "source";

    /*
     * Section予約なら通常のSectionループへ移行。
     */
    if (
      queuedSectionIndex !==
        null
    ) {
      clearQueuedSource();

      return startSectionPlayback(
        queuedSectionIndex
      );
    }

    /*
     * Fillへ抜ける時はSong内Sourceを戻り先にしない。
     * これでFill終了後もSongへ自動復帰しない。
     */
    if (
      queuedSourceType ===
        "fill"
    ) {
      state.playingSourceType =
        null;

      state.playingPatternIndex =
        null;

      state.playingFillIndex =
        null;
    }

    return applyQueuedSource();
  }

  /*
   * Song再生中で予約がなければ、
   * Songの次ブロックへ進む。
   */
  if (
    state.playingSongPartIndex !==
      null
  ) {
    return advanceSongPlaybackSource();
  }

  /*
   * 単発Fillが終わり、
   * 別の予約操作がない場合は
   * 元のPattern／Sectionへ戻る。
   */
  if (
    state.playingSourceType ===
      "fill" &&
    state.fillReturnTarget &&
    state.queuedSourceType ===
      null &&
    state.queuedSectionIndex ===
      null
  ) {
    return returnFromFill();
  }

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

/*
 * Section予約がある場合は、
 * 現在再生中のPatternが終わった時点で
 * 予約Sectionの先頭から開始する。
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
 * Section末尾まで来たら、
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
    state.editingSectionIndex,
  insertIndex = null
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

  const source = {
    type,
    index: sourceIndex
  };

  /*
   * 挿入位置が指定されていなければ
   * 従来どおり末尾へ追加。
   */
  if (insertIndex === null) {
    section.sequence.push(
      source
    );

    return true;
  }

  /*
   * 指定位置へ挿入。
   */
  const correctedIndex =
    Math.max(
      0,
      Math.min(
        Math.round(
          insertIndex
        ),
        section.sequence.length
      )
    );

  section.sequence.splice(
    correctedIndex,
    0,
    source
  );

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

/*
 * Pattern / Fillに
 * 実質的な編集情報が入っているか判定する。
 *
 * Mute / Solo / FX Muteや、
 * 最後に開いていた編集項目などの
 * 一時的なUI・演奏状態は対象外。
 */
export function sourceHasData(
  type,
  sourceIndex
) {
  const source =
    type === "fill"
      ? fills[sourceIndex]
      : patterns[sourceIndex];

  if (!source?.tracks) {
    return false;
  }

  return source.tracks.some(
    track => {
      const initial =
        makeTrack(
          track.id
        );

      /*
       * Step入力
       */
      if (
        track.steps?.some(
          Boolean
        )
      ) {
        return true;
      }

      /*
       * Track Step数
       */
      if (
        track.stepLength !==
        initial.stepLength
      ) {
        return true;
      }

      /*
       * Swing
       */
      if (
        track.swing !==
        initial.swing
      ) {
        return true;
      }

      /*
       * Sound名
       */
      if (
        track.soundName !==
        initial.soundName
      ) {
        return true;
      }

      /*
       * Base parameter
       */
      const baseChanged =
        Object.keys(
          initial.base
        ).some(
          parameterId =>
            track.base?.[
              parameterId
            ] !==
            initial.base[
              parameterId
            ]
        );

      if (baseChanged) {
        return true;
      }

      /*
       * Step Offset
       */
      const offsetChanged =
        Object.values(
          track.offsets ?? {}
        ).some(
          values =>
            Array.isArray(
              values
            ) &&
            values.some(
              value =>
                Number(value) !== 0
            )
        );

      if (offsetChanged) {
        return true;
      }

      if (track.pins?.some(Boolean)) {
        return true;
      }

      const pinSoundChanged = ["a", "b", "c"].some(slot => {
        return JSON.stringify(track.pinSounds?.[slot]) !==
          JSON.stringify(initial.pinSounds?.[slot]);
      });

      if (pinSoundChanged) {
        return true;
      }

      return false;
    }
  );
}

/*
 * SectionにPattern / Fillが
 * 1つ以上登録されているか。
 */
export function sectionHasData(
  sectionIndex
) {
  return Boolean(
    sections[
      sectionIndex
    ]?.sequence?.length
  );
}

let sourceClipboard = null;

export function hasSourceClipboard() {
  return Boolean(
    sourceClipboard
  );
}

export function copySource(
  type,
  sourceIndex
) {
  const source =
    type === "fill"
      ? fills[sourceIndex]
      : patterns[sourceIndex];

  if (!source) {
    return false;
  }

  sourceClipboard = structuredClone(
    source
  );

  return true;
}

export function pasteSource(
  type,
  sourceIndex
) {
  if (!sourceClipboard) {
    return false;
  }

  const target =
    type === "fill"
      ? fills[sourceIndex]
      : patterns[sourceIndex];

  if (!target) {
    return false;
  }

  saveHistory();

  const copied =
    structuredClone(
      sourceClipboard
    );

  Object.keys(target)
    .forEach(key => {
      delete target[key];
    });

  Object.assign(
    target,
    copied
  );

  /*
   * 今画面に表示しているSourceへ
   * 貼り付けた場合はtracksも更新する。
   */
  const isCurrentSource =
    (
      type === "pattern" &&
      state.selectedSourceType ===
        "pattern" &&
      state.selectedPatternIndex ===
        sourceIndex
    ) ||
    (
      type === "fill" &&
      state.selectedSourceType ===
        "fill" &&
      state.selectedFillIndex ===
        sourceIndex
    );

  if (isCurrentSource) {
    loadSourceTracks(
      type,
      sourceIndex
    );
  }

  return true;
}

export function clearSource(
  type,
  sourceIndex
) {
  const source =
    type === "fill"
      ? fills[sourceIndex]
      : patterns[sourceIndex];

  if (!source) {
    return false;
  }

  saveHistory();

  const cleared =
    makePatternData();

  Object.keys(source)
    .forEach(key => {
      delete source[key];
    });

  Object.assign(
    source,
    cleared
  );

  /*
   * 現在表示中なら、
   * 初期化後の内容を即反映。
   */
  const isCurrentSource =
    (
      type === "pattern" &&
      state.selectedSourceType ===
        "pattern" &&
      state.selectedPatternIndex ===
        sourceIndex
    ) ||
    (
      type === "fill" &&
      state.selectedSourceType ===
        "fill" &&
      state.selectedFillIndex ===
        sourceIndex
    );

  if (isCurrentSource) {
    loadSourceTracks(
      type,
      sourceIndex
    );
  }

  return true;
}



/* =========================
 * Song editing
 * ========================= */
export function addSourceToSong(
  type,
  sourceIndex,
  insertIndex = null
) {
  if (song.sequence.length >= SONG_PART_COUNT) {
    return false;
  }

  const valid =
    (type === "pattern" && sourceIndex >= 0 && sourceIndex < patterns.length) ||
    (type === "fill" && sourceIndex >= 0 && sourceIndex < fills.length) ||
    (type === "section" && sourceIndex >= 0 && sourceIndex < sections.length);

  if (!valid) {
    return false;
  }

  const source = {
    type,
    index: sourceIndex
  };

  if (insertIndex === null) {
    song.sequence.push(source);
    return true;
  }

  const correctedIndex = Math.max(
    0,
    Math.min(
      Math.round(insertIndex),
      song.sequence.length
    )
  );

  song.sequence.splice(
    correctedIndex,
    0,
    source
  );

  return true;
}

export function moveSongSource(
  fromIndex,
  toIndex
) {
  if (
    fromIndex < 0 ||
    fromIndex >= song.sequence.length ||
    toIndex < 0 ||
    toIndex >= song.sequence.length ||
    fromIndex === toIndex
  ) {
    return false;
  }

  const [source] = song.sequence.splice(
    fromIndex,
    1
  );

  song.sequence.splice(
    toIndex,
    0,
    source
  );

  return true;
}

export function removeSongSource(itemIndex) {
  if (
    itemIndex < 0 ||
    itemIndex >= song.sequence.length
  ) {
    return false;
  }

  song.sequence.splice(itemIndex, 1);
  return true;
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

const HISTORY_LIMIT = 10;

const undoStack = [];
const redoStack = [];

/*
 * Project保存用Snapshot。
 *
 * UI選択状態・再生状態・Undo / Redo履歴はProjectへ保存しない。
 * 作品そのものだけを保持する。
 */
export function createProjectSnapshot() {
  return structuredClone({
    patterns,
    fills,
    sections,
    song
  });
}

/*
 * New Project用の完全な空Project。
 *
 * Pattern / Fill / Section / Songは空。
 * TrackはmakeTrack()の基本Soundだけを持つ。
 * 4Trackの具体的な初期Soundは後からここへ設定できる。
 */
export function createNewProjectSnapshot() {
  return structuredClone({
    patterns: Array.from(
      { length: PATTERN_SLOT_COUNT },
      () => makePatternData()
    ),

    fills: Array.from(
      { length: FILL_SLOT_COUNT },
      () => makePatternData()
    ),

    sections: Array.from(
      { length: SECTION_SLOT_COUNT },
      () => makeSectionData()
    ),

    song: makeSongData()
  });
}

/*
 * Projectを開く時はRuntime Stateを初期化する。
 * Project間でUndo / Redoは持ち越さない。
 * Clipboardは意図的に初期化しない。
 */
export function restoreProjectSnapshot(
  projectSnapshot
) {
  if (!projectSnapshot) {
    return false;
  }

  const snapshot = {
    ...structuredClone(
      projectSnapshot
    ),
    state:
      makeDefaultRuntimeState()
  };

  restoreSnapshot(
    snapshot
  );

  clearHistory();

  return true;
}

export function createSnapshot() {
  return structuredClone({
    patterns,
    fills,
    sections,
    song,
    state
  });
}


function normalizeTrackData(track) {
  if (!track || typeof track !== "object") {
    return;
  }

  track.base ??= {};
  track.offsets ??= {};

  const chordDefaults = { chord: 0, voices: 4, inversion: 0 };
  Object.entries(chordDefaults).forEach(([id, defaultValue]) => {
    if (typeof track.base[id] !== "number") {
      track.base[id] = defaultValue;
    }
    if (!Array.isArray(track.offsets[id])) {
      track.offsets[id] = filled(0);
    }
  });
  track.base.chord = clamp(Math.round(track.base.chord), 0, CHORD_NAMES.length - 1);
  track.base.voices = clamp(Math.round(track.base.voices), 1, 4);
  track.base.inversion = clamp(Math.round(track.base.inversion), 0, 3);

  const subDefaults = {
    subPattern: -1,
    subCrescendo: 0,
    subProbability: 100
  };

  Object.entries(subDefaults).forEach(([id, defaultValue]) => {
    if (typeof track.base[id] !== "number") {
      track.base[id] = defaultValue;
    }

    if (!Array.isArray(track.offsets[id])) {
      track.offsets[id] = filled(0);
    }
  });

  track.base.subPattern = clamp(Math.round(track.base.subPattern), -1, 6);
  track.base.subCrescendo = clamp(Math.round(track.base.subCrescendo), -3, 3);
  track.base.subProbability = clamp(Math.round(track.base.subProbability), 0, 100);

  const articulationDefaults = {
    glide: 0,
    nudge: 0,
    strum: 0
  };

  Object.entries(articulationDefaults).forEach(([id, defaultValue]) => {
    if (typeof track.base[id] !== "number") {
      track.base[id] = defaultValue;
    }

    if (!Array.isArray(track.offsets[id])) {
      track.offsets[id] = filled(0);
    }
  });

  track.base.glide = clamp(
  Math.round(track.base.glide),
  0,
  8
);

track.base.nudge = clamp(
  Math.round(track.base.nudge),
  -4,
  4
);

track.base.strum = clamp(
  Math.round(track.base.strum),
  -8,
  8
);

  if (!["glide", "nudge", "strum"].includes(track.articulationSelectedId)) {
    track.articulationSelectedId = "glide";
  }

  track.pinEnabled =
    Boolean(track.pinEnabled);

  if (!Array.isArray(track.pins)) {
    track.pins = filled(null);
  } else {
    track.pins = Array.from(
      { length: STEP_COUNT },
      (_, index) => {
        const value = track.pins[index];
        return value === "a" || value === "b" || value === "c"
          ? value
          : null;
      }
    );
  }

  track.pinSounds ??= {};

  ["a", "b", "c"].forEach(slot => {
    const source = track.pinSounds[slot];
    const normalized = normalizeSound(source);

    track.pinSounds[slot] = {
      ...normalized,
      soundName:
        typeof source?.soundName === "string" && source.soundName.trim()
          ? source.soundName
          : `pin ${slot}`
    };
  });

  /*
 * FM Feedback実装前の保存データへ
 * 初期値0を補う。
 */
if (
  typeof track.base.fmFeedback !==
    "number"
) {
  track.base.fmFeedback = 0;
}

track.base.fmFeedback =
  clamp(
    Math.round(
      track.base.fmFeedback
    ),
    0,
    100
  );

  if (
  !Array.isArray(
    track.offsets.fmRatio
  )
) {
  track.offsets.fmRatio =
    filled(0);
}

if (
  !Array.isArray(
    track.offsets.fmFeedback
  )
) {
  track.offsets.fmFeedback =
    filled(0);
}

  if (typeof track.soundName !== "string" || !track.soundName.trim()) {
    track.soundName = `sound ${String(track.id ?? 1).padStart(2, "0")}`;
  }

  /*
   * 旧tone（0〜100、50=OFF）を
   * 新Filter Cutoff（-100〜100、0=OFF）へ移行する。
   */
  if (
    typeof track.base.filterCutoff !==
      "number"
  ) {
    const legacyTone =
      typeof track.base.tone === "number"
        ? track.base.tone
        : 50;

    track.base.filterCutoff =
      clamp(
        Math.round(
          (legacyTone - 50) * 2
        ),
        -100,
        100
      );
  }

  if (
    typeof track.base.filterResonance !==
      "number"
  ) {
    track.base.filterResonance = 0;
  }

  if (
    !Array.isArray(
      track.offsets.filterCutoff
    )
  ) {
    const legacyOffsets =
      Array.isArray(track.offsets.tone)
        ? track.offsets.tone
        : filled(0);

    track.offsets.filterCutoff =
      legacyOffsets.map(value =>
        clamp(
          Math.round(
            Number(value || 0) * 2
          ),
          -200,
          200
        )
      );
  }

  if (
    !Array.isArray(
      track.offsets.filterResonance
    )
  ) {
    track.offsets.filterResonance =
      filled(0);
  }

  if (!["attack", "holdDecay"].includes(track.envelopeSelectedId)) {
    track.envelopeSelectedId = "holdDecay";
  }

  /*
   * ADSG廃止後のH/D。
   * 旧データは互換変換せず中央0から開始する。
   */
  if (typeof track.base.holdDecay !== "number") {
    track.base.holdDecay = 0;
  }

  track.base.holdDecay = clamp(
    Math.round(track.base.holdDecay),
    -50,
    50
  );

  if (!Array.isArray(track.offsets.holdDecay)) {
    track.offsets.holdDecay = filled(0);
  }


  /*
   * 旧OSCデータを新しい音源別パラメーターへ移行する。
   * 旧キーは削除せず、既存保存データの復元だけに利用する。
   */
  if (
    typeof track.base.sineVolume !==
      "number"
  ) {
    track.base.sineVolume =
      typeof track.base.sine ===
        "number"
        ? track.base.sine
        : 100;
  }


  ["sineVolume"].forEach(parameterId => {
    if (
      !Array.isArray(
        track.offsets[parameterId]
      )
    ) {
      track.offsets[parameterId] =
        filled(0);
    }
  });

  /*
   * 旧保存データへLFO初期値を補う。
   */
  if (
    track.lfoSelected !== 1 &&
    track.lfoSelected !== 2
  ) {
    track.lfoSelected = 1;
  }

  const lfoDefaults = {
    lfo1Target: "pitch",
    lfo1Wave: "sine",
    lfo1Depth: 0,
    lfo1Rate: 25,
    lfo1SyncMode: "free",
    lfo2Target: "pitch",
    lfo2Wave: "sine",
    lfo2Depth: 0,
    lfo2Rate: 25,
    lfo2SyncMode: "free"
  };

  Object.entries(
    lfoDefaults
  ).forEach(
    ([parameterId, defaultValue]) => {
      if (
        typeof track.base[parameterId] !==
          typeof defaultValue
      ) {
        track.base[parameterId] =
          defaultValue;
      }
    }
  );

  ["lfo1SyncMode", "lfo2SyncMode"].forEach(
    parameterId => {
      if (
        track.base[parameterId] !== "bpm" &&
        track.base[parameterId] !== "free"
      ) {
        track.base[parameterId] = "free";
      }
    }
  );

[1, 2].forEach(
  lfoNumber => {
    const syncModeId =
      `lfo${lfoNumber}SyncMode`;

    const rateId =
      `lfo${lfoNumber}Rate`;

    if (
      track.base[syncModeId] ===
      "bpm"
    ) {
      track.base[rateId] =
        clamp(
          Math.round(
            Number(
              track.base[rateId]
            ) || 0
          ),
          0,
          13
        );

      return;
    }

    track.base[rateId] =
      clamp(
        Number(
          track.base[rateId]
        ) || 25,
        1,
        100
      );
  }
);

  /*
   * OFF廃止後の旧保存データ補正。
   * Depth=0で停止するためTargetはPitchへ戻す。
   */
  ["lfo1Target", "lfo2Target"].forEach(
    parameterId => {
      const target =
        track.base[parameterId];

      if (target === "off") {
        track.base[parameterId] =
          "pitch";
        return;
      }

      /*
       * 旧GateターゲットはAttackへ移行。
       * OSC個別Decayターゲットは共通ENV Decayへ統合。
       */
      if (target === "gate" || target === "decay") {
        track.base[parameterId] =
          "attack";
        return;
      }

    }
  );

  [
    "lfo1Depth",
    "lfo1Rate",
    "lfo2Depth",
    "lfo2Rate"
  ].forEach(parameterId => {
    if (
      !Array.isArray(
        track.offsets[parameterId]
      )
    ) {
      track.offsets[parameterId] =
        filled(0);
    }
  });

  /* Step 1: deleted sound fields are stripped from restored legacy projects. */
  const normalizedSound = normalizeSound(track);
  track.base = normalizedSound.base;
  track.offsets = normalizedSound.offsets;
  track.envelopeSelectedId = normalizedSound.envelopeSelectedId;
  track.articulationSelectedId = normalizedSound.articulationSelectedId;
  track.lfoSelected = normalizedSound.lfoSelected;

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

  /*
   * 旧FILTER画面を開いたまま保存されていた場合、
   * state側には selectedParameterId = "tone" が残る。
   * 新コードではtoneが存在しないため、描画時の例外を防いで
   * 新しいfilterCutoffへ移行する。
   */
  snapshot.state ??= {};

  if (!snapshot.song || !Array.isArray(snapshot.song.sequence)) {
    snapshot.song = { sequence: [] };
  }

  const masterMix =
    snapshot.song.masterMix &&
    typeof snapshot.song.masterMix === "object"
      ? snapshot.song.masterMix
      : {};

  const eqValues =
    Array.isArray(masterMix.eq)
      ? masterMix.eq
      : [];

  snapshot.song.masterMix = {
    eq: Array.from(
      { length: 8 },
      (_, index) =>
        clamp(
          Number(eqValues[index]) || 0,
          -12,
          12
        )
    ),
    volume: clamp(
      Number.isFinite(Number(masterMix.volume))
        ? Number(masterMix.volume)
        : 100,
      0,
      100
    ),
    limiter: clamp(
      Number.isFinite(Number(masterMix.limiter))
        ? Number(masterMix.limiter)
        : -1,
      -24,
      0
    ),
    reverb: clamp(
      Number(masterMix.reverb) || 0,
      0,
      100
    )
  };

  snapshot.song.sequence = snapshot.song.sequence
    .filter(item => {
      if (!item || typeof item !== "object") return false;
      const index = Number(item.index);
      if (!Number.isInteger(index)) return false;
      if (item.type === "pattern") return index >= 0 && index < PATTERN_SLOT_COUNT;
      if (item.type === "fill") return index >= 0 && index < FILL_SLOT_COUNT;
      if (item.type === "section") return index >= 0 && index < SECTION_SLOT_COUNT;
      return false;
    })
    .slice(0, SONG_PART_COUNT);

  snapshot.state.songMode = Boolean(snapshot.state.songMode);
  snapshot.state.songPage = clamp(Math.round(Number(snapshot.state.songPage) || 0), 0, 1);
  snapshot.state.selectedSongPartIndex = clamp(
    Math.round(Number(snapshot.state.selectedSongPartIndex) || 0),
    0,
    Math.max(0, snapshot.song.sequence.length - 1)
  );
  snapshot.state.playingSongPartIndex = null;
  snapshot.state.queuedSongPartIndex = null;

  if (
    snapshot.state.selectedParameterId ===
      "tone"
  ) {
    snapshot.state.selectedParameterId =
      "filterCutoff";
  }

  if (
    snapshot.state.selectedChildId ===
      "tone"
  ) {
    snapshot.state.selectedChildId =
      "filterCutoff";
  }

  const deletedStep1Parameters = new Set([
    "noiseVolume", "noiseDecay",
    "delay", "delayTime", "delayFeedback",
    "crush", "crushLevel", "crushBit", "crushRate",
    "reverb", "reverbSend", "reverbSize",
    "fx", "fx4", "fx5"
  ]);

  if (deletedStep1Parameters.has(snapshot.state.selectedParameterId)) {
    snapshot.state.selectedParameterId = null;
  }

  if (deletedStep1Parameters.has(snapshot.state.selectedChildId)) {
    snapshot.state.selectedChildId = null;
  }

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

  song.sequence.splice(
    0,
    song.sequence.length,
    ...structuredClone(
      snapshot.song?.sequence ?? []
    )
  );

  song.masterMix = structuredClone(
    snapshot.song?.masterMix ?? {
      eq: Array(8).fill(0),
      volume: 100,
      limiter: -1,
      reverb: 0
    }
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

function trimHistoryStack(stack) {
  if (stack.length > HISTORY_LIMIT) {
    stack.splice(
      0,
      stack.length - HISTORY_LIMIT
    );
  }
}

function selectedSourceIdentity() {
  if (state.selectedSourceType === "fill") {
    return {
      sourceType: "fill",
      sourceIndex: state.selectedFillIndex ?? 0
    };
  }

  return {
    sourceType: "pattern",
    sourceIndex: state.selectedPatternIndex ?? 0
  };
}

function pushUndoEntry(entry) {
  if (!entry) {
    return false;
  }

  undoStack.push(entry);
  trimHistoryStack(undoStack);
  redoStack.length = 0;

  window.dispatchEvent(
    new Event("historychange")
  );

  return true;
}

export function saveHistorySnapshot(snapshot) {
  if (!snapshot) {
    return false;
  }

  return pushUndoEntry({
    kind: "full",
    snapshot: structuredClone(snapshot)
  });
}

export function saveHistory() {
  return pushUndoEntry({
    kind: "full",
    snapshot: createSnapshot()
  });
}

/*
 * 頻繁なTrack編集用の軽量履歴。
 * Pattern / Fill全体ではなく、変更対象Trackだけを保存する。
 */
export function saveTrackHistory(
  trackIndex = state.selectedTrackIndex
) {
  const { sourceType, sourceIndex } =
    selectedSourceIdentity();

  const source = sourceData(
    sourceType,
    sourceIndex
  );

  const track =
    source?.tracks?.[trackIndex];

  if (!track) {
    return false;
  }

  return pushUndoEntry({
    kind: "track",
    sourceType,
    sourceIndex,
    trackIndex,
    snapshot: structuredClone(track)
  });
}

/*
 * Mixer操作用の軽量履歴。
 */
export function saveMasterMixHistory() {
  return pushUndoEntry({
    kind: "masterMix",
    snapshot: structuredClone(
      song.masterMix
    )
  });
}

function capturePerformanceFlags() {
  return {
    patterns: patterns.map(source =>
      source.tracks.map(track => ({
        muted: Boolean(track.muted),
        solo: Boolean(track.solo)
      }))
    ),

    fills: fills.map(source =>
      source.tracks.map(track => ({
        muted: Boolean(track.muted),
        solo: Boolean(track.solo)
      }))
    )
  };
}

function restorePerformanceFlags(flags) {
  if (!flags) {
    return;
  }

  [
    [patterns, flags.patterns],
    [fills, flags.fills]
  ].forEach(([sources, savedSources]) => {
    sources.forEach((source, sourceIndex) => {
      source.tracks.forEach((track, trackIndex) => {
        const saved =
          savedSources?.[sourceIndex]?.[trackIndex];

        if (!saved) {
          return;
        }

        track.muted = saved.muted;
        track.solo = saved.solo;
      });
    });
  });

  /*
   * restoreSnapshot()後はtracksが選択中Sourceを参照している。
   * フラグ再適用後も参照関係はそのままなので再読込は不要。
   */
}

function restoreHistorySnapshot(snapshot) {
  /*
   * Mute / Soloは演奏用の一時状態であり、
   * Undo / Redoの対象にしない。
   */
  const performanceFlags =
    capturePerformanceFlags();

  restoreSnapshot(snapshot);

  restorePerformanceFlags(
    performanceFlags
  );
}

function currentEntryFor(entry) {
  if (!entry) {
    return null;
  }

  if (entry.kind === "track") {
    const source = sourceData(
      entry.sourceType,
      entry.sourceIndex
    );

    const track =
      source?.tracks?.[entry.trackIndex];

    if (!track) {
      return null;
    }

    return {
      ...entry,
      snapshot: structuredClone(track)
    };
  }

  if (entry.kind === "masterMix") {
    return {
      kind: "masterMix",
      snapshot: structuredClone(
        song.masterMix
      )
    };
  }

  return {
    kind: "full",
    snapshot: createSnapshot()
  };
}

function restoreHistoryEntry(entry) {
  if (!entry) {
    return false;
  }

  if (entry.kind === "track") {
    const source = sourceData(
      entry.sourceType,
      entry.sourceIndex
    );

    if (!source?.tracks?.[entry.trackIndex]) {
      return false;
    }

    const restoredTrack =
      structuredClone(entry.snapshot);

    normalizeTrackData(restoredTrack);

    source.tracks[entry.trackIndex] =
      restoredTrack;

    const selectedIdentity =
      selectedSourceIdentity();

    if (
      selectedIdentity.sourceType ===
        entry.sourceType &&
      selectedIdentity.sourceIndex ===
        entry.sourceIndex
    ) {
      tracks[entry.trackIndex] =
        restoredTrack;

      syncPatternLength();
    }

    return true;
  }

  if (entry.kind === "masterMix") {
    song.masterMix = structuredClone(
      entry.snapshot
    );

    return true;
  }

  restoreHistorySnapshot(
    entry.snapshot
  );

  return true;
}

export function undo() {
  if (undoStack.length === 0) {
    return false;
  }

  const entry = undoStack.pop();
  const inverseEntry =
    currentEntryFor(entry);

  if (!inverseEntry) {
    return false;
  }

  redoStack.push(inverseEntry);
  trimHistoryStack(redoStack);

  if (!restoreHistoryEntry(entry)) {
    redoStack.pop();
    return false;
  }

  window.dispatchEvent(
    new Event("historychange")
  );

  return true;
}

export function redo() {
  if (redoStack.length === 0) {
    return false;
  }

  const entry = redoStack.pop();
  const inverseEntry =
    currentEntryFor(entry);

  if (!inverseEntry) {
    return false;
  }

  undoStack.push(inverseEntry);
  trimHistoryStack(undoStack);

  if (!restoreHistoryEntry(entry)) {
    undoStack.pop();
    return false;
  }

  window.dispatchEvent(
    new Event("historychange")
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

/*
 * Project切替時などに編集履歴だけを破棄する。
 * Clipboardは別管理なので触らない。
 */
export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;

  window.dispatchEvent(
    new Event("historychange")
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

  const hasPin =
    track.pins?.some(Boolean);

  if (!hasActiveStep && !hasPin) {
    return false;
  }

  saveTrackHistory();
  track.steps.fill(false);

  if (Array.isArray(track.pins)) {
    track.pins.fill(null);
  }

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

  saveTrackHistory();
  offsets.fill(0);

  return true;
}

