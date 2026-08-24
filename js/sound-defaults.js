export const SOUND_BASE_DEFAULTS = Object.freeze({
  note: 0,
  chord: 0,
  voices: 4,
  inversion: 0,
  sineVolume: 100,
  sineDecay: 5,
  velocity: 70,
  attack: 1,
  decay: 5,
  sustain: 0,
  gate: 5,
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
});

export const SOUND_OFFSET_IDS = Object.freeze([
  "note", "chord", "voices", "inversion", "velocity",
  "attack", "decay", "sustain", "gate",
  "sineVolume", "sineDecay",
  "fmDepth", "fmRatio", "fmFeedback",
  "filterCutoff", "filterResonance", "pan",
  "probability",
  "subPattern", "subCrescendo", "subProbability",
  "glide", "nudge", "strum",
  "lfo1Depth", "lfo1Rate", "lfo2Depth", "lfo2Rate"
]);

const STEP_COUNT = 64;

function zeroOffsets() {
  return Object.fromEntries(
    SOUND_OFFSET_IDS.map(id => [id, Array(STEP_COUNT).fill(0)])
  );
}

export function createDefaultSound() {
  return {
    base: structuredClone(SOUND_BASE_DEFAULTS),
    offsets: zeroOffsets(),
    envelopeSelectedId: "decay",
    oscSelectedId: "sineVolume",
    articulationSelectedId: "glide",
    lfoSelected: 1
  };
}

export function normalizeSound(sound) {
  const source = sound && typeof sound === "object" ? sound : {};
  const normalized = createDefaultSound();

  if (source.base && typeof source.base === "object") {
    Object.keys(SOUND_BASE_DEFAULTS).forEach(id => {
      if (!(id in source.base)) return;
      normalized.base[id] = structuredClone(source.base[id]);
    });
  }

  if (source.offsets && typeof source.offsets === "object") {
    SOUND_OFFSET_IDS.forEach(id => {
      const values = source.offsets[id];
      if (!Array.isArray(values)) return;
      normalized.offsets[id] = Array.from(
        { length: STEP_COUNT },
        (_, index) => Number(values[index]) || 0
      );
    });
  }

  if (["attack", "decay", "sustain", "gate"].includes(source.envelopeSelectedId)) {
    normalized.envelopeSelectedId = source.envelopeSelectedId;
  }

  if (["sineVolume", "sineDecay"].includes(source.oscSelectedId)) {
    normalized.oscSelectedId = source.oscSelectedId;
  }

  if (["glide", "nudge", "strum"].includes(source.articulationSelectedId)) {
    normalized.articulationSelectedId = source.articulationSelectedId;
  }

  normalized.lfoSelected = source.lfoSelected === 2 ? 2 : 1;

  return normalized;
}
