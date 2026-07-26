export const STEP_COUNT = 64;
export const PAGE_STEP_COUNT = 32;
export const TRACK_COUNT = 4;

const filled = (value) => Array(STEP_COUNT).fill(value);

function makeTrack(id) {
  return {
    id,
    stepLength: 32,
    steps: filled(false),
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
      note: filled(0),
      velocity: filled(0),
      decay: filled(0),
      fmDepth: filled(0),
      tone: filled(0),
      pan: filled(0),
      probability: filled(0)
    }
  };
}

export const tracks = Array.from({ length: TRACK_COUNT }, (_, index) => makeTrack(index + 1));

// Track 1：1、9、17、25ステップ
[0, 8, 16, 24].forEach(i => {
  tracks[0].steps[i] = true;
});

// Track 2：5、13、21、29ステップ
[4, 12, 20, 28].forEach(i => {
  tracks[1].steps[i] = true;
});

tracks[1].base.note = 11;

// Track 3：ステップ配置と音色は今のまま
[4, 12, 20, 28].forEach(i => {
  tracks[2].steps[i] = true;
});

tracks[2].base.noise = 70;
tracks[2].base.sine = 0;
tracks[2].base.decay = 1;

// Track 4：ステップ配置と音色は今のまま
[0, 6, 8, 14, 16, 22, 24, 30].forEach(i => {
  tracks[3].steps[i] = true;
});

tracks[3].base.noise = 45;
tracks[3].base.sine = 0;
tracks[3].base.decay = 1;

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
  selectedPatternIndex: 0,
  selectedSectionIndex: 0
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getMaxTrackLength() {
  return Math.max(
    ...tracks.map(track => track.stepLength)
  );
}

export function syncPatternLength() {
  state.patternLength = getMaxTrackLength();

  if (
    state.patternLength <= PAGE_STEP_COUNT &&
    state.sequencePage === 1
  ) {
    state.sequencePage = 0;
  }
}

export function selectedTrack() {
  return tracks[state.selectedTrackIndex];
}

export function parameterById(id) {
  return parameters.find(parameter => parameter.id === id);
}
