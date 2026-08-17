import { clamp, resolveStepSound, resolveChordNoteOffsets, CHORD_NAMES } from "./sequencer.js";

let context;
let master;
let mixInput;
let mixGain;
let limiter;
let reverbConvolver;
let reverbDryGain;
let reverbWetGain;
let spectrumAnalyser;
let outputAnalyser;
let eqNodes = [];
let spectrumData;
let outputTimeData;
let bitCrusherWorkletReady = null;

const EQ_FREQUENCIES = [
  60, 120, 250, 500,
  1000, 2000, 4000, 8000
];

const EQ_BAND_EDGES = [
  35, 85, 175, 350, 700,
  1400, 2800, 5600, 12000
];

/*
 * Master Mix meter用の値は
 * 毎回新規生成せず、同じ領域を再利用する。
 */
const masterMixMeterData = {
  bands: new Float32Array(8),
  level: 0,
  limiterReduction: 0
};

const masterMixSettings = {
  eq: Array(8).fill(0),
  volume: 100,
  limiter: -1,
  reverb: 0
};

/*
 * Trackごとに最後に予約した発音の
 * GainNodeを保持する。
 *
 * 次のトリガー時に前音を短く閉じて、
 * FM波形同士の位相干渉を防ぐ。
 */
const activeTrackVoices =
  new Map();

/*
 * 位相固定FM波形のキャッシュ。
 * Random LFOを含まない同一条件の発音は
 * 生成済みAudioBufferを再利用する。
 */
const fmBufferCache =
  new Map();

const FM_BUFFER_CACHE_LIMIT = 64;

function resumeAudioContext() {
  if (
    context &&
    context.state === "suspended"
  ) {
    context.resume().catch(() => {});
  }
}

async function initializeBitCrusherWorklet() {
  if (!context?.audioWorklet) {
    return false;
  }

  if (!bitCrusherWorkletReady) {
    const processorSource = `
      class SprootoBitCrusherProcessor extends AudioWorkletProcessor {
        static get parameterDescriptors() {
          return [
            {
              name: "bitDepth",
              defaultValue: 8,
              minValue: 1,
              maxValue: 16,
              automationRate: "k-rate"
            },
            {
              name: "rateReduction",
              defaultValue: 4,
              minValue: 1,
              maxValue: 32,
              automationRate: "k-rate"
            }
          ];
        }

        constructor() {
          super();
          this.phase = 0;
          this.held = [];
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          const output = outputs[0];

          if (!input || input.length === 0) {
            return true;
          }

          const bitDepth = Math.max(
            1,
            Math.min(16, Math.round(parameters.bitDepth[0] || 8))
          );

          const rateReduction = Math.max(
            1,
            Math.min(32, Math.round(parameters.rateReduction[0] || 4))
          );

          const quantizer = Math.max(1, Math.pow(2, bitDepth - 1) - 1);
          const frameCount = output[0]?.length || 0;

          for (let frame = 0; frame < frameCount; frame++) {
            const capture = this.phase === 0;

            for (let channel = 0; channel < output.length; channel++) {
              const source = input[channel] || input[0];
              const destination = output[channel];

              if (!source || !destination) {
                continue;
              }

              if (capture || this.held[channel] === undefined) {
                const sample = source[frame] || 0;
                this.held[channel] = Math.round(sample * quantizer) / quantizer;
              }

              destination[frame] = this.held[channel];
            }

            this.phase = (this.phase + 1) % rateReduction;
          }

          return true;
        }
      }

      registerProcessor(
        "sprooto-bit-crusher",
        SprootoBitCrusherProcessor
      );
    `;

    const blob = new Blob(
      [processorSource],
      { type: "application/javascript" }
    );

    const url = URL.createObjectURL(blob);

    bitCrusherWorkletReady = context.audioWorklet
      .addModule(url)
      .then(() => true)
      .catch(error => {
        console.warn("Bit crusher AudioWorklet unavailable:", error);
        return false;
      })
      .finally(() => {
        URL.revokeObjectURL(url);
      });
  }

  return bitCrusherWorkletReady;
}

export async function initializeAudio() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.7;

    mixInput = context.createGain();

    eqNodes = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0
        ? "lowshelf"
        : index === EQ_FREQUENCIES.length - 1
          ? "highshelf"
          : "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = masterMixSettings.eq[index];
      return filter;
    });

    reverbConvolver = context.createConvolver();
    reverbConvolver.buffer = createMasterReverbImpulse();

    reverbDryGain = context.createGain();
    reverbWetGain = context.createGain();

    mixGain = context.createGain();
    limiter = context.createDynamicsCompressor();
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;

    let previousNode = mixInput;
    eqNodes.forEach(filter => {
      previousNode.connect(filter);
      previousNode = filter;
    });

    spectrumAnalyser = context.createAnalyser();
    spectrumAnalyser.fftSize = 2048;
    spectrumAnalyser.smoothingTimeConstant = 0.72;
    previousNode.connect(spectrumAnalyser);

    previousNode.connect(reverbDryGain);
    reverbDryGain.connect(mixGain);

    previousNode.connect(reverbConvolver);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(mixGain);

    mixGain.connect(limiter);

    outputAnalyser = context.createAnalyser();
    outputAnalyser.fftSize = 1024;
    outputAnalyser.smoothingTimeConstant = 0.6;

    limiter.connect(outputAnalyser);
    outputAnalyser.connect(master);
    master.connect(context.destination);

    applyMasterMixSettings();
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

  await initializeBitCrusherWorklet();

  if (context.state === "suspended") await context.resume();
}

export function setMasterVolume(value) {
  if (!master || !context) return;
  master.gain.setTargetAtTime(clamp(Number(value), 0, 1), context.currentTime, 0.01);
}

function createMasterReverbImpulse() {
  const duration = 2.2;
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);

    for (let index = 0; index < length; index++) {
      const progress = index / length;
      const envelope = Math.pow(1 - progress, 2.6);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return buffer;
}

function applyMasterMixSettings() {
  if (!context) return;

  const now = context.currentTime;

  eqNodes.forEach((filter, index) => {
    filter.gain.setTargetAtTime(
      masterMixSettings.eq[index] ?? 0,
      now,
      0.01
    );
  });

  mixGain?.gain.setTargetAtTime(
    clamp(masterMixSettings.volume, 0, 100) / 100,
    now,
    0.01
  );

  if (limiter) {
    limiter.threshold.setTargetAtTime(
      clamp(masterMixSettings.limiter, -24, 0),
      now,
      0.01
    );
  }

  const reverbAmount =
    clamp(masterMixSettings.reverb, 0, 100) / 100;

  reverbDryGain?.gain.setTargetAtTime(
    1,
    now,
    0.01
  );

  reverbWetGain?.gain.setTargetAtTime(
    reverbAmount,
    now,
    0.01
  );
}

export function setMasterMixEqBand(index, value) {
  if (index < 0 || index >= 8) return;
  masterMixSettings.eq[index] = clamp(Number(value) || 0, -12, 12);
  applyMasterMixSettings();
}

export function setMasterMixVolume(value) {
  masterMixSettings.volume = clamp(Number(value) || 0, 0, 100);
  applyMasterMixSettings();
}

export function setMasterLimiterThreshold(value) {
  masterMixSettings.limiter = clamp(Number(value) || 0, -24, 0);
  applyMasterMixSettings();
}

export function setMasterReverb(value) {
  masterMixSettings.reverb = clamp(Number(value) || 0, 0, 100);
  applyMasterMixSettings();
}

export function getMasterMixMeterData() {
  /*
   * Audio初期化前も新しいObjectを作らず、
   * 同じmeterデータを0にして返す。
   */
  if (
    !context ||
    !spectrumAnalyser ||
    !outputAnalyser
  ) {
    masterMixMeterData.bands.fill(0);
    masterMixMeterData.level = 0;
    masterMixMeterData.limiterReduction = 0;

    return masterMixMeterData;
  }

  /*
   * Analyserサイズが変わった時だけ確保。
   * 通常再生中は同じ配列を使い続ける。
   */
  if (
    !spectrumData ||
    spectrumData.length !==
      spectrumAnalyser.frequencyBinCount
  ) {
    spectrumData =
      new Uint8Array(
        spectrumAnalyser.frequencyBinCount
      );
  }

  if (
    !outputTimeData ||
    outputTimeData.length !==
      outputAnalyser.fftSize
  ) {
    outputTimeData =
      new Uint8Array(
        outputAnalyser.fftSize
      );
  }

  spectrumAnalyser.getByteFrequencyData(
    spectrumData
  );

  outputAnalyser.getByteTimeDomainData(
    outputTimeData
  );

  const nyquist =
    context.sampleRate / 2;

  const binHz =
    nyquist /
    spectrumAnalyser.frequencyBinCount;

  /*
   * 8バンドを既存のFloat32Arrayへ直接書く。
   * map()による新規Array生成を行わない。
   */
  for (
    let bandIndex = 0;
    bandIndex < 8;
    bandIndex++
  ) {
    const startBin =
      Math.max(
        0,
        Math.floor(
          EQ_BAND_EDGES[bandIndex] /
            binHz
        )
      );

    const endBin =
      Math.min(
        spectrumData.length - 1,
        Math.ceil(
          EQ_BAND_EDGES[
            bandIndex + 1
          ] /
            binHz
        )
      );

    let bandPeak = 0;
    let sum = 0;
    let count = 0;

    for (
      let binIndex = startBin;
      binIndex <= endBin;
      binIndex++
    ) {
      const normalized =
        spectrumData[binIndex] / 255;

      if (normalized > bandPeak) {
        bandPeak = normalized;
      }

      sum += normalized;
      count++;
    }

    const average =
      count > 0
        ? sum / count
        : 0;

    masterMixMeterData.bands[
      bandIndex
    ] =
      clamp(
        bandPeak * 0.55 +
          average * 0.75,
        0,
        1
      );
  }

  /*
   * Master output level
   */
  let sumSquares = 0;
  let outputPeak = 0;

  for (
    let index = 0;
    index < outputTimeData.length;
    index++
  ) {
    const value =
      (
        outputTimeData[index] -
        128
      ) /
      128;

    const absolute =
      Math.abs(value);

    if (absolute > outputPeak) {
      outputPeak = absolute;
    }

    sumSquares +=
      value * value;
  }

  const rms =
    Math.sqrt(
      sumSquares /
        Math.max(
          1,
          outputTimeData.length
        )
    );

  masterMixMeterData.level =
    clamp(
      outputPeak * 0.7 +
        rms * 1.1,
      0,
      1
    );

  masterMixMeterData.limiterReduction =
    limiter
      ? Math.max(
          0,
          -(
            Number(
              limiter.reduction
            ) || 0
          )
        )
      : 0;

  return masterMixMeterData;
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
  delaySeconds = 0,
  options = {}
) {
  await initializeAudio();

  /*
   * Pin指定があるStepだけ、Sound一式をPinへ完全置換する。
   * Main Trackのstep/length/mute等はそのまま使い、
   * 音色データだけを差し替える。
   */
  const soundTrack =
    resolveStepSound(
      track,
      stepIndex
    );

  /*
 * Oscillator、Envelope、FM変調を
 * 必ず同じ未来時刻から開始する。
 *
 * 現在時刻ぴったりへ予約すると、
 * ノード生成中に開始時刻を過ぎてしまい、
 * 強いFMでトリガー位相が不安定に
 * 聞こえる場合がある。
 */
const requestedStartTime =
  context.currentTime +
  Math.max(
    0,
    Number(delaySeconds) || 0
  );

const minimumStartTime =
  context.currentTime +
  0.03;

const now =
  Math.max(
    requestedStartTime,
    minimumStartTime
  );

  const bpm =
    Number(
      document.getElementById("bpm-input")?.value
    ) || 120;

  const usingPin =
    soundTrack !== track;

  const offset = id => {
    /*
     * Main Sound：従来どおり全Offsetを使用。
     * Pin Sound ：原則Offset無効。
     *              ただしTrack Volume（velocity）だけは
     *              Main側Step Offsetを共通で使用する。
     */
    if (usingPin) {
      if (id === "velocity") {
        return (
          track.offsets.velocity?.[stepIndex] ??
          0
        );
      }

      return 0;
    }

    return (
      track.offsets[id]?.[stepIndex] ??
      0
    );
  };

  const note =
    60 +
    soundTrack.base.note +
    offset("note");

  const chordIndex = clamp(
    Math.round((soundTrack.base.chord ?? 0) + offset("chord")),
    0,
    CHORD_NAMES.length - 1
  );

  const chordVoices = clamp(
    Math.round((soundTrack.base.voices ?? 4) + offset("voices")),
    1,
    4
  );

  const chordInversion = clamp(
    Math.round((soundTrack.base.inversion ?? 0) + offset("inversion")),
    0,
    3
  );

  const chordNoteOffsets = resolveChordNoteOffsets(
    chordIndex,
    chordVoices,
    chordInversion,
  );

  let chordNotes = chordNoteOffsets.map(interval => note + interval);

  /* MIDI域を外れる場合は、構成音間隔を保ったままコード全体をoctave移動する。 */
  while (Math.max(...chordNotes) > 127) {
    chordNotes = chordNotes.map(value => value - 12);
  }

  while (Math.min(...chordNotes) < 0) {
    chordNotes = chordNotes.map(value => value + 12);
  }

  /* =========================
   * Articulation
   * ========================= */
  const glideValue = clamp(
    Math.round(
      (soundTrack.base.glide ?? 0) +
      offset("glide")
    ),
    0,
    8
  );

  const strumValue = clamp(
    Math.round(
      (soundTrack.base.strum ?? 0) +
      offset("strum")
    ),
    -3,
    3
  );

  const stepSeconds =
    (60 / Math.max(1, bpm)) / 4;

  const glideStepRatios = [
    0, 0.125, 0.25, 0.5,
    0.75, 1, 1.5, 2, 3
  ];

  const glideDuration =
    glideValue > 0
      ? stepSeconds *
        glideStepRatios[glideValue]
      : 0;

  const strumGapSeconds =
    Math.abs(strumValue) *
    ((60 / Math.max(1, bpm)) / 64);

  const maximumStrumDelay =
    chordNotes.length > 1
      ? (chordNotes.length - 1) *
        strumGapSeconds
      : 0;

  const previousVoice =
    activeTrackVoices.get(track.id);

  function previousPitchAt(trajectory, time) {
    if (!trajectory) {
      return null;
    }

    const startNote =
      Number(trajectory.startNote);
    const targetNote =
      Number(trajectory.targetNote);

    if (!Number.isFinite(startNote) || !Number.isFinite(targetNote)) {
      return null;
    }

    const startTime =
      Number(trajectory.startTime) || 0;
    const endTime =
      Number(trajectory.endTime) || startTime;

    if (time <= startTime || endTime <= startTime) {
      return startNote;
    }

    if (time >= endTime) {
      return targetNote;
    }

    const progress =
      clamp(
        (time - startTime) /
          (endTime - startTime),
        0,
        1
      );

    return startNote +
      (targetNote - startNote) *
      progress;
  }

  const previousTrajectories =
    previousVoice?.endTime > now &&
    Array.isArray(previousVoice.pitchTrajectories)
      ? previousVoice.pitchTrajectories
      : [];

  const glideStartNotes =
    chordNotes.map((targetNote, voiceIndex) => {
      if (
        glideValue <= 0 ||
        previousTrajectories.length === 0
      ) {
        return targetNote;
      }

      /*
       * 実音を低い順に並べ、高音側を優先して対応。
       * voice数が変化した場合も上側の対応を維持する。
       */
      const previousIndex = clamp(
        voiceIndex +
          previousTrajectories.length -
          chordNotes.length,
        0,
        previousTrajectories.length - 1
      );

      return previousPitchAt(
        previousTrajectories[previousIndex],
        now
      ) ?? targetNote;
    });

  const velocityScale =
    clamp(
      Number(options.velocityScale) || 1,
      0,
      1
    );

  const velocity =
    (
      clamp(
        soundTrack.base.velocity +
        offset("velocity"),
        0,
        100
      ) / 100
    ) *
    velocityScale;

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
          soundTrack.base[
            `${prefix}Target`
          ] !== targetId
        ) {
          return;
        }

        const depth =
          clamp(
            (
              soundTrack.base[
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
          soundTrack.base[
            `${prefix}SyncMode`
          ] === "bpm"
            ? "bpm"
            : "free";

        const rateValue =
          clamp(
            (
              soundTrack.base[
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
          soundTrack.base[
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
      (soundTrack.base.attack ?? 1) +
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
      (soundTrack.base.decay ?? 5) +
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
      (soundTrack.base.sustain ?? 0) +
        offset("sustain"),
      0,
      100
    ) / 100;

  const gateValue =
  clamp(
    (soundTrack.base.gate ?? 5) +
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
      (soundTrack.base.sineVolume ?? 100) +
        offset("sineVolume"),
      0,
      100
    ) / 100;

  const sineDecay =
    Math.max(
      0.03,
      clamp(
        (soundTrack.base.sineDecay ?? 5) +
          offset("sineDecay"),
        1,
        100
      ) / 10
    );

  const noiseVolume =
    clamp(
      (soundTrack.base.noiseVolume ?? 0) +
        offset("noiseVolume"),
      0,
      100
    ) / 100;

  const noiseDecay =
    Math.max(
      0.03,
      clamp(
        (soundTrack.base.noiseDecay ?? 5) +
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
      soundTrack.base.fmDepth +
      offset("fmDepth"),
      0,
      20
    );

  const filterCutoff =
    clamp(
      (soundTrack.base.filterCutoff ?? 0) +
        offset("filterCutoff"),
      -100,
      100
    );

  const filterResonance =
    clamp(
      (soundTrack.base.filterResonance ?? 0) +
        offset("filterResonance"),
      0,
      100
    );

  const panValue =
    (
      clamp(
        soundTrack.base.pan +
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
  soundTrack.fxMuted
    ? 0
    : clamp(
        (soundTrack.base.delay ?? 0) +
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
    (soundTrack.base.delayTime ?? 4) +
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
    (soundTrack.base.delayFeedback ?? 35) +
      offset("delayFeedback"),
    0,
    95
  ) / 100;

  const crushLevel =
    soundTrack.fxMuted
      ? 0
      : clamp(
          (soundTrack.base.crushLevel ?? 0) +
            offset("crushLevel"),
          0,
          100
        ) / 100;

  const crushBit = clamp(
    Math.round(
      (soundTrack.base.crushBit ?? 8) +
        offset("crushBit")
    ),
    1,
    16
  );

  const crushRateValues = [
    1, 2, 4, 8, 16, 32
  ];

  const crushRateBaseIndex =
    crushRateValues.reduce(
      (bestIndex, value, index) =>
        Math.abs(value - (soundTrack.base.crushRate ?? 4)) <
        Math.abs(crushRateValues[bestIndex] - (soundTrack.base.crushRate ?? 4))
          ? index
          : bestIndex,
      0
    );

  const crushRateIndex = clamp(
    crushRateBaseIndex +
      Math.round(offset("crushRate")),
    0,
    crushRateValues.length - 1
  );

  const crushRate =
    crushRateValues[
      crushRateIndex
    ];

  const panner =
  context.createStereoPanner();

const filter1 =
  context.createBiquadFilter();

const filter2 =
  context.createBiquadFilter();

const gateEnd =
  now + gate + maximumStrumDelay;

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
    soundTrack.base[
      `${prefix}Target`
    ];

  if (target !== "pan") {
    return;
  }

  const lfoDepth =
    clamp(
      (
        soundTrack.base[
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
  soundTrack.base[
    `${prefix}SyncMode`
  ] === "bpm"
    ? "bpm"
    : "free";

const lfoRate =
  clamp(
    (
      soundTrack.base[
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
  soundTrack.base[
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
      soundTrack.base[
        `${prefix}Target`
      ] !== "filterCutoff"
    ) {
      return;
    }

    const lfoDepth =
      clamp(
        (
          soundTrack.base[
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
      soundTrack.base[
        `${prefix}SyncMode`
      ] === "bpm"
        ? "bpm"
        : "free";

    const lfoRate =
      clamp(
        (
          soundTrack.base[
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
      soundTrack.base[
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

/*
 * 同じTrackの前音を、
 * 今回の発音開始時刻までに閉じる。
 *
 * 新旧Voiceを重ねないことで、
 * FM波形同士の位相干渉を防ぐ。
 */
if (
  previousVoice?.gainNode
) {
  const previousGain =
    previousVoice.gainNode.gain;

  const chokeStart =
    Math.max(
      context.currentTime,
      now - 0.003
    );

  if (
    typeof previousGain
      .cancelAndHoldAtTime ===
    "function"
  ) {
    previousGain.cancelAndHoldAtTime(
      chokeStart
    );
  } else {
    previousGain.cancelScheduledValues(
      chokeStart
    );

    previousGain.setValueAtTime(
      0.001,
      chokeStart
    );
  }

  previousGain.exponentialRampToValueAtTime(
    0.0001,
    now
  );
}
  
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

/*
 * 今回の発音をTrackの最新Voiceとして登録。
 *
 * 次の同一Track発音時に、
 * このGainが短く閉じられる。
 */
activeTrackVoices.set(
  track.id,
  {
    gainNode: mixGain,
    startTime: now,
    endTime: releaseEnd,
    pitchTrajectories:
      sineVolume > 0
        ? chordNotes.map(
            (targetNote, voiceIndex) => {
              const strumVoiceIndex =
                strumValue < 0
                  ? chordNotes.length - 1 - voiceIndex
                  : voiceIndex;

              const voiceDelay =
                chordNotes.length > 1
                  ? strumVoiceIndex * strumGapSeconds
                  : 0;

              const trajectoryStart =
                now + voiceDelay;

              return {
                startNote: glideStartNotes[voiceIndex] ?? targetNote,
                targetNote,
                startTime: trajectoryStart,
                endTime:
                  glideDuration > 0
                    ? trajectoryStart + glideDuration
                    : trajectoryStart
              };
            }
          )
        : []
  }
);

mixGain
  .connect(filter1)
  .connect(filter2)
  .connect(panner);

  /*
   * FX1 Delay → FX2 CRUSH の順で処理するため、
   * まずPan後の信号をFXバスへまとめる。
   */
  const fxInput =
    context.createGain();

  panner.connect(fxInput);

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
      .connect(fxInput);

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

  /*
   * FX2：Bit Crusher
   *
   * BIT / RATEで完成したWet音を作り、
   * CRUSH LEVELでDry/Wetを混ぜる。
   * LEVEL 0は完全Dry、100は完全Wet。
   */
  if (crushLevel > 0 && bitCrusherWorkletReady) {
    const dryGain =
      context.createGain();

    const wetGain =
      context.createGain();

    let crusherNode = null;

    try {
      crusherNode =
        new AudioWorkletNode(
          context,
          "sprooto-bit-crusher",
          {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
          }
        );

      crusherNode.parameters
        .get("bitDepth")
        ?.setValueAtTime(
          crushBit,
          now
        );

      crusherNode.parameters
        .get("rateReduction")
        ?.setValueAtTime(
          crushRate,
          now
        );

      dryGain.gain.setValueAtTime(
        1 - crushLevel,
        now
      );

      wetGain.gain.setValueAtTime(
        crushLevel,
        now
      );

      fxInput
        .connect(dryGain)
        .connect(mixInput);

      fxInput
        .connect(crusherNode)
        .connect(wetGain)
        .connect(mixInput);
    } catch (error) {
      console.warn(
        "Bit crusher node unavailable:",
        error
      );

      fxInput.connect(mixInput);
    }
  } else {
    fxInput.connect(mixInput);
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
    const voiceGainScale = 1 / Math.sqrt(Math.max(1, chordNotes.length));

    for (
      let voiceIndex = 0;
      voiceIndex < chordNotes.length;
      voiceIndex++
    ) {
    const voiceNote =
      chordNotes[voiceIndex];

    const glideStartNote =
      glideStartNotes[voiceIndex] ??
      voiceNote;

    const strumVoiceIndex =
      strumValue < 0
        ? chordNotes.length - 1 - voiceIndex
        : voiceIndex;

    const voiceStartDelay =
      chordNotes.length > 1
        ? strumVoiceIndex *
          strumGapSeconds
        : 0;

    const voiceStartTime =
      now + voiceStartDelay;

    const sineSource =
      context.createBufferSource();

    const sineGain =
      context.createGain();

    const carrierFrequency =
      frequency(voiceNote);

    const sineStopAt =
      releaseEnd + 0.01;

    const bufferDuration =
      Math.max(
        0.001,
        sineStopAt - now
      );

    const sampleRate =
      context.sampleRate;

    const sampleCount =
      Math.max(
        1,
        Math.ceil(
          bufferDuration *
          sampleRate
        )
      );

    /*
     * Pitch / FM Depth LFOを
     * AudioBuffer生成時に同じ時間軸へ統合する。
     *
     * 周期波形は毎トリガー位相0から開始し、
     * Randomだけは発音ごとに変化する。
     */
    function bufferLfoConfig(
      lfoNumber,
      target
    ) {
      const prefix =
        `lfo${lfoNumber}`;

      if (
        soundTrack.base[
          `${prefix}Target`
        ] !== target
      ) {
        return null;
      }

      const lfoDepth =
        clamp(
          (
            soundTrack.base[
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
        return null;
      }

      const syncMode =
        soundTrack.base[
          `${prefix}SyncMode`
        ] === "bpm"
          ? "bpm"
          : "free";

      const rateValue =
        clamp(
          (
            soundTrack.base[
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

      return {
        depth: lfoDepth,
        rateHz:
          lfoRateToHz(
            rateValue,
            syncMode,
            bpm
          ),
        wave:
          soundTrack.base[
            `${prefix}Wave`
          ] ?? "sine"
      };
    }

    const pitchLfos =
      [1, 2]
        .map(lfoNumber =>
          bufferLfoConfig(
            lfoNumber,
            "pitch"
          )
        )
        .filter(Boolean);

    const fmDepthLfos =
      [1, 2]
        .map(lfoNumber =>
          bufferLfoConfig(
            lfoNumber,
            "fmDepth"
          )
        )
        .filter(Boolean);

    const hasRandomLfo =
      [
        ...pitchLfos,
        ...fmDepthLfos
      ].some(
        config =>
          config.wave === "random"
      );

    function makeRandomState(
      config
    ) {
      if (
        config.wave !== "random"
      ) {
        return null;
      }

      return {
        interval:
          1 /
          Math.max(
            0.001,
            config.rateHz
          ),
        nextTime: 0,
        value:
          Math.random() * 2 - 1
      };
    }

    const pitchRandomStates =
      pitchLfos.map(
        makeRandomState
      );

    const fmRandomStates =
      fmDepthLfos.map(
        makeRandomState
      );

    function lfoWaveValue(
      config,
      elapsedSeconds,
      randomState
    ) {
      const wave =
        config.wave;

      if (
        wave === "random"
      ) {
        while (
          elapsedSeconds >=
          randomState.nextTime
        ) {
          randomState.value =
            Math.random() * 2 - 1;

          randomState.nextTime +=
            randomState.interval;
        }

        return randomState.value;
      }

      const rateHz =
        Math.max(
          0.001,
          config.rateHz
        );

      if (
        wave === "rise" ||
        wave === "fall"
      ) {
        const progress =
          clamp(
            elapsedSeconds *
              rateHz,
            0,
            1
          );

        const startValue =
          wave === "fall"
            ? 1
            : -1;

        return (
          startValue *
          (1 - progress)
        );
      }

      const phase =
        2 *
        Math.PI *
        rateHz *
        elapsedSeconds;

      switch (wave) {
        case "triangle":
          return (
            2 /
            Math.PI
          ) *
            Math.asin(
              Math.sin(phase)
            );

        case "square":
          return (
            Math.sin(phase) >= 0
              ? 1
              : -1
          );

        case "sawUp": {
          const cyclePosition =
            (
              elapsedSeconds *
              rateHz
            ) % 1;

          return (
            cyclePosition * 2 - 1
          );
        }

        case "sawDown": {
          const cyclePosition =
            (
              elapsedSeconds *
              rateHz
            ) % 1;

          return (
            1 - cyclePosition * 2
          );
        }

        case "sine":
        default:
          return Math.sin(phase);
      }
    }

    const fmFeedbackNormalized =
  clamp(
    (
      Number(
        soundTrack.base.fmFeedback
      ) || 0
    ) +
      offset(
        "fmFeedback"
      ),
    0,
    50
  ) / 50;

    const fmFeedbackStrength =
      Math.pow(
        fmFeedbackNormalized,
        1.2
      ) * 1.8;

    const fmRatio =
  clamp(
    (
      Number(
        soundTrack.base.fmRatio
      ) || 1
    ) +
      offset(
        "fmRatio"
      ),
    0.25,
    8
  );

    const modulatorFrequency =
      carrierFrequency *
      fmRatio;

    const baseFmAmount =
      carrierFrequency *
      depth *
      0.1;

    const cacheDescriptor = {
      sampleRate,
      sampleCount,
      carrierFrequency,
      modulatorFrequency,
      baseFmAmount,
      fmFeedbackStrength,
      pitchLfos,
      fmDepthLfos,
      glideStartNote,
      glideTargetNote: voiceNote,
      glideDuration
    };

    const cacheKey =
      hasRandomLfo
        ? null
        : JSON.stringify(
            cacheDescriptor
          );

    let sineBuffer =
      cacheKey
        ? fmBufferCache.get(
            cacheKey
          )
        : null;

    if (!sineBuffer) {
      sineBuffer =
        context.createBuffer(
          1,
          sampleCount,
          sampleRate
        );

      const samples =
        sineBuffer.getChannelData(0);

      let carrierPhase = 0;
      let modulatorPhase = 0;

      for (
        let sampleIndex = 0;
        sampleIndex < sampleCount;
        sampleIndex++
      ) {
        const elapsedSeconds =
          sampleIndex /
          sampleRate;

        let pitchCents = 0;

        pitchLfos.forEach(
          (config, index) => {
            const amountCents =
              (
                config.wave === "rise" ||
                config.wave === "fall"
                  ? oneShotPitchDepthToCents(
                      config.depth
                    )
                  : lfoDepthToCents(
                      config.depth
                    )
              );

            pitchCents +=
              lfoWaveValue(
                config,
                elapsedSeconds,
                pitchRandomStates[index]
              ) *
              amountCents;
          }
        );

        const glideProgress =
          glideDuration > 0
            ? clamp(
                elapsedSeconds /
                  glideDuration,
                0,
                1
              )
            : 1;

        const currentBaseNote =
          glideStartNote +
          (voiceNote - glideStartNote) *
          glideProgress;

        const currentBaseFrequency =
          frequency(currentBaseNote);

        const currentCarrierFrequency =
          currentBaseFrequency *
          Math.pow(
            2,
            pitchCents / 1200
          );

        let fmAmount =
          baseFmAmount;

        fmDepthLfos.forEach(
          (config, index) => {
            fmAmount +=
              lfoWaveValue(
                config,
                elapsedSeconds,
                fmRandomStates[index]
              ) *
              baseFmAmount *
              (config.depth / 100);
          }
        );

        fmAmount =
          clamp(
            fmAmount,
            0,
            baseFmAmount * 2
          );

        let modulatorValue =
          Math.sin(
            modulatorPhase
          );

        if (
          fmFeedbackStrength > 0
        ) {
          for (
            let harmonic = 2;
            harmonic <= 12;
            harmonic++
          ) {
            modulatorValue +=
              (
                fmFeedbackStrength /
                harmonic
              ) *
              Math.sin(
                modulatorPhase *
                harmonic
              );
          }
        }

        const instantaneousFrequency =
          currentCarrierFrequency +
          modulatorValue *
          fmAmount;

        samples[sampleIndex] =
          Math.sin(
            carrierPhase
          );

        carrierPhase +=
          2 *
          Math.PI *
          instantaneousFrequency /
          sampleRate;

        modulatorPhase +=
          2 *
          Math.PI *
          (currentBaseFrequency * fmRatio) /
          sampleRate;

        /*
         * 長時間発音でも数値が巨大化しないよう、
         * 位相を定期的に1周期内へ戻す。
         */
        if (
          carrierPhase >
          Math.PI * 2
        ) {
          carrierPhase %=
            Math.PI * 2;
        }

        if (
          modulatorPhase >
          Math.PI * 2
        ) {
          modulatorPhase %=
            Math.PI * 2;
        }
      }

      if (cacheKey) {
        fmBufferCache.set(
          cacheKey,
          sineBuffer
        );

        if (
          fmBufferCache.size >
          FM_BUFFER_CACHE_LIMIT
        ) {
          const oldestKey =
            fmBufferCache.keys()
              .next().value;

          fmBufferCache.delete(
            oldestKey
          );
        }
      }
    }

    sineSource.buffer =
      sineBuffer;

    sineGain.gain.setValueAtTime(
      Math.max(
        0.0001,
        sineVolume * voiceGainScale
      ),
      voiceStartTime
    );

    sineSource
      .connect(sineGain)
      .connect(mixGain);

    sineSource.start(voiceStartTime);
    sineSource.stop(
      sineStopAt + voiceStartDelay
    );
    }
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

/*
 * この発音がまだTrackの最新Voiceなら、
 * 終了後に参照を削除する。
 */
const registeredVoice =
  activeTrackVoices.get(
    track.id
  );

window.setTimeout(
  () => {
    if (
      activeTrackVoices.get(
        track.id
      ) === registeredVoice
    ) {
      activeTrackVoices.delete(
        track.id
      );
    }
  },
  Math.max(
    10,
    (
      releaseEnd -
      context.currentTime +
      0.05
    ) *
      1000
  )
);

}

export function resumeAudio() {
  resumeAudioContext();
}