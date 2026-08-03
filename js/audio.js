import { clamp } from "./sequencer.js";

let context;
let master;

function resumeAudioContext() {
  if (
    context &&
    context.state === "suspended"
  ) {
    context.resume().catch(() => {});
  }
}

export async function initializeAudio() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.7;
    master.connect(context.destination);
    document.addEventListener(
  "visibilitychange",
  resumeAudioContext
);

window.addEventListener(
  "pageshow",
  resumeAudioContext
);

window.addEventListener(
  "focus",
  resumeAudioContext
);
  }
  if (context.state === "suspended") await context.resume();
}

export function setMasterVolume(value) {
  if (!master || !context) return;
  master.gain.setTargetAtTime(clamp(Number(value), 0, 1), context.currentTime, 0.01);
}

function frequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/*
 * LFO Rate：
 * UI上の1〜100を0.1〜10Hzへ変換。
 */
function lfoRateToHz(value) {
  return (
    clamp(
      Number(value) || 1,
      1,
      100
    ) / 10
  );
}

/*
 * LFO Depth：
 * UI上の0〜100を
 * 0〜1200cent（±12半音）へ変換。
 */
function lfoDepthToCents(value) {
  return (
    clamp(
      Number(value) || 0,
      0,
      100
    ) * 12
  );
}

function makeNoiseBuffer(duration) {
  const size = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, size, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export async function playTrackStep(
  track,
  stepIndex,
  delaySeconds = 0
) {
  await initializeAudio();

  console.log(
  "playTrackStep",
  {
    trackId: track.id,
    stepIndex: stepIndex + 1,
    time: context.currentTime
  }
);

  const now =
    context.currentTime +
    Math.max(
      0,
      Number(delaySeconds) || 0
    );

  const offset = id =>
    track.offsets[id]?.[stepIndex] ?? 0;

  const note =
    60 +
    track.base.note +
    offset("note");

  const velocity =
    clamp(
      track.base.velocity +
      offset("velocity"),
      0,
      100
    ) / 100;

  const attack =
    Math.max(
      0.001,
      clamp(
        track.base.attack +
        offset("attack"),
        1,
        50
      ) / 1000
    );

  const decay =
  Math.max(
    0.03,
    clamp(
      (track.base.decay ?? 5) +
        offset("decay"),
      1,
      100
    ) / 10
  );

  const sustain =
    clamp(
      (track.base.sustain ?? 0) +
        offset("sustain"),
      0,
      100
    ) / 100;

  const gateValue =
  clamp(
    (track.base.gate ?? 5) +
      offset("gate"),
    1,
    100
  );

const gateNormalized =
  (gateValue - 1) / 99;

/*
 * 低い値ほど細かく短音を調整し、
 * 最大値では約10秒まで伸ばす。
 */
const gate =
  0.005 +
  9.995 *
    Math.pow(
      gateNormalized,
      3
    );

  const sineVolume =
    clamp(
      (track.base.sineVolume ?? 100) +
        offset("sineVolume"),
      0,
      100
    ) / 100;

  const sineDecay =
    Math.max(
      0.03,
      clamp(
        (track.base.sineDecay ?? 5) +
          offset("sineDecay"),
        1,
        100
      ) / 10
    );

  const noiseVolume =
    clamp(
      (track.base.noiseVolume ?? 0) +
        offset("noiseVolume"),
      0,
      100
    ) / 100;

  const noiseDecay =
    Math.max(
      0.03,
      clamp(
        (track.base.noiseDecay ?? 5) +
          offset("noiseDecay"),
        1,
        100
      ) / 10
    );

  const commonEnvelopeDuration =
  gate;

  const maximumDecay =
    Math.max(
      sineDecay,
      noiseDecay,
      commonEnvelopeDuration
    );

  const depth =
    clamp(
      track.base.fmDepth +
      offset("fmDepth"),
      0,
      20
    );

  const tone =
    clamp(
      track.base.tone +
      offset("tone"),
      0,
      100
    );

  const panValue =
    (
      clamp(
        track.base.pan +
        offset("pan"),
        0,
        100
      ) -
      50
    ) / 50;

  /*
 * FX一括ミュート中は、
 * パラメーター値を保持したまま
 * Delay処理だけを停止する。
 */
const delayLevel =
  track.fxMuted
    ? 0
    : clamp(
        (track.base.delay ?? 0) +
          offset("delay"),
        0,
        100
      ) / 100;

  /*
   * UI上の1〜100を
   * 10ms〜1000msとして扱う。
   */
  const delayTimeIndex =
  clamp(
    (track.base.delayTime ?? 4) +
      offset("delayTime"),
    0,
    10
  );
  
  const bpm =
  Number(
    document.getElementById("bpm-input")?.value
  ) || 120;

const delayRatios = [
  1 / 16, // 1/64
  1 / 12, // 1/32T
  1 / 8,  // 1/32
  1 / 6,  // 1/16T
  1 / 4,  // 1/16
  1 / 3,  // 1/8T
  1 / 2,  // 1/8
  2 / 3,  // 1/4T
  1,      // 1/4
  4 / 3,  // 1/2T
  2       // 1/2
];

const delayTime =
  (60 / bpm) *
  delayRatios[delayTimeIndex];

  const delayFeedback =
  clamp(
    (track.base.delayFeedback ?? 35) +
      offset("delayFeedback"),
    0,
    95
  ) / 100;

  const panner =
  context.createStereoPanner();

const filter =
  context.createBiquadFilter();

/*
 * トラック全体へ掛ける
 * Pan LFOの停止管理用。
 */
const panLfoOscillators = [];

  panner.pan.setValueAtTime(
    panValue,
    now
  );

  /*
 * Pan LFO
 *
 * LFO1／LFO2のうち、
 * Targetがpanのものだけ
 * StereoPanner.panへ接続する。
 */
function connectPanLfo(
  lfoNumber
) {
  const prefix =
    `lfo${lfoNumber}`;

  const target =
    track.base[
      `${prefix}Target`
    ];

  if (target !== "pan") {
    return;
  }

  const lfoDepth =
    clamp(
      (
        track.base[
          `${prefix}Depth`
        ] ?? 0
      ) +
        offset(
          `${prefix}Depth`
        ),
      0,
      100
    );

  if (lfoDepth <= 0) {
    return;
  }

  const lfoRate =
    clamp(
      (
        track.base[
          `${prefix}Rate`
        ] ?? 25
      ) +
        offset(
          `${prefix}Rate`
        ),
      1,
      100
    );

  const lfoOscillator =
    context.createOscillator();

  const lfoGain =
    context.createGain();

  const lfoWave =
    track.base[
      `${prefix}Wave`
    ] ?? "sine";

  let lfoGainDirection = 1;

  switch (lfoWave) {
    case "triangle":
      lfoOscillator.type =
        "triangle";
      break;

    case "square":
      lfoOscillator.type =
        "square";
      break;

    case "sawUp":
      lfoOscillator.type =
        "sawtooth";
      break;

    case "sawDown":
      lfoOscillator.type =
        "sawtooth";

      lfoGainDirection = -1;
      break;

    case "random":
      /*
       * Randomは後で
       * Sample & Holdとして実装。
       */
      lfoOscillator.type =
        "sine";
      break;

    case "sine":
    default:
      lfoOscillator.type =
        "sine";
      break;
  }

  lfoOscillator.frequency
    .setValueAtTime(
      lfoRateToHz(
        lfoRate
      ),
      now
    );

  /*
   * Depth 100で
   * panを最大±1揺らす。
   */
  lfoGain.gain
    .setValueAtTime(
      (
        lfoDepth /
        100
      ) *
        lfoGainDirection,
      now
    );

  lfoOscillator
    .connect(lfoGain)
    .connect(panner.pan);

  panLfoOscillators.push(
    lfoOscillator
  );

  lfoOscillator.start(
    now
  );
}

connectPanLfo(1);
connectPanLfo(2);

  if (tone < 50) {
    filter.type = "lowpass";

    filter.frequency.setValueAtTime(
      120 +
      Math.pow(
        tone / 50,
        2
      ) *
      18000,
      now
    );
  } else if (tone > 50) {
    filter.type = "highpass";

    filter.frequency.setValueAtTime(
      Math.pow(
        (tone - 50) / 50,
        2
      ) *
      6000 +
      20,
      now
    );
  } else {
    filter.type = "allpass";
  }

const mixGain =
  context.createGain();

const peakLevel =
  Math.max(
    0.0001,
    velocity
  );

const sustainLevel =
  Math.max(
    0.0001,
    velocity * sustain
  );

const attackEnd =
  now + attack;

const decayEnd =
  attackEnd + decay;

const gateEnd =
  now + gate;

mixGain.gain.setValueAtTime(
  0.0001,
  now
);

mixGain.gain.setValueAtTime(
  0.0001,
  now
);

mixGain.gain.exponentialRampToValueAtTime(
  peakLevel,
  attackEnd
);

if (gateEnd <= decayEnd) {
  const decayProgress =
    clamp(
      (gateEnd - attackEnd) / decay,
      0,
      1
    );

  const levelAtGate =
    Math.max(
      0.0001,
      peakLevel *
        Math.pow(
          sustainLevel / peakLevel,
          decayProgress
        )
    );

  mixGain.gain.exponentialRampToValueAtTime(
    levelAtGate,
    gateEnd
  );
} else {
  mixGain.gain.exponentialRampToValueAtTime(
    sustainLevel,
    decayEnd
  );

  mixGain.gain.setValueAtTime(
    sustainLevel,
    gateEnd
  );
}

/*
 * クリック防止用の短い終了フェード。
 */
mixGain.gain.exponentialRampToValueAtTime(
  0.0001,
  gateEnd + 0.02
);

mixGain
  .connect(filter);

  filter.connect(panner);

  /*
   * 原音は常にそのまま出力する。
   */
  panner.connect(master);

  /*
   * クリーンなDelay。
   *
   * フィルターや拡散処理を挟まず、
   * 原音と同じ信号を音量だけ減衰させて
   * 繰り返す。
   */
  if (delayLevel > 0) {
    const delayNode =
      context.createDelay(1.1);

    const feedbackGain =
      context.createGain();

    const wetGain =
      context.createGain();

    delayNode.delayTime.setValueAtTime(
      delayTime,
      now
    );

    feedbackGain.gain.setValueAtTime(
      delayFeedback,
      now
    );

    wetGain.gain.setValueAtTime(
      delayLevel,
      now
    );

    panner.connect(
      delayNode
    );

    delayNode
      .connect(wetGain)
      .connect(master);

    delayNode
      .connect(feedbackGain)
      .connect(delayNode);

    /*
     * Feedbackが十分小さくなった後に
     * Delayノードを切り離す。
     */
    const repeatCount =
      delayFeedback <= 0
        ? 1
        : Math.min(
            64,
            Math.ceil(
              Math.log(0.001) /
              Math.log(delayFeedback)
            )
          );

    const cleanupSeconds =
      Math.min(
        20,
        attack +
        maximumDecay +
        delayTime *
          (repeatCount + 2)
      );

    window.setTimeout(
      () => {
        try {
          panner.disconnect(
            delayNode
          );

          delayNode.disconnect();
          feedbackGain.disconnect();
          wetGain.disconnect();
        } catch {
          /*
           * すでに切断済みなら何もしない。
           */
        }
      },
      Math.max(
        100,
        cleanupSeconds * 1000
      )
    );
  }

  function scheduleSourceEnvelope(
  gainNode,
  level,
  sourceDecay
) {
  const safeLevel =
    Number.isFinite(
      Number(level)
    )
      ? Math.max(
          0.0001,
          Number(level)
        )
      : 0.0001;

  const safeDecay =
    Number.isFinite(
      Number(sourceDecay)
    )
      ? Math.max(
          0.001,
          Number(sourceDecay)
        )
      : 0.5;

  const tailLevel =
    Math.max(
      0.0001,
      safeLevel * 0.1
    );

  const sourceDecayEnd =
    Math.min(
      now + safeDecay,
      gateEnd
    );

  gainNode.gain.setValueAtTime(
    safeLevel,
    now
  );

  gainNode.gain.exponentialRampToValueAtTime(
    tailLevel,
    sourceDecayEnd
  );

  if (
    sourceDecayEnd <
    gateEnd
  ) {
    gainNode.gain.setValueAtTime(
      tailLevel,
      gateEnd
    );
  }
}

  if (sineVolume > 0) {
    const carrier =
      context.createOscillator();

    const sineGain =
      context.createGain();

    const modulator =
      context.createOscillator();

    const modulationGain =
      context.createGain();

    const carrierFrequency =
      frequency(note);

    const sineStopAt =
  gateEnd + 0.05;

    carrier.type = "sine";

    carrier.frequency.setValueAtTime(
      carrierFrequency,
      now
    );

    modulator.type = "sine";

    /*
 * Pitch LFO
 *
 * LFO1／LFO2のうち、
 * Targetがpitchのものだけ
 * carrier.detuneへ接続する。
 */
const pitchLfoNodes = [];

function connectPitchLfo(
  lfoNumber
) {
  const prefix =
    `lfo${lfoNumber}`;

  const target =
    track.base[
      `${prefix}Target`
    ];

  if (target !== "pitch") {
    return;
  }

  const lfoDepth =
    clamp(
      (
        track.base[
          `${prefix}Depth`
        ] ?? 0
      ) +
        offset(
          `${prefix}Depth`
        ),
      0,
      100
    );

  if (lfoDepth <= 0) {
    return;
  }

  const lfoRate =
    clamp(
      (
        track.base[
          `${prefix}Rate`
        ] ?? 25
      ) +
        offset(
          `${prefix}Rate`
        ),
      1,
      100
    );

  const lfoOscillator =
    context.createOscillator();

  const lfoGain =
    context.createGain();

  /*
 * LFO Wave
 */
const lfoWave =
  track.base[
    `${prefix}Wave`
  ] ?? "sine";

let lfoGainDirection = 1;

switch (lfoWave) {
  case "triangle":
    lfoOscillator.type =
      "triangle";
    break;

  case "square":
    lfoOscillator.type =
      "square";
    break;

  case "sawUp":
    lfoOscillator.type =
      "sawtooth";
    break;

  case "sawDown":
    lfoOscillator.type =
      "sawtooth";

    /*
     * Saw Upを上下反転して
     * Saw Downとして使う。
     */
    lfoGainDirection = -1;
    break;

  case "random":
    /*
     * Randomは次段階で
     * Sample & Holdとして実装する。
     * 現時点ではSineへフォールバック。
     */
    lfoOscillator.type =
      "sine";
    break;

  case "sine":
  default:
    lfoOscillator.type =
      "sine";
    break;
}

lfoOscillator.frequency
  .setValueAtTime(
    lfoRateToHz(
      lfoRate
    ),
    now
  );

lfoGain.gain
  .setValueAtTime(
    lfoDepthToCents(
      lfoDepth
    ) *
      lfoGainDirection,
    now
  );

  lfoOscillator
    .connect(lfoGain)
    .connect(carrier.detune);

  pitchLfoNodes.push(
    lfoOscillator,
    lfoGain
  );

  lfoOscillator.start(
    now
  );
}

connectPitchLfo(1);
connectPitchLfo(2);

    modulator.frequency.setValueAtTime(
      carrierFrequency *
      Math.max(
        0.01,
        track.base.fmRatio
      ),
      now
    );

    modulationGain.gain.setValueAtTime(
      carrierFrequency *
      depth *
      0.1,
      now
    );

    /*
 * 検証：
 * SINEはOSC個別Decayで減衰させず、
 * ENVのSustain / Gateだけで音量を制御する。
 */
sineGain.gain.setValueAtTime(
  Math.max(
    0.0001,
    sineVolume
  ),
  now
);

    modulator
      .connect(modulationGain)
      .connect(carrier.frequency);

    carrier
      .connect(sineGain)
      .connect(mixGain);

    carrier.start(now);
    modulator.start(now);

    carrier.stop(sineStopAt);
    modulator.stop(sineStopAt);
    pitchLfoNodes.forEach(
  node => {
    if (
      typeof node.stop ===
      "function"
    ) {
      node.stop(
        sineStopAt
      );
    }
  }
);
  }

  if (noiseVolume > 0) {
    const noise =
      context.createBufferSource();

    const noiseGain =
      context.createGain();

    const noiseStopAt =
  gateEnd + 0.05;

noise.buffer =
  makeNoiseBuffer(
    gate + 0.05
  );

    scheduleSourceEnvelope(
      noiseGain,
      noiseVolume,
      noiseDecay
    );

    noise
      .connect(noiseGain)
      .connect(mixGain);

    noise.start(now);
    noise.stop(noiseStopAt);
  }

  /*
 * トラック終了時に
 * Pan LFOも停止する。
 */
panLfoOscillators.forEach(
  oscillator => {
    oscillator.stop(
      gateEnd + 0.05
    );
  }
);

}

export function resumeAudio() {
  resumeAudioContext();
}