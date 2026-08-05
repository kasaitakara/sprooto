import { createDefaultSound } from "./sound-defaults.js";

function sound(base = {}, options = {}) {
  const result = createDefaultSound();
  Object.assign(result.base, base);
  Object.assign(result, options);
  return result;
}

export const FACTORY_SOUND_PRESETS = [
  {
    id: "factory-kick-01",
    category: "kick",
    name: "Kick 01",
    sound: sound({
      note: -12, sineVolume: 100, noiseVolume: 4,
      attack: 1, decay: 18, sustain: 0, gate: 10,
      fmDepth: 2, fmRatio: 1, filterCutoff: -8,
      lfo1Target: "pitch", lfo1Wave: "fall", lfo1Depth: 42, lfo1Rate: 65
    })
  },
  {
    id: "factory-kick-02",
    category: "kick",
    name: "Kick 02",
    sound: sound({
      note: -18, sineVolume: 100, noiseVolume: 0,
      attack: 1, decay: 28, sustain: 0, gate: 14,
      fmDepth: 1, filterCutoff: -18,
      lfo1Target: "pitch", lfo1Wave: "fall", lfo1Depth: 58, lfo1Rate: 78
    })
  },
  {
    id: "factory-snare-01",
    category: "snare",
    name: "Snare 01",
    sound: sound({
      note: 0, sineVolume: 30, noiseVolume: 88,
      noiseDecay: 12, attack: 1, decay: 13, sustain: 0, gate: 8,
      filterCutoff: 18, filterResonance: 8
    })
  },
  {
    id: "factory-hh-01",
    category: "hh",
    name: "HH Closed",
    sound: sound({
      sineVolume: 0, noiseVolume: 76, noiseDecay: 2,
      attack: 1, decay: 3, sustain: 0, gate: 2,
      filterCutoff: 72, filterResonance: 12
    }, { oscSelectedId: "noiseVolume" })
  },
  {
    id: "factory-hh-02",
    category: "hh",
    name: "HH Open",
    sound: sound({
      sineVolume: 0, noiseVolume: 68, noiseDecay: 18,
      attack: 1, decay: 22, sustain: 18, gate: 24,
      filterCutoff: 60, filterResonance: 8
    }, { oscSelectedId: "noiseVolume" })
  },
  {
    id: "factory-cymbal-01",
    category: "cymbal",
    name: "Cymbal 01",
    sound: sound({
      sineVolume: 0, noiseVolume: 72, noiseDecay: 38,
      attack: 1, decay: 44, sustain: 20, gate: 38,
      filterCutoff: 48, filterResonance: 16,
      delay: 12, delayTime: 3, delayFeedback: 22
    }, { oscSelectedId: "noiseVolume" })
  },
  {
    id: "factory-perc-01",
    category: "perc",
    name: "Perc 01",
    sound: sound({
      note: 7, sineVolume: 72, noiseVolume: 20,
      attack: 1, decay: 8, sustain: 0, gate: 5,
      fmDepth: 8, fmRatio: 2.5, filterCutoff: 12
    })
  },
  {
    id: "factory-bass-01",
    category: "bass",
    name: "Bass 01",
    sound: sound({
      note: -12, sineVolume: 100, noiseVolume: 0,
      attack: 3, decay: 20, sustain: 72, gate: 38,
      fmDepth: 4, fmRatio: 1, filterCutoff: -26, filterResonance: 20
    })
  },
  {
    id: "factory-lead-01",
    category: "lead",
    name: "Lead 01",
    sound: sound({
      sineVolume: 92, noiseVolume: 3,
      attack: 2, decay: 12, sustain: 74, gate: 46,
      fmDepth: 6, fmRatio: 2, filterCutoff: -8,
      delay: 20, delayTime: 5, delayFeedback: 36,
      lfo1Target: "pitch", lfo1Wave: "sine", lfo1Depth: 2, lfo1Rate: 48
    })
  },
  {
    id: "factory-pad-01",
    category: "pad",
    name: "Pad 01",
    sound: sound({
      sineVolume: 80, noiseVolume: 8,
      attack: 36, decay: 48, sustain: 82, gate: 78,
      fmDepth: 3, fmRatio: 1.5, filterCutoff: -38, filterResonance: 14,
      delay: 34, delayTime: 8, delayFeedback: 48,
      lfo1Target: "pan", lfo1Wave: "sine", lfo1Depth: 32, lfo1Rate: 10
    })
  },
  {
    id: "factory-fx-01",
    category: "fx",
    name: "FX Rise",
    sound: sound({
      sineVolume: 35, noiseVolume: 54,
      attack: 18, decay: 50, sustain: 70, gate: 60,
      filterCutoff: 32, filterResonance: 28,
      delay: 38, delayTime: 7, delayFeedback: 52,
      lfo1Target: "pitch", lfo1Wave: "rise", lfo1Depth: 70, lfo1Rate: 18
    })
  }
];
