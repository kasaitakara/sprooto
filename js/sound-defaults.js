export const SOUND_BASE_DEFAULTS = Object.freeze({
  note: 0,
  sineVolume: 100,
  sineDecay: 5,
  noiseVolume: 0,
  noiseDecay: 5,
  velocity: 70,
  attack: 1,
  decay: 5,
  sustain: 0,
  gate: 5,
  fmDepth: 0,
  fmRatio: 1,
  filterCutoff: 0,
  filterResonance: 0,
  pan: 50,
  delay: 0,
  delayTime: 4,
  delayFeedback: 35,
  probability: 100,
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
  "note", "velocity", "attack", "decay", "sustain", "gate",
  "sineVolume", "sineDecay", "noiseVolume", "noiseDecay",
  "fmDepth", "filterCutoff", "filterResonance", "pan",
  "delay", "delayTime", "delayFeedback", "probability",
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
    fxMuted: false,
    envelopeSelectedId: "decay",
    oscSelectedId: "sineVolume",
    lfoSelected: 1
  };
}

export function normalizeSound(sound) {
  const source = sound && typeof sound === "object" ? sound : {};
  const normalized = createDefaultSound();

  if (source.base && typeof source.base === "object") {
    Object.assign(normalized.base, structuredClone(source.base));
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

  normalized.fxMuted = Boolean(source.fxMuted);

  if (["attack", "decay", "sustain", "gate"].includes(source.envelopeSelectedId)) {
    normalized.envelopeSelectedId = source.envelopeSelectedId;
  }

  if (["sineVolume", "sineDecay", "noiseVolume", "noiseDecay"].includes(source.oscSelectedId)) {
    normalized.oscSelectedId = source.oscSelectedId;
  }

  normalized.lfoSelected = source.lfoSelected === 2 ? 2 : 1;

  return normalized;
}
