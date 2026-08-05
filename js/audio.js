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
function lfoRateToHz(
  value,
  syncMode = "free",
  bpm = 120
) {
  if (syncMode !== "bpm") {
    return (
      clamp(
        Number(value) || 1,
        1,
        100
      ) / 10
    );
  }

  const beatRatios = [
    1 / 16,
    1 / 12,
    1 / 8,
    1 / 6,
    1 / 4,
    1 / 3,
    1 / 2,
    2 / 3,
    1,
    4 / 3,
    2,
    4,
    8,
    16
  ];

  const index =
    clamp(
      Math.round(
        Number(value) || 0
      ),
      0,
      beatRatios.length - 1
    );

  const durationSeconds =
    (
      60 /
      Math.max(
        1,
        Number(bpm) || 120
      )
    ) *
    beatRatios[index];

  return (
    1 /
    Math.max(
      0.001,
      durationSeconds
    )
  );
}

/*
 * 通常LFO用
 * 最大±1200cent（1オクターブ）
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

/*
 * Rise / Fall専用
 * 最大±3600cent（3オクターブ）
 */
function oneShotPitchDepthToCents(value) {
  return (
    clamp(
      Number(value) || 0,
      0,
      100
    ) * 36
  );
}

function makeNoiseBuffer(duration) {
  const size = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, size, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/*
 * Random LFO
 *
 * 一定間隔ごとにランダム値を作り、
 * 次の更新時刻までその値を保持する。
 */
function createSampleAndHoldLfo({
  audioParam,
  depth,
  rateHz,
  startTime,
  stopTime
}) {
  const source =
    context.createConstantSource();

  const safeRate =
    Math.max(
      0.001,
      Number(rateHz) || 1
    );

  const interval =
    1 / safeRate;

  const safeDepth =
    Number.isFinite(
      Number(depth)
    )
      ? Number(depth)
      : 0;

  /*
   * ConstantSourceの出力を
   * AudioParamへ加算する。
   */
  source.connect(
    audioParam
  );

  /*
   * 発音開始時点から、
   * Rate間隔で新しいランダム値を設定する。
   */
  let time =
    startTime;

  let eventCount = 0;

  while (
    time <= stopTime &&
    eventCount < 4096
  ) {
    const randomValue =
      (
        Math.random() * 2 -
        1
      ) *
      safeDepth;

    source.offset.setValueAtTime(
      randomValue,
      time
    );

    time +=
      interval;

    eventCount += 1;
  }

  source.start(
    startTime
  );

  return source;
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

  const bpm =
    Number(
      document.getElementById("bpm-input")?.value
    ) || 120;

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

  /*
   * Attack / Decay LFO
   *
   * エンベロープ時間は発音開始時に確定するため、
   * LFO波形をその瞬間に1回だけサンプルし、
   * その音のAttack / Decay値として使う。
   * Randomは発音ごとに新しい値、周期波形は
   * AudioContext上の現在位相をサンプルする。
   */
  function sampleLfoWave(
    wave,
    rateHz
  ) {
    if (wave === "random") {
      return Math.random() * 2 - 1;
    }

    const phase =
      2 *
      Math.PI *
      rateHz *
      now;

    switch (wave) {
      case "triangle":
        return (2 / Math.PI) *
          Math.asin(
            Math.sin(phase)
          );

      case "square":
        return Math.sin(phase) >= 0
          ? 1
          : -1;

      case "sawUp": {
        const cyclePosition =
          ((phase / (2 * Math.PI)) % 1 + 1) % 1;

        return cyclePosition * 2 - 1;
      }

      case "sawDown": {
        const cyclePosition =
          ((phase / (2 * Math.PI)) % 1 + 1) % 1;

        return 1 - cyclePosition * 2;
      }

      case "rise":
        return -1;

      case "fall":
        return 1;

      case "sine":
      default:
        return Math.sin(phase);
    }
  }

  function envelopeLfoValue(
    targetId,
    baseValue,
    minimum,
    maximum
  ) {
    let result =
      Number(baseValue) || minimum;

    [1, 2].forEach(
      lfoNumber => {
        const prefix =
          `lfo${lfoNumber}`;

        if (
          track.base[
            `${prefix}Target`
          ] !== targetId
        ) {
          return;
        }

        const depth =
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

        if (depth <= 0) {
          return;
        }

        const syncMode =
          track.base[
            `${prefix}SyncMode`
          ] === "bpm"
            ? "bpm"
            : "free";

        const rateValue =
          clamp(
            (
              track.base[
                `${prefix}Rate`
              ] ??
              (
                syncMode === "bpm"
                  ? 8
                  : 25
              )
            ) +
              offset(
                `${prefix}Rate`
              ),
            syncMode === "bpm"
              ? 0
              : 1,
            syncMode === "bpm"
              ? 13
              : 100
          );

        const rateHz =
          lfoRateToHz(
            rateValue,
            syncMode,
            bpm
          );

        const wave =
          track.base[
            `${prefix}Wave`
          ] ?? "sine";

        const amount =
          (maximum - minimum) *
          0.5 *
          (depth / 100);

        result +=
          sampleLfoWave(
            wave,
            rateHz
          ) * amount;
      }
    );

    return clamp(
      result,
      minimum,
      maximum
    );
  }

  const attackValue =
    envelopeLfoValue(
      "attack",
      (track.base.attack ?? 1) +
        offset("attack"),
      1,
      50
    );

  const attack =
    Math.max(
      0.001,
      attackValue / 1000
    );

  const decayValue =
    envelopeLfoValue(
      "decay",
      (track.base.decay ?? 5) +
        offset("decay"),
      1,
      100
    );

  const decay =
    Math.max(
      0.03,
      decayValue / 10
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

  const filterCutoff =
    clamp(
      (track.base.filterCutoff ?? 0) +
        offset("filterCutoff"),
      -100,
      100
    );

  const filterResonance =
    clamp(
      (track.base.filterResonance ?? 0) +
        offset("filterResonance"),
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

const filter1 =
  context.createBiquadFilter();

const filter2 =
  context.createBiquadFilter();

const gateEnd =
  now + gate;

  /*
 * クリック防止用のRelease。
 * Resonanceが高い時も自然に消す。
 */
const releaseTime =
  0.05;

const releaseEnd =
  gateEnd +
  releaseTime;

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

  const syncMode =
  track.base[
    `${prefix}SyncMode`
  ] === "bpm"
    ? "bpm"
    : "free";

const lfoRate =
  clamp(
    (
      track.base[
        `${prefix}Rate`
      ] ??
      (
        syncMode === "bpm"
          ? 8
          : 25
      )
    ) +
      offset(
        `${prefix}Rate`
      ),
    syncMode === "bpm"
      ? 0
      : 1,
    syncMode === "bpm"
      ? 13
      : 100
  );

  const lfoWave =
  track.base[
    `${prefix}Wave`
  ] ?? "sine";

const rateHz =
  lfoRateToHz(
    lfoRate,
    syncMode,
    bpm
  );

/*
 * RandomはOscillatorではなく、
 * Sample & Hold信号を直接Panへ接続する。
 */
if (lfoWave === "random") {
  const randomSource =
    createSampleAndHoldLfo({
      audioParam:
        panner.pan,

      /*
       * Depth 100で
       * Panを最大±1変化させる。
       */
      depth:
        lfoDepth / 100,

      rateHz,

      startTime:
        now,

      stopTime:
        now + gate + 0.05
    });

  panLfoOscillators.push(
    randomSource
  );

  return;
}

const lfoOscillator =
  context.createOscillator();

const lfoGain =
  context.createGain();

  let lfoGainDirection = 1;

if (lfoWave === "rise" || lfoWave === "fall") {

    const start =
        lfoWave === "fall"
            ? lfoDepth / 100
            : -(lfoDepth / 100);

    panner.pan.setValueAtTime(
        panValue + start,
        now
    );

    panner.pan.linearRampToValueAtTime(
        panValue,
        now + (1 / rateHz)
    );

    return;
}

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

    case "sine":
    default:
      lfoOscillator.type =
        "sine";
      break;
  }

  lfoOscillator.frequency
  .setValueAtTime(
    rateHz,
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

  /*
   * Filter Cutoff
   *
   * -100〜-1：Low Pass
   * 0       ：OFF
   * +1〜100 ：High Pass
   *
   * 同じBiquadFilterを2段直列にして、
   * LP／HPとも24dB/oct相当として扱う。
   */
  if (filterCutoff === 0) {
    filter1.type = "allpass";
    filter2.type = "allpass";
  } else {
    const normalizedAmount =
      Math.abs(filterCutoff) / 100;

    const isLowPass =
      filterCutoff < 0;

    const filterType =
      isLowPass
        ? "lowpass"
        : "highpass";

    const cutoffFrequency =
      isLowPass
        ? 20000 *
          Math.pow(
            40 / 20000,
            normalizedAmount
          )
        : 20 *
          Math.pow(
            12000 / 20,
            normalizedAmount
          );

    filter1.type = filterType;
    filter2.type = filterType;

    filter1.frequency.setValueAtTime(
      cutoffFrequency,
      now
    );

    filter2.frequency.setValueAtTime(
      cutoffFrequency,
      now
    );

    /*
     * Resonanceは1段目だけへ与える。
     * 2段とも同じQを与えるとピークが
     * 過剰になりやすいため。
     */
    const resonanceQ =
      0.0001 +
      Math.pow(
        filterResonance / 100,
        1.7
      ) * 30;

    filter1.Q.setValueAtTime(
      resonanceQ,
      now
    );

    /*
     * 2段目にも弱めのQを与えて、
     * 24dB構成でもResonanceの変化を
     * 聴き取りやすくする。
     */
    filter2.Q.setValueAtTime(
      Math.max(
        0.0001,
        resonanceQ * 0.35
      ),
      now
    );
  }

  /*
   * Filter Cutoff LFO
   *
   * filterCutoffがLP／HPの時だけ、
   * 2段のFilter detuneを同じ信号で変調する。
   * Depth 100で最大±3600cent（3oct）。
   */
  const filterLfoNodes = [];

  function connectFilterLfo(
    lfoNumber
  ) {
    if (filterCutoff === 0) {
      return;
    }

    const prefix =
      `lfo${lfoNumber}`;

    if (
      track.base[
        `${prefix}Target`
      ] !== "filterCutoff"
    ) {
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

    const syncMode =
      track.base[
        `${prefix}SyncMode`
      ] === "bpm"
        ? "bpm"
        : "free";

    const lfoRate =
      clamp(
        (
          track.base[
            `${prefix}Rate`
          ] ??
          (
            syncMode === "bpm"
              ? 8
              : 25
          )
        ) +
          offset(
            `${prefix}Rate`
          ),
        syncMode === "bpm"
          ? 0
          : 1,
        syncMode === "bpm"
          ? 13
          : 100
      );

    const lfoWave =
      track.base[
        `${prefix}Wave`
      ] ?? "sine";

    const rateHz =
      lfoRateToHz(
        lfoRate,
        syncMode,
        bpm
      );

    const amountCents =
      lfoDepth * 36;

    const stopTime =
  releaseEnd + 0.01;

    if (lfoWave === "random") {
      const source =
        context.createConstantSource();

      source.connect(filter1.detune);
      source.connect(filter2.detune);

      const interval =
        1 / Math.max(0.001, rateHz);

      let time = now;
      let eventCount = 0;

      while (
        time <= stopTime &&
        eventCount < 4096
      ) {
        source.offset.setValueAtTime(
          (Math.random() * 2 - 1) *
            amountCents,
          time
        );

        time += interval;
        eventCount += 1;
      }

      source.start(now);
      filterLfoNodes.push(source);
      return;
    }

    if (
      lfoWave === "rise" ||
      lfoWave === "fall"
    ) {
      const source =
        context.createConstantSource();

      source.connect(filter1.detune);
      source.connect(filter2.detune);

      source.offset.setValueAtTime(
        lfoWave === "fall"
          ? amountCents
          : -amountCents,
        now
      );

      source.offset.linearRampToValueAtTime(
        0,
        now + 1 / rateHz
      );

      source.start(now);
      source.stop(
        Math.min(
          stopTime,
          now + 1 / rateHz + 0.01
        )
      );

      filterLfoNodes.push(source);
      return;
    }

    /*
 * 周期Filter LFO
 *
 * OscillatorNodeをAudioParamへ接続せず、
 * 発音開始を位相0とする波形カーブを
 * detuneへ直接予約する。
 *
 * これにより同じRate／Depthなら、
 * 各発音で必ず同じ位置から始まる。
 */
const modulationDuration =
  Math.max(
    0.001,
    stopTime - now
  );

/*
 * 1周期あたり十分な分解能を確保しつつ、
 * 長いGateでも配列が巨大にならないよう制限。
 */
const sampleCount =
  Math.round(
    clamp(
      modulationDuration *
        rateHz *
        256,
      128,
      4096
    )
  );

const curve =
  new Float32Array(
    sampleCount
  );

for (
  let sampleIndex = 0;
  sampleIndex < sampleCount;
  sampleIndex++
) {
  const progress =
    sampleCount <= 1
      ? 0
      : sampleIndex /
        (sampleCount - 1);

  const elapsedSeconds =
    progress *
    modulationDuration;

  const phase =
    2 *
    Math.PI *
    rateHz *
    elapsedSeconds;

  let waveValue = 0;

  switch (lfoWave) {
    case "triangle":
      /*
       * 位相0では0から上昇。
       */
      waveValue =
        (
          2 /
          Math.PI
        ) *
        Math.asin(
          Math.sin(phase)
        );
      break;

    case "square":
      /*
       * 位相0ではプラス側から開始。
       */
      waveValue =
        Math.sin(phase) >= 0
          ? 1
          : -1;
      break;

    case "sawUp": {
      /*
       * -1から+1へ上昇。
       */
      const cyclePosition =
        (
          phase /
          (
            2 *
            Math.PI
          )
        ) % 1;

      waveValue =
        cyclePosition *
          2 -
        1;
      break;
    }

    case "sawDown": {
      /*
       * +1から-1へ下降。
       */
      const cyclePosition =
        (
          phase /
          (
            2 *
            Math.PI
          )
        ) % 1;

      waveValue =
        1 -
        cyclePosition *
          2;
      break;
    }

    case "sine":
    default:
      /*
       * 位相0では0から上昇。
       */
      waveValue =
        Math.sin(phase);
      break;
  }

  curve[sampleIndex] =
    waveValue *
    amountCents;
}

/*
 * 2段のFilterへ完全に同じカーブを予約。
 */
filter1.detune.setValueCurveAtTime(
  curve,
  now,
  modulationDuration
);

filter2.detune.setValueCurveAtTime(
  curve,
  now,
  modulationDuration
);
  }

  connectFilterLfo(1);
  connectFilterLfo(2);

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
  releaseEnd
);

mixGain
  .connect(filter1)
  .connect(filter2)
  .connect(panner);

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
  releaseEnd + 0.01;

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

  const syncMode =
  track.base[
    `${prefix}SyncMode`
  ] === "bpm"
    ? "bpm"
    : "free";

const lfoRate =
  clamp(
    (
      track.base[
        `${prefix}Rate`
      ] ??
      (
        syncMode === "bpm"
          ? 8
          : 25
      )
    ) +
      offset(
        `${prefix}Rate`
      ),
    syncMode === "bpm"
      ? 0
      : 1,
    syncMode === "bpm"
      ? 13
      : 100
  );

  /*
 * LFO Wave
 */
const lfoWave =
  track.base[
    `${prefix}Wave`
  ] ?? "sine";

const rateHz =
  lfoRateToHz(
    lfoRate,
    syncMode,
    bpm
  );

/*
 * RandomはSample & Hold信号を
 * carrier.detuneへ直接接続する。
 */
if (lfoWave === "random") {
  const randomSource =
    createSampleAndHoldLfo({
      audioParam:
        carrier.detune,

      /*
       * Pitch Depthはcent単位。
       */
      depth:
        lfoDepthToCents(
          lfoDepth
        ),

      rateHz,

      startTime:
        now,

      stopTime:
        sineStopAt
    });

  pitchLfoNodes.push(
    randomSource
  );

  return;
}

const lfoOscillator =
  context.createOscillator();

const lfoGain =
  context.createGain();

let lfoGainDirection = 1;

if (lfoWave === "rise" || lfoWave === "fall") {

  const oneShot =
    context.createConstantSource();

  oneShot.connect(
    carrier.detune
  );

  const amount =
  oneShotPitchDepthToCents(
    lfoDepth
  );

  oneShot.offset.setValueAtTime(
    lfoWave === "fall"
      ? amount
      : -amount,
    now
  );

  oneShot.offset.linearRampToValueAtTime(
    0,
    now + (1 / rateHz)
  );

  oneShot.start(now);
  oneShot.stop(
    now + (1 / rateHz) + 0.01
  );

  pitchLfoNodes.push(
    oneShot
  );

  return;
}

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

  case "sine":
  default:
    lfoOscillator.type =
      "sine";
    break;
}

lfoOscillator.frequency
  .setValueAtTime(
    rateHz,
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

    const baseFmAmount =
  carrierFrequency *
  depth *
  0.1;

modulationGain.gain.setValueAtTime(
  baseFmAmount,
  now
);

/*
 * FM Depth LFO
 *
 * 現在のFM Depthを中心値として、
 * LFO Depth 100で0〜2倍まで揺らす。
 */
const fmLfoNodes = [];

function connectFmLfo(
  lfoNumber
) {
  const prefix =
    `lfo${lfoNumber}`;

  const target =
    track.base[
      `${prefix}Target`
    ];

  if (
    target !== "fmDepth"
  ) {
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

  if (
    lfoDepth <= 0 ||
    baseFmAmount <= 0
  ) {
    return;
  }

  const syncMode =
    track.base[
      `${prefix}SyncMode`
    ] === "bpm"
      ? "bpm"
      : "free";

  const lfoRate =
    clamp(
      (
        track.base[
          `${prefix}Rate`
        ] ??
        (
          syncMode === "bpm"
            ? 8
            : 25
        )
      ) +
        offset(
          `${prefix}Rate`
        ),
      syncMode === "bpm"
        ? 0
        : 1,
      syncMode === "bpm"
        ? 13
        : 100
    );

  const lfoWave =
    track.base[
      `${prefix}Wave`
    ] ?? "sine";

  const rateHz =
    lfoRateToHz(
      lfoRate,
      syncMode,
      bpm
    );

  /*
   * LFO Depth 100で、
   * ベースFM量と同じ幅だけ
   * 上下へ変化させる。
   */
  const fmLfoAmount =
    baseFmAmount *
    (
      lfoDepth /
      100
    );

  /*
   * Random：
   * Sample & HoldでFM量を変化。
   */
  if (
    lfoWave === "random"
  ) {
    const randomSource =
      createSampleAndHoldLfo({
        audioParam:
          modulationGain.gain,

        depth:
          fmLfoAmount,

        rateHz,

        startTime:
          now,

        stopTime:
          sineStopAt
      });

    fmLfoNodes.push(
      randomSource
    );

    return;
  }

  const lfoOscillator =
    context.createOscillator();

  const lfoGain =
    context.createGain();

  let lfoGainDirection = 1;

if (lfoWave === "rise" || lfoWave === "fall") {

    const start =
        lfoWave === "fall"
            ? fmLfoAmount
            : -fmLfoAmount;

    modulationGain.gain.setValueAtTime(
        baseFmAmount + start,
        now
    );

    modulationGain.gain.linearRampToValueAtTime(
        baseFmAmount,
        now + (1 / rateHz)
    );

    return;
}

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

    case "sine":
    default:
      lfoOscillator.type =
        "sine";
      break;
  }

  lfoOscillator.frequency
    .setValueAtTime(
      rateHz,
      now
    );

  lfoGain.gain
    .setValueAtTime(
      fmLfoAmount *
      lfoGainDirection,
      now
    );

  lfoOscillator
    .connect(lfoGain)
    .connect(
      modulationGain.gain
    );

  fmLfoNodes.push(
    lfoOscillator
  );

  lfoOscillator.start(
    now
  );
}

connectFmLfo(1);
connectFmLfo(2);

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

fmLfoNodes.forEach(
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
  releaseEnd + 0.01;

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
  releaseEnd + 0.01
);
  }
);

}

export function resumeAudio() {
  resumeAudioContext();
}