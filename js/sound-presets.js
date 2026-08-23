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
 *     chord: 0,      // 0=off, 1=maj ...
 *     voices: 4,
 *     inversion: 0,  // 0=R, 1〜3=転回
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
 *　　 fmFeedback: 0,
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
  id: "factory-initialize-initialize tone",
  category: "other",
  name: "initialize tone",

  sound: sound({
    note: 12,

    sineVolume: 100,
    noiseVolume: 0,

    attack: 1,
    decay: 10,
    sustain: 0,
    gate: 50,

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
},

  {
    id: "factory-kick-electro kick",
    category: "kick",
    name: "electoro kick",

    sound: sound({
      note: -32,

      sineVolume: 100,
      noiseVolume: 0,

      attack: 1,
      decay: 10,
      sustain: 0,
      gate: 30,

      fmDepth: 0,
      fmRatio: 1,

      filterCutoff: 0,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 70,
      lfo1Rate: 100
    })
  },

  {
    id: "factory-kick-minimal kick",
    category: "kick",
    name: "minimal kick",

    sound: sound({
      note: -36,

      sineVolume: 100,
      noiseVolume: 0,

      attack: 5,
      decay: 8,
      sustain: 0,
      gate: 20,

      fmDepth: 2,
      fmRatio: 3.75,

      filterCutoff: -15,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 60,
      lfo1Rate: 80,

      crushLevel: 55,
      crushBit: 12,
      crushRate: 4

    })
  },

  {
    id: "factory-kick-fall kick",
    category: "kick",
    name: "fall kick",

    sound: sound({
      note: -31,

      sineVolume: 65,
      noiseVolume: 0,

      attack: 1,
      decay: 40,
      sustain: 0,
      gate: 45,

      fmDepth: 0,
      fmRatio: 1,

      filterCutoff: -10,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 100,
      lfo1Rate: 90

    })
  },

{
    id: "factory-kick-bit kick",
    category: "kick",
    name: "bit kick",

    sound: sound({
      note: -32,

      sineVolume: 50,
      noiseVolume: 5,

      attack: 1,
      decay: 50,
      sustain: 0,
      gate: 23,

      fmDepth: 15,
      fmRatio: 6,
      fmFeedback: 50,

      filterCutoff: -18,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 100,
      lfo1Rate: 100,

      crushLevel: 100,
      crushBit: 8,
      crushRate: 8

    })
  },

  {
    id: "factory-kick-acoustic kick",
    category: "kick",
    name: "acoustic kick",

    sound: sound({
      note: -39,

      sineVolume: 100,
      noiseVolume: 0,

      attack: 5,
      decay: 20,
      sustain: 0,
      gate: 25,

      fmDepth: 9,
      fmRatio: 1.25,

      filterCutoff: -12,

      lfo1Target: "pitch",
      lfo1Wave: "fall",
      lfo1Depth: 70,
      lfo1Rate: 86
    })
  },

{
    id: "factory-snare-electro snare",
    category: "snare",
    name: "electro snare",

    sound: sound({
      note: 0,

      sineVolume: 90,
      sineDecay: 1,
      noiseVolume: 40,
      noiseDecay: 1,

      attack: 1,
      decay: 20,
      sustain: 0,
      gate: 20,

      filterCutoff: 38,
      filterResonance: 0,
      
      lfo1Target: "filterCutoff",
      lfo1Wave: "rise",
      lfo1Depth: 100,
      lfo1Rate: 100,

      crushLevel: 15,
      crushBit: 8,
      crushRate: 4
    })
  },

  {
    id: "factory-snare-acoustic snare",
    category: "snare",
    name: "acoustic snare",

    sound: sound({
      note: -5,

      sineVolume: 100,
      sineDecay: 1,
      noiseVolume: 30,
      noiseDecay: 100,

      attack: 1,
      decay: 2,
      sustain: 0,
      gate: 25,

      filterCutoff: 35,
      filterResonance: 0,

      lfo1Target: "filterCutoff",
      lfo1Wave: "rise",
      lfo1Depth: 100,
      lfo1Rate: 100
    })
  },

{
    id: "factory-snare-piccolo snare",
    category: "snare",
    name: "piccolo snare",

    sound: sound({
      note: -5,

      sineVolume: 85,
      sineDecay: 1,
      noiseVolume: 40,
      noiseDecay: 100,

      attack: 1,
      decay: 2,
      sustain: 0,
      gate: 22,

      fmDepth: 19,
      fmRatio: 1,

      filterCutoff: 38,
      filterResonance: 0,

      lfo1Target: "filterCutoff",
      lfo1Wave: "rise",
      lfo1Depth: 100,
      lfo1Rate: 100
    })
  },

{
    id: "factory-snare-can snare",
    category: "snare",
    name: "can snare",

    sound: sound({
      note: 12,

      sineVolume: 85,
      sineDecay: 1,
      noiseVolume: 60,
      noiseDecay: 1,

      attack: 1,
      decay: 4,
      sustain: 0,
      gate: 25,

      filterCutoff: 0,
      filterResonance: 0,
      
      lfo1Target: "filterCutoff",
      lfo1Wave: "rise",
      lfo1Depth: 100,
      lfo1Rate: 100
    })
  },

  {
    id: "factory-hh-electro hh1",
    category: "hh",
    name: "electro hh1",

    sound: sound(
      {
        sineVolume: 0,
        sineDecay:1,
        noiseVolume: 60,
        noiseDecay: 1,

        attack: 1,
        decay: 2,
        sustain: 0,
        gate: 30,

        filterCutoff: 48,
        filterResonance: 20
      },
      {
        oscSelectedId:
          "noiseVolume"
      }
    )
  },

{
    id: "factory-hh-electro hh2",
    category: "hh",
    name: "electoro hh2",

    sound: sound(
      {
        sineVolume: 0,
        sineDecay:1,
        noiseVolum1: 10,
        noiseDecay: 5,

        attack: 1,
        decay: 2,
        sustain: 0,
        gate: 30,

        filterCutoff: 41,
        filterResonance: 41
      },
      {
        oscSelectedId:
          "noiseVolume"
      }
    )
  },

 {
    id: "factory-hh-acoustic hh1",
    category: "hh",
    name: "acoustic hh1",

    sound: sound(
      {
        sineVolume: 0,
        sineDecay:1,
        noiseVolume: 70,
        noiseDecay: 1,

        attack: 1,
        decay: 2,
        sustain: 0,
        gate: 30,

        filterCutoff: 48,
        filterResonance: 5
      },
      {
        oscSelectedId:
          "noiseVolume"
      }
    )
  },

  {
    id: "factory-hh-acoustic hh2",
    category: "hh",
    name: "acoustic hh2",

    sound: sound(
      {
        sineVolume: 0,

        noiseVolume: 50,
        noiseDecay: 5,

        attack: 1,
        decay: 2,
        sustain: 18,
        gate: 30,

        filterCutoff: 30,
        filterResonance: 0
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
    name: "electric piano",

    sound: sound({
      sineVolume: 90,
      sineDecay:50,
      noiseVolume: 0,

      attack: 1,
      decay: 40,
      sustain: 1,
      gate: 60,

      fmDepth: 7,
      fmRatio: 1,

      lfo1Target: "pitch",
      lfo1Wave: "sine",
      lfo1Depth: 1,
      lfo1Rate: 25,

      lfo2Target: "pan",
      lfo2Wave: "sine",
      lfo2Depth: 10,
      lfo2Rate: 50
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