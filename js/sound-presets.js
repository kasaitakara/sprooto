import {
  createDefaultSound
} from "./sound-defaults.js";

function sound(
  base = {},
  options = {}
) {
  const result = createDefaultSound();
  Object.assign(result.base, base);
  Object.assign(result, options);
  return result;
}

export const FACTORY_SOUND_PRESETS = [
  {
    id: "factory-initialize-tone",
    category: "other",
    name: "initialize tone",
    sound: sound({
      note: 12,
      sineVolume: 100,
      attack: 1,
      holdDecay: 0,
      fmDepth: 0,
      fmRatio: 1,
      fmFeedback: 0,
      filterCutoff: 0,
      lfo1Target: "pitch",
      lfo1Wave: "sine",
      lfo1Depth: 0,
      lfo1Rate: 65,
      lfo2Target: "fmDepth",
      lfo2Wave: "sine",
      lfo2Depth: 0,
      lfo2Rate: 65
    })
  }
];
