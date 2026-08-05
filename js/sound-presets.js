import {
  createDefaultSound
} from "./sound-defaults.js";


/*
 * ========================================================
 * Factory Sound Preset 編集用・完全ひな形
 * ========================================================
 *
 * 新しいFactoryプリセットを追加するときは、
 * このブロックをコピーして
 * FACTORY_SOUND_PRESETS内へ貼り付ける。
 *
 * createDefaultSound()を基準にするため、
 * デフォルト値と同じ項目は削除してもよい。
 *
 * 実際には「変更したい項目だけ」を残せばOK。
 *
 *
 * {
 *   id: "factory-category-01",
 *   category: "other",
 *   name: "Preset Name",
 *
 *   sound: sound({
 *
 *     // ====================
 *     // NOTE / LEVEL / PAN
 *     // ====================
 *
 *     note: 0,
 *     velocity: 100,
 *     pan: 50,
 *
 *
 *     // ====================
 *     // OSC
 *     // ====================
 *
 *     sineVolume: 100,
 *     sineDecay: 5,
 *
 *     noiseVolume: 0,
 *     noiseDecay: 5,
 *
 *
 *     // ====================
 *     // ENVELOPE
 *     // ====================
 *
 *     attack: 1,
 *     decay: 5,
 *     sustain: 0,
 *     gate: 5,
 *
 *
 *     // ====================
 *     // FM
 *     // ====================
 *
 *     fmDepth: 0,
 *     fmRatio: 1,
 *
 *
 *     // ====================
 *     // FILTER
 *     // ====================
 *
 *     filterCutoff: 0,
 *     filterResonance: 0,
 *
 *
 *     // ====================
 *     // LFO 1
 *     // ====================
 *
 *     // Target:
 *     // "pitch"
 *     // "fmDepth"
 *     // "filterCutoff"
 *     // "pan"
 *     // "attack"
 *     // "decay"
 *
 *     lfo1Target: "pitch",
 *
 *     // Wave:
 *     // "sine"
 *     // "triangle"
 *     // "sawUp"
 *     // "sawDown"
 *     // "square"
 *     // "random"
 *     // "rise"
 *     // "fall"
 *
 *     lfo1Wave: "sine",
 *     lfo1Depth: 0,
 *     lfo1Rate: 25,
 *
 *     // "free" または "bpm"
 *     lfo1SyncMode: "free",
 *
 *
 *     // ====================
 *     // LFO 2
 *     // ====================
 *
 *     lfo2Target: "pitch",
 *     lfo2Wave: "sine",
 *     lfo2Depth: 0,
 *     lfo2Rate: 25,
 *     lfo2SyncMode: "free",
 *
 *
 *     // ====================
 *     // FX1：Delay
 *     // ====================
 *
 *     // 現在はFX1がDelay固定。
 *
 *     delay: 0,
 *
 *     // Delay Time:
 *     // 0 = 1/64
 *     // 1 = 1/32T
 *     // 2 = 1/32
 *     // 3 = 1/16T
 *     // 4 = 1/16
 *     // 5 = 1/8T
 *     // 6 = 1/8
 *     // 7 = 1/4T
 *     // 8 = 1/4
 *     // 9 = 1/2T
 *     // 10 = 1/2
 *
 *     delayTime: 4,
 *     delayFeedback: 35,
 *
 *
 *     // ====================
 *     // 発音条件
 *     // ====================
 *
 *     probability: 100
 *
 *
 *     // ====================
 *     // 将来：FX Rack
 *     // ====================
 *
 *     // FX選択式を実装した時点で正式追加する。
 *     // プリセットにはFX1〜5をラックごと保存する。
 *
 *     // fxSlots: [
 *     //   null,
 *     //   null,
 *     //   null,
 *     //   null,
 *     //   null
 *     // ]
 *
 *   }, {
 *
 *     // ====================
 *     // UI・トラック側の付加情報
 *     // ====================
 *
 *     // OSC画面で最初に表示する項目
 *     //
 *     // "sineVolume"
 *     // "sineDecay"
 *     // "noiseVolume"
 *     // "noiseDecay"
 *
 *     oscSelectedId: "sineVolume",
 *
 *     // ENV画面で最初に表示する項目
 *     //
 *     // "attack"
 *     // "decay"
 *     // "sustain"
 *     // "gate"
 *
 *     envelopeSelectedId: "decay",
 *
 *     // 最後に選択していたLFO
 *     // 1 または 2
 *
 *     lfoSelected: 1,
 *
 *     // FXラック全体のミュート状態
 *
 *     fxMuted: false
 *   })
 * }
 *
 *
 * 使用例：
 *
 * {
 *   id: "factory-bass-02",
 *   category: "bass",
 *   name: "Bass 02",
 *
 *   sound: sound({
 *     note: -12,
 *     sineVolume: 100,
 *     attack: 2,
 *     decay: 18,
 *     sustain: 70,
 *     gate: 35,
 *     filterCutoff: -30
 *   })
 * }
 *
 * ========================================================
 */


function sound(
  base = {},
  options = {}
) {
  const result =
    createDefaultSound();

  Object.assign(
    result.base,
    base
  );

  Object.assign(
    result,
    options
  );

  return result;
}


export const FACTORY_SOUND_PRESETS = [
  {
    id: "factory-initialize",
    category: "other",
    name: "Initialize Tone",
    sound: createDefaultSound()
  },

  {
    id: "factory-kick-01",
    category: "kick",
    name: "Kick 01",

    sound: sound({
      note: -12,

      sineVolume: 100,
      noiseVolume: 4,

      attack: 1,
      decay: 18,
      sustain: 0,
      gate: 10,

      fmDepth: 2,
      fmRatio: 1,

      filterCutoff: -8,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 42,
      lfo1Rate: 65
    })
  },

  {
    id: "factory-kick-02",
    category: "kick",
    name: "Kick 02",

    sound: sound({
      note: -18,

      sineVolume: 100,
      noiseVolume: 0,

      attack: 1,
      decay: 28,
      sustain: 0,
      gate: 14,

      fmDepth: 1,

      filterCutoff: -18,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 58,
      lfo1Rate: 78
    })
  },

  {
    id: "factory-snare-01",
    category: "snare",
    name: "Snare 01",

    sound: sound({
      note: 0,

      sineVolume: 30,
      noiseVolume: 88,
      noiseDecay: 12,

      attack: 1,
      decay: 13,
      sustain: 0,
      gate: 8,

      filterCutoff: 18,
      filterResonance: 8
    })
  },

  {
    id: "factory-hh-01",
    category: "hh",
    name: "HH Closed",

    sound: sound(
      {
        sineVolume: 0,

        noiseVolume: 76,
        noiseDecay: 2,

        attack: 1,
        decay: 3,
        sustain: 0,
        gate: 2,

        filterCutoff: 72,
        filterResonance: 12
      },
      {
        oscSelectedId:
          "noiseVolume"
      }
    )
  },

  {
    id: "factory-hh-02",
    category: "hh",
    name: "HH Open",

    sound: sound(
      {
        sineVolume: 0,

        noiseVolume: 68,
        noiseDecay: 18,

        attack: 1,
        decay: 22,
        sustain: 18,
        gate: 24,

        filterCutoff: 60,
        filterResonance: 8
      },
      {
        oscSelectedId:
          "noiseVolume"
      }
    )
  },

  {
    id: "factory-cymbal-01",
    category: "cymbal",
    name: "Cymbal 01",

    sound: sound(
      {
        sineVolume: 0,

        noiseVolume: 72,
        noiseDecay: 38,

        attack: 1,
        decay: 44,
        sustain: 20,
        gate: 38,

        filterCutoff: 48,
        filterResonance: 16,

        delay: 12,
        delayTime: 3,
        delayFeedback: 22
      },
      {
        oscSelectedId:
          "noiseVolume"
      }
    )
  },

  {
    id: "factory-perc-01",
    category: "perc",
    name: "Perc 01",

    sound: sound({
      note: 7,

      sineVolume: 72,
      noiseVolume: 20,

      attack: 1,
      decay: 8,
      sustain: 0,
      gate: 5,

      fmDepth: 8,
      fmRatio: 2.5,

      filterCutoff: 12
    })
  },

  {
    id: "factory-bass-01",
    category: "bass",
    name: "Bass 01",

    sound: sound({
      note: -12,

      sineVolume: 100,
      noiseVolume: 0,

      attack: 3,
      decay: 20,
      sustain: 72,
      gate: 38,

      fmDepth: 4,
      fmRatio: 1,

      filterCutoff: -26,
      filterResonance: 20
    })
  },

  {
    id: "factory-lead-01",
    category: "lead",
    name: "Lead 01",

    sound: sound({
      sineVolume: 92,
      noiseVolume: 3,

      attack: 2,
      decay: 12,
      sustain: 74,
      gate: 46,

      fmDepth: 6,
      fmRatio: 2,

      filterCutoff: -8,

      delay: 20,
      delayTime: 5,
      delayFeedback: 36,

      lfo1Target: "pitch",
      lfo1Wave: "sine",
      lfo1Depth: 2,
      lfo1Rate: 48
    })
  },

  {
    id: "factory-pad-01",
    category: "pad",
    name: "Pad 01",

    sound: sound({
      sineVolume: 80,
      noiseVolume: 8,

      attack: 36,
      decay: 48,
      sustain: 82,
      gate: 78,

      fmDepth: 3,
      fmRatio: 1.5,

      filterCutoff: -38,
      filterResonance: 14,

      delay: 34,
      delayTime: 8,
      delayFeedback: 48,

      lfo1Target: "pan",
      lfo1Wave: "sine",
      lfo1Depth: 32,
      lfo1Rate: 10
    })
  },

  {
    id: "factory-fx-01",
    category: "fx",
    name: "FX Rise",

    sound: sound({
      sineVolume: 35,
      noiseVolume: 54,

      attack: 18,
      decay: 50,
      sustain: 70,
      gate: 60,

      filterCutoff: 32,
      filterResonance: 28,

      delay: 38,
      delayTime: 7,
      delayFeedback: 52,

      lfo1Target: "pitch",
      lfo1Wave: "rise",
      lfo1Depth: 70,
      lfo1Rate: 18
    })
  }
];