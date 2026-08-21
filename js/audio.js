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
let fmVoiceWorkletReady = null;
let audioClockReady = false;
let audioClockReadyPromise = null;
let offlineRenderMode = false;

/*
 * White Noise buffer cache
 *
 * Noise発音ごとに巨大なAudioBufferを作り直さず、
 * AudioContextごとに1つの共有Bufferを使い回す。
 */
let sharedNoiseBuffer = null;
let sharedNoiseBufferContext = null;
const SHARED_NOISE_SECONDS = 4;

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
 * Track Reverb
 *
 * Sizeは内部的に8段階のImpulseへ量子化する。
 * 同じSizeは全Trackで同じConvolver Busを共有するため、
 * 発音ごとに重いDSPノードを生成しない。
 */
const TRACK_REVERB_BUCKET_COUNT = 8;
const trackReverbImpulseCache = [];
const trackReverbBuses = new Map();

async function ensureAudioClockReady() {
  if (!context) {
    return;
  }

  if (audioClockReady) {
    return;
  }

  if (!audioClockReadyPromise) {
    audioClockReadyPromise =
      new Promise(resolve => {
        const startAudioTime =
          context.currentTime;

        const checkClock = () => {
          if (!context) {
            audioClockReadyPromise = null;
            resolve();
            return;
          }

          if (
            context.state === "running" &&
            context.currentTime -
              startAudioTime >= 0.03
          ) {
            audioClockReady = true;
            audioClockReadyPromise = null;
            resolve();
            return;
          }

          window.setTimeout(
            checkClock,
            4
          );
        };

        checkClock();
      });
  }

  await audioClockReadyPromise;
}

function resumeAudioContext() {
  if (
    context &&
    context.state === "suspended"
  ) {
    audioClockReady = false;
    audioClockReadyPromise = null;

    context
      .resume()
      .then(() =>
        ensureAudioClockReady()
      )
      .catch(() => {});
  }
}

async function initializeFmVoiceWorklet() {
  if (!context?.audioWorklet) {
    return false;
  }

  if (!fmVoiceWorkletReady) {
    const processorSource = `
      class SprootoFmVoiceProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          const p = options.processorOptions || {};
          this.startTime = Number(p.startTime) || 0;
          this.stopTime = Number(p.stopTime) || this.startTime;
          this.startNote = Number(p.startNote) || 60;
          this.targetNote = Number(p.targetNote) || this.startNote;
          this.glideDuration = Math.max(0, Number(p.glideDuration) || 0);
          this.fmDepth = Math.max(0, Number(p.fmDepth) || 0);
          this.fmRatio = Math.max(0.25, Number(p.fmRatio) || 1);
          this.fmFeedbackStrength = Math.max(0, Number(p.fmFeedbackStrength) || 0);
          this.pitchLfos = Array.isArray(p.pitchLfos) ? p.pitchLfos : [];
          this.fmDepthLfos = Array.isArray(p.fmDepthLfos) ? p.fmDepthLfos : [];
          this.carrierPhase = 0;
          this.modulatorPhase = 0;
          this.pitchRandomStates = this.pitchLfos.map(config => this.makeRandomState(config));
          this.fmRandomStates = this.fmDepthLfos.map(config => this.makeRandomState(config));
        }

        frequency(note) {
          return 440 * Math.pow(2, (note - 69) / 12);
        }

        clamp(value, min, max) {
          return Math.min(max, Math.max(min, value));
        }

        makeRandomState(config) {
          if (config.wave !== "random") return null;
          return {
            interval: 1 / Math.max(0.001, Number(config.rateHz) || 1),
            nextTime: 0,
            value: Math.random() * 2 - 1
          };
        }

        lfoWaveValue(config, elapsedSeconds, randomState) {
          const wave = config.wave;
          const rateHz = Math.max(0.001, Number(config.rateHz) || 1);

          if (wave === "random") {
            while (elapsedSeconds >= randomState.nextTime) {
              randomState.value = Math.random() * 2 - 1;
              randomState.nextTime += randomState.interval;
            }
            return randomState.value;
          }

          if (wave === "rise" || wave === "fall") {
            const progress = this.clamp(elapsedSeconds * rateHz, 0, 1);
            const startValue = wave === "fall" ? 1 : -1;
            return startValue * (1 - progress);
          }

          const phase = 2 * Math.PI * rateHz * elapsedSeconds;
          switch (wave) {
            case "triangle": return (2 / Math.PI) * Math.asin(Math.sin(phase));
            case "square": return Math.sin(phase) >= 0 ? 1 : -1;
            case "sawUp": return ((elapsedSeconds * rateHz) % 1) * 2 - 1;
            case "sawDown": return 1 - ((elapsedSeconds * rateHz) % 1) * 2;
            default: return Math.sin(phase);
          }
        }

        pitchDepthToCents(config) {
          const depth = this.clamp(Number(config.depth) || 0, 0, 100);
          return (config.wave === "rise" || config.wave === "fall")
            ? depth * 36
            : depth * 12;
        }

        process(inputs, outputs) {
          const output = outputs[0];
          const channel = output?.[0];
          if (!channel) return true;

          const blockStart = currentTime;
          if (blockStart >= this.stopTime) return false;

          for (let i = 0; i < channel.length; i++) {
            const sampleTime = blockStart + i / sampleRate;
            if (sampleTime < this.startTime || sampleTime >= this.stopTime) {
              channel[i] = 0;
              continue;
            }

            const elapsed = sampleTime - this.startTime;
            let pitchCents = 0;
            for (let n = 0; n < this.pitchLfos.length; n++) {
              const config = this.pitchLfos[n];
              pitchCents += this.lfoWaveValue(config, elapsed, this.pitchRandomStates[n]) * this.pitchDepthToCents(config);
            }

            const glideProgress = this.glideDuration > 0
              ? this.clamp(elapsed / this.glideDuration, 0, 1)
              : 1;
            const currentNote = this.startNote + (this.targetNote - this.startNote) * glideProgress;
            const baseFrequency = this.frequency(currentNote);
            const carrierFrequency = baseFrequency * Math.pow(2, pitchCents / 1200);
            const baseFmAmount = carrierFrequency * this.fmDepth * 0.1;
            let fmAmount = baseFmAmount;

            for (let n = 0; n < this.fmDepthLfos.length; n++) {
              const config = this.fmDepthLfos[n];
              fmAmount += this.lfoWaveValue(config, elapsed, this.fmRandomStates[n]) * baseFmAmount * ((Number(config.depth) || 0) / 100);
            }
            fmAmount = this.clamp(fmAmount, 0, baseFmAmount * 2);

            let modulatorValue = Math.sin(this.modulatorPhase);
            if (this.fmFeedbackStrength > 0) {
              for (let harmonic = 2; harmonic <= 12; harmonic++) {
                modulatorValue += (this.fmFeedbackStrength / harmonic) * Math.sin(this.modulatorPhase * harmonic);
              }
            }

            const instantaneousFrequency = carrierFrequency + modulatorValue * fmAmount;
            channel[i] = Math.sin(this.carrierPhase);
            this.carrierPhase += 2 * Math.PI * instantaneousFrequency / sampleRate;
            this.modulatorPhase += 2 * Math.PI * (baseFrequency * this.fmRatio) / sampleRate;

            if (this.carrierPhase > Math.PI * 2) this.carrierPhase %= Math.PI * 2;
            if (this.modulatorPhase > Math.PI * 2) this.modulatorPhase %= Math.PI * 2;
          }
          return true;
        }
      }

      registerProcessor("sprooto-fm-voice", SprootoFmVoiceProcessor);
    `;

    const blob = new Blob([processorSource], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    fmVoiceWorkletReady = context.audioWorklet
      .addModule(url)
      .then(() => true)
      .catch(error => {
        console.warn("FM AudioWorklet unavailable:", error);
        return false;
      })
      .finally(() => URL.revokeObjectURL(url));
  }

  return fmVoiceWorkletReady;
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
    audioClockReady = false;
    audioClockReadyPromise = null;
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

    /*
 * Track Reverb用IRとConvolver Busを
 * Audio開始時にすべて事前生成する。
 *
 * 再生中のSEND / SIZE操作では
 * 既存Busを取得するだけにする。
 */
initializeTrackReverbBuses();

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

  await Promise.all([
    initializeBitCrusherWorklet(),
    initializeFmVoiceWorklet()
  ]);

  if (offlineRenderMode) {
    return;
  }

  if (context.state === "suspended") {
    audioClockReady = false;
    audioClockReadyPromise = null;
    await context.resume();
  }

  await ensureAudioClockReady();
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
    let seed = (0x5f3759df + channel * 104729) >>> 0;

    const nextRandom = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 0xffffffff) * 2 - 1;
    };

    for (let index = 0; index < length; index++) {
      const progress = index / length;
      const envelope = Math.pow(1 - progress, 2.6);
      data[index] = nextRandom() * envelope;
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

function getSharedNoiseBuffer() {
  /*
   * Offline exportではcontext自体が差し替わるため、
   * 現在のAudioContext専用Bufferだけを再利用する。
   */
  if (
    sharedNoiseBuffer &&
    sharedNoiseBufferContext === context
  ) {
    return sharedNoiseBuffer;
  }

  const size =
    Math.max(
      1,
      Math.ceil(
        context.sampleRate *
          SHARED_NOISE_SECONDS
      )
    );

  const buffer =
    context.createBuffer(
      1,
      size,
      context.sampleRate
    );

  const data =
    buffer.getChannelData(0);

  for (
    let index = 0;
    index < size;
    index++
  ) {
    data[index] =
      Math.random() * 2 - 1;
  }

  sharedNoiseBuffer =
    buffer;

  sharedNoiseBufferContext =
    context;

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

function trackReverbBucketIndex(
  sizeValue
) {
  /* UI / 保存値は1〜8。内部bucketは0〜7。 */
  return clamp(
    Math.round(Number(sizeValue) || 5) - 1,
    0,
    TRACK_REVERB_BUCKET_COUNT - 1
  );
}

function createTrackReverbImpulse(
  bucketIndex
) {
  const safeIndex =
    clamp(
      Math.round(
        Number(bucketIndex) || 0
      ),
      0,
      TRACK_REVERB_BUCKET_COUNT - 1
    );

  const size =
    TRACK_REVERB_BUCKET_COUNT > 1
      ? safeIndex /
        (
          TRACK_REVERB_BUCKET_COUNT -
          1
        )
      : 0;

  /*
   * SIZE 0でも明確な小Room。
   * SIZE 100で長いHall。
   *
   * 以前より最小値を長くして、
   * SENDだけ上げても「残響」と認識できるようにする。
   */
  const duration =
    0.55 +
    2.45 *
      Math.pow(
        size,
        1.12
      );

  /*
   * SIZEが大きいほど
   * Tailをゆっくり減衰させる。
   */
  const decayPower =
    4.2 -
    2.35 * size;

  /*
   * 原音直後にWetを重ねず、
   * わずかな時間差を作る。
   *
   * 小Room：約7ms
   * 大Hall：約24ms
   */
  const preDelaySeconds =
    0.007 +
    0.017 * size;

  const sampleRate =
    context.sampleRate;

  const length =
    Math.max(
      1,
      Math.floor(
        sampleRate *
          duration
      )
    );

  const preDelaySamples =
    Math.floor(
      sampleRate *
        preDelaySeconds
    );

  const buffer =
    context.createBuffer(
      2,
      length,
      sampleRate
    );

  for (
    let channel = 0;
    channel < 2;
    channel++
  ) {
    const data =
      buffer.getChannelData(
        channel
      );

    /*
     * deterministic LCG
     */
    let seed =
      (
        0x1234567 +
        safeIndex * 7919 +
        channel * 104729
      ) >>> 0;

    function nextRandom() {
      seed =
        (
          Math.imul(
            seed,
            1664525
          ) +
          1013904223
        ) >>> 0;

      return (
        seed /
        0xffffffff
      ) *
        2 -
        1;
    }

    /*
     * =========================
     * Early Reflections
     * =========================
     *
     * 数本の反射だけを先に配置。
     * 「部屋の輪郭」はここで作る。
     */
    const reflectionCount =
      5 +
      Math.round(
        size * 5
      );

    for (
      let reflectionIndex = 0;
      reflectionIndex <
        reflectionCount;
      reflectionIndex++
    ) {
      const reflectionProgress =
        reflectionCount <= 1
          ? 0
          : reflectionIndex /
            (
              reflectionCount -
              1
            );

      const reflectionDelay =
        preDelaySeconds +
        0.012 +
        reflectionProgress *
          (
            0.045 +
            size * 0.075
          ) +
        nextRandom() *
          0.003;

      const sampleIndex =
        Math.floor(
          reflectionDelay *
            sampleRate
        );

      if (
        sampleIndex < 0 ||
        sampleIndex >= length
      ) {
        continue;
      }

      const reflectionGain =
        (
          0.42 -
          reflectionProgress *
            0.24
        ) *
        (
          0.85 +
          nextRandom() *
            0.15
        );

      data[sampleIndex] +=
        reflectionGain;
    }

    /*
     * =========================
     * Diffuse Reverb Tail
     * =========================
     */
    let smoothedNoise = 0;

    for (
      let index =
        preDelaySamples;
      index < length;
      index++
    ) {
      const tailIndex =
        index -
        preDelaySamples;

      const tailLength =
        Math.max(
          1,
          length -
            preDelaySamples
        );

      const progress =
        tailIndex /
        Math.max(
          1,
          tailLength - 1
        );

      /*
       * ノイズを少し平滑化。
       */
      const random =
        nextRandom();

      smoothedNoise =
        smoothedNoise * 0.48 +
        random * 0.52;

      /*
       * Tail開始直後を少し抑え、
       * 約20〜45msかけて立ち上げる。
       *
       * これで原音に即座に張り付かず、
       * 「後ろへ残る」感じを作る。
       */
      const buildupSeconds =
        0.020 +
        size * 0.025;

      const buildupSamples =
        Math.max(
          1,
          buildupSeconds *
            sampleRate
        );

      const buildup =
        Math.min(
          1,
          tailIndex /
            buildupSamples
        );

      /*
       * SIZEに応じた減衰。
       */
      const envelope =
        Math.pow(
          1 - progress,
          decayPower
        );

      /*
       * 大きいSIZEでは少しTailを強調。
       */
      const tailLevel =
        0.58 +
        size * 0.22;

      data[index] +=
        smoothedNoise *
        buildup *
        envelope *
        tailLevel;
    }
  }

  return buffer;
}

function initializeTrackReverbImpulses() {
  if (!context) {
    return;
  }

  if (
    trackReverbImpulseCache.length ===
    TRACK_REVERB_BUCKET_COUNT
  ) {
    return;
  }

  trackReverbImpulseCache.length = 0;

  for (
    let index = 0;
    index <
      TRACK_REVERB_BUCKET_COUNT;
    index++
  ) {
    trackReverbImpulseCache.push(
      createTrackReverbImpulse(
        index
      )
    );
  }
}

function ensureTrackReverbBus(
  sizeValue
) {
  if (
    !context ||
    !mixInput
  ) {
    return null;
  }

  const bucketIndex =
    trackReverbBucketIndex(
      sizeValue
    );

  /*
   * Offline exportでは使用bucketだけIRを生成する。
   * 通常再生時の事前生成仕様はinitializeTrackReverbBuses()で維持。
   */
  if (!trackReverbImpulseCache[bucketIndex]) {
    trackReverbImpulseCache[bucketIndex] =
      createTrackReverbImpulse(bucketIndex);
  }

  let bus =
    trackReverbBuses.get(
      bucketIndex
    );

  if (bus) {
    return bus;
  }

  const input =
    context.createGain();

  const highpass =
    context.createBiquadFilter();

  const convolver =
    context.createConvolver();

  const lowpass =
    context.createBiquadFilter();

  const output =
    context.createGain();

  const size =
    TRACK_REVERB_BUCKET_COUNT > 1
      ? bucketIndex /
        (
          TRACK_REVERB_BUCKET_COUNT -
          1
        )
      : 0;

  highpass.type =
    "highpass";

  highpass.frequency.value =
    100 +
    size * 90;

  convolver.normalize =
    true;

  convolver.buffer =
    trackReverbImpulseCache[
      bucketIndex
    ];

  lowpass.type =
    "lowpass";

  lowpass.frequency.value =
    7600 -
    size * 3000;

  /*
   * Send=100で残響が明確に分かるが、
   * Dryを押し潰さない程度。
   */
  output.gain.value =
    1.5;

  input
    .connect(highpass)
    .connect(convolver)
    .connect(lowpass)
    .connect(output)
    .connect(mixInput);

  bus = {
    input,
    bucketIndex
  };

  trackReverbBuses.set(
    bucketIndex,
    bus
  );

  return bus;
}

function initializeTrackReverbBuses() {
  if (
    !context ||
    !mixInput
  ) {
    return;
  }

  /*
   * IR Bufferだけは事前生成しておく。
   *
   * Convolver Bus本体はSENDが実際に使われたbucketだけ
   * ensureTrackReverbBus()で遅延生成する。
   *
   * 以前はSIZE 1〜8のConvolverを全て常駐させていたため、
   * SEND 0でも最大8本のConvolver graphがAudioContext上に
   * 接続されたままになっていた。
   */
  initializeTrackReverbImpulses();
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
  (offlineRenderMode ? 0 : 0.03);

const now =
  Math.max(
    requestedStartTime,
    minimumStartTime
  );

  const bpm =
    Number(options.bpm) ||
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
  -8,
  8
);

  const stepSeconds =
    (60 / Math.max(1, bpm)) / 4;

  const glideStepRatios = [
  0,
  0.125,
  0.25,
  0.5,
  1,
  2,
  4,
  6,
  8
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
        150
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
    100
  );

const attackNormalized =
  (attackValue - 1) / 99;

/*
 * 1〜100を約1ms〜1秒へ非線形変換。
 * 低い値ほど細かく、
 * 高い値ほど長いAttackへ広げる。
 */
const attack =
  0.001 +
  0.999 *
    Math.pow(
      attackNormalized,
      2.4
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
      -50,
      50
    );

  const filterResonance =
    clamp(
      (soundTrack.base.filterResonance ?? 0) +
        offset("filterResonance"),
      0,
      50
    );

  const panValue =
  clamp(
    soundTrack.base.pan +
      offset("pan"),
    -25,
    25
  ) / 25;

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

  /*
   * FX3 Reverb
   *
   * SENDはDryを維持したまま残響経路へ送る量。
   * SIZEはDelay Networkの時間とFeedbackを同時に変化させる。
   * FX一括ミュート中はSENDのみ0として、設定値は保持する。
   */
  const reverbSend =
    soundTrack.fxMuted
      ? 0
      : clamp(
          (soundTrack.base.reverbSend ?? 0) +
            offset("reverbSend"),
          0,
          100
        ) / 100;

  const reverbSize =
    clamp(
      Math.round(
        (soundTrack.base.reverbSize ?? 5) +
          offset("reverbSize")
      ),
      1,
      8
    );

  const panner =
  context.createStereoPanner();

/*
 * Filter OFF fast path:
 * cutoff 0では、従来allpassとして毎発音2個生成していた
 * BiquadFilterNodeを完全に省略する。
 */
const filterEnabled =
  filterCutoff !== 0;

const filter1 =
  filterEnabled
    ? context.createBiquadFilter()
    : null;

const filter2 =
  filterEnabled
    ? context.createBiquadFilter()
    : null;

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
  if (filterEnabled) {
    const normalizedAmount =
      Math.abs(filterCutoff) / 50;

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
        filterResonance / 50,
        1.2
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
    if (!filterEnabled) {
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
      source.stop(stopTime);
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

if (filterEnabled) {
  mixGain
    .connect(filter1)
    .connect(filter2)
    .connect(panner);
} else {
  mixGain.connect(panner);
}

  /*
   * FX1 Delay → FX2 CRUSH の順で処理するため、
   * まずPan後の信号をFXバスへまとめる。
   */
  const fxInput =
  context.createGain();

/*
 * EXPORT専用Fade。
 *
 * 通常再生ではオフライン化前と同じ
 * panner → fxInput の直結経路を使う。
 *
 * Offline Export時、またはfadeEnvelopeが
 * 明示された場合だけFade用GainNodeを生成する。
 * これにより通常再生の発音ごとのAudioNode生成数を
 * オフライン化前と同じ水準へ戻す。
 */
let exportFadeGain = null;
let fxSourceNode = panner;

const fadeEnvelope =
  options.fadeEnvelope;

if (
  offlineRenderMode ||
  fadeEnvelope
) {
  exportFadeGain =
    context.createGain();

  exportFadeGain.gain.setValueAtTime(
    1,
    0
  );

  if (fadeEnvelope) {
    const fadeInStart =
      Number(
        fadeEnvelope.fadeInStart
      );

    const fadeInEnd =
      Number(
        fadeEnvelope.fadeInEnd
      );

    const fadeOutStart =
      Number(
        fadeEnvelope.fadeOutStart
      );

    const fadeOutEnd =
      Number(
        fadeEnvelope.fadeOutEnd
      );

    if (
      Number.isFinite(fadeInStart) &&
      Number.isFinite(fadeInEnd) &&
      fadeInEnd > fadeInStart
    ) {
      exportFadeGain.gain
        .setValueAtTime(
          0,
          fadeInStart
        );

      exportFadeGain.gain
        .linearRampToValueAtTime(
          1,
          fadeInEnd
        );
    }

    if (
      Number.isFinite(fadeOutStart) &&
      Number.isFinite(fadeOutEnd) &&
      fadeOutEnd > fadeOutStart
    ) {
      exportFadeGain.gain
        .setValueAtTime(
          1,
          fadeOutStart
        );

      exportFadeGain.gain
        .linearRampToValueAtTime(
          0,
          fadeOutEnd
        );
    }
  }

  panner.connect(
    exportFadeGain
  );

  fxSourceNode =
    exportFadeGain;
}

fxSourceNode.connect(
  fxInput
);

  /*
   * 共通Audio graphをいつ解放できるか判断するため、
   * Delay tailの終了予定時刻を保持する。
   *
   * DelayなしならreleaseEndで解放できる。
   */
  let delayGraphCleanupAt =
    releaseEnd;

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

    fxSourceNode.connect(
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

    delayGraphCleanupAt =
      Math.max(
        delayGraphCleanupAt,
        now + cleanupSeconds
      );

    if (!offlineRenderMode) {
      window.setTimeout(
        () => {
          try {
            fxSourceNode.disconnect(
              delayNode
            );

            delayNode.disconnect();
            feedbackGain.disconnect();
            wetGain.disconnect();
          } catch {}
        },
        Math.max(
          100,
          (
            delayGraphCleanupAt -
            context.currentTime +
            0.05
          ) *
            1000
        )
      );
    }
  }

  /*
   * FX2の出力をいったんFX3入力へまとめる。
   * Reverb SEND 0でも、このGainは単純な通過点だけになる。
   */
  const fxOutput =
    context.createGain();

  /*
   * FX2ノードは発音終了後にまとめて解放するため、
   * block外から参照できるよう保持する。
   */
  let crusherNodeForCleanup = null;
  let crusherDryGainForCleanup = null;
  let crusherWetGainForCleanup = null;

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

    crusherDryGainForCleanup =
      dryGain;

    crusherWetGainForCleanup =
      wetGain;

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

      crusherNodeForCleanup =
        crusherNode;

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
        .connect(fxOutput);

      fxInput
        .connect(crusherNode)
        .connect(wetGain)
        .connect(fxOutput);
    } catch (error) {
      console.warn(
        "Bit crusher node unavailable:",
        error
      );

      fxInput.connect(fxOutput);
    }
  } else {
    fxInput.connect(fxOutput);
  }

  /*
   * FX3：Track Reverb
   *
   * Dryは常にそのままMasterへ送る。
   * WetだけをSize別の共有Convolver BusへSendする。
   *
   * Feedback loopを一切持たないので、
   * Reverb追加による発振・音切れを起こしにくい構造。
   */
  fxOutput.connect(
    mixInput
  );

  if (reverbSend > 0) {
    const reverbBus =
      ensureTrackReverbBus(
        reverbSize
      );

    if (reverbBus) {
      const sendGain =
        context.createGain();

      sendGain.gain.setValueAtTime(
        reverbSend,
        now
      );

      fxOutput
        .connect(sendGain)
        .connect(
          reverbBus.input
        );

      /*
       * 元音が終わったらSendノードだけ切る。
       * Convolver側の残響Tailは独立して最後まで鳴る。
       */
      const disconnectDelayMs =
        Math.max(
          100,
          (
            releaseEnd -
            context.currentTime +
            0.12
          ) *
            1000
        );

      if (!offlineRenderMode) {
        window.setTimeout(
          () => {
            try {
              fxOutput.disconnect(sendGain);
              sendGain.disconnect();
            } catch {}
          },
          disconnectDelayMs
        );
      }
    }
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

  if (sineVolume > 0 && fmVoiceWorkletReady) {
    const voiceGainScale = 1 / Math.sqrt(Math.max(1, chordNotes.length));

    function workletLfoConfig(lfoNumber, target) {
      const prefix = `lfo${lfoNumber}`;
      if (soundTrack.base[`${prefix}Target`] !== target) return null;

      const lfoDepth = clamp(
        (soundTrack.base[`${prefix}Depth`] ?? 0) + offset(`${prefix}Depth`),
        0,
        100
      );
      if (lfoDepth <= 0) return null;

      const syncMode = soundTrack.base[`${prefix}SyncMode`] === "bpm" ? "bpm" : "free";
      const rateValue = clamp(
        (soundTrack.base[`${prefix}Rate`] ?? (syncMode === "bpm" ? 8 : 25)) + offset(`${prefix}Rate`),
        syncMode === "bpm" ? 0 : 1,
        syncMode === "bpm" ? 13 : 100
      );

      return {
        depth: lfoDepth,
        rateHz: lfoRateToHz(rateValue, syncMode, bpm),
        wave: soundTrack.base[`${prefix}Wave`] ?? "sine"
      };
    }

    const pitchLfos = [1, 2]
      .map(lfoNumber => workletLfoConfig(lfoNumber, "pitch"))
      .filter(Boolean);

    const fmDepthLfos = [1, 2]
      .map(lfoNumber => workletLfoConfig(lfoNumber, "fmDepth"))
      .filter(Boolean);

    const fmFeedbackNormalized = clamp(
      (Number(soundTrack.base.fmFeedback) || 0) + offset("fmFeedback"),
      0,
      50
    ) / 50;

    const fmFeedbackStrength = Math.pow(fmFeedbackNormalized, 1.2) * 1.8;
    const fmRatio = clamp(
      (Number(soundTrack.base.fmRatio) || 1) + offset("fmRatio"),
      0.25,
      8
    );
    const fmDepth = clamp(soundTrack.base.fmDepth + offset("fmDepth"), 0, 20);

    for (let voiceIndex = 0; voiceIndex < chordNotes.length; voiceIndex++) {
      const voiceNote = chordNotes[voiceIndex];
      const glideStartNote = glideStartNotes[voiceIndex] ?? voiceNote;
      const strumVoiceIndex = strumValue < 0
        ? chordNotes.length - 1 - voiceIndex
        : voiceIndex;
      const voiceStartDelay = chordNotes.length > 1
        ? strumVoiceIndex * strumGapSeconds
        : 0;
      const voiceStartTime = now + voiceStartDelay;
      const sineStopAt = releaseEnd + 0.01 + voiceStartDelay;

      const sineGain = context.createGain();
      sineGain.gain.setValueAtTime(
        Math.max(0.0001, sineVolume * voiceGainScale),
        voiceStartTime
      );

      /*
       * Fast path:
       * FM / pitch LFO / glideを一切使わない単純サイン波は、
       * AudioWorkletNodeを毎発音生成せず
       * ネイティブOscillatorNodeで鳴らす。
       *
       * 高密度パターンで最も重い
       * AudioWorkletNode生成数を減らすための分岐。
       */
      const canUseNativeSine =
        fmDepth <= 0 &&
        glideDuration <= 0 &&
        pitchLfos.length === 0 &&
        fmDepthLfos.length === 0;

      if (canUseNativeSine) {
        const oscillator =
          context.createOscillator();

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(
          frequency(voiceNote),
          voiceStartTime
        );

        oscillator
          .connect(sineGain)
          .connect(mixGain);

        oscillator.start(
          voiceStartTime
        );

        oscillator.stop(
          sineStopAt
        );

        if (!offlineRenderMode) {
          window.setTimeout(
            () => {
              try {
                oscillator.disconnect();
                sineGain.disconnect();
              } catch {}
            },
            Math.max(
              50,
              (
                sineStopAt -
                context.currentTime +
                0.05
              ) * 1000
            )
          );
        }
      } else {
        const fmVoice =
          new AudioWorkletNode(
            context,
            "sprooto-fm-voice",
            {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [1],
              processorOptions: {
                startTime: voiceStartTime,
                stopTime: sineStopAt,
                startNote: glideStartNote,
                targetNote: voiceNote,
                glideDuration,
                fmDepth,
                fmRatio,
                fmFeedbackStrength,
                pitchLfos,
                fmDepthLfos
              }
            }
          );

        fmVoice
          .connect(sineGain)
          .connect(mixGain);

        if (!offlineRenderMode) {
          window.setTimeout(
            () => {
              try {
                fmVoice.disconnect();
                sineGain.disconnect();
              } catch {}
            },
            Math.max(
              50,
              (
                sineStopAt -
                context.currentTime +
                0.05
              ) * 1000
            )
          );
        }
      }
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
  getSharedNoiseBuffer();

/*
 * 同じBufferを共有しても各発音が同じ位相から始まらないよう、
 * 開始位置をランダム化する。
 *
 * GateがBuffer長を超える場合も自然に継続できるようloopする。
 */
noise.loop = true;

const noiseStartOffset =
  Math.random() *
  Math.max(
    0.001,
    noise.buffer.duration
  );

    scheduleSourceEnvelope(
      noiseGain,
      noiseVolume,
      noiseDecay
    );

    noise
      .connect(noiseGain)
      .connect(mixGain);

    /*
     * BufferSourceはstopだけでなく、
     * 終了時に接続も明示的に切る。
     *
     * SUB等で短時間に大量発音しても、
     * 終了済みNoise graphを残さない。
     */
    if (!offlineRenderMode) {
      noise.addEventListener(
        "ended",
        () => {
          try {
            noise.disconnect();
            noiseGain.disconnect();
          } catch {}
        },
        { once: true }
      );
    }

    noise.start(
      now,
      noiseStartOffset
    );

    noise.stop(
      noiseStopAt
    );
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

if (!offlineRenderMode) {
  window.setTimeout(
    () => {
      if (activeTrackVoices.get(track.id) === registeredVoice) {
        activeTrackVoices.delete(track.id);
      }
    },
    Math.max(
      10,
      (releaseEnd - context.currentTime + 0.05) * 1000
    )
  );

  /*
   * =========================
   * Per-voice AudioNode cleanup
   * =========================
   *
   * Source本体が終了しても、接続されたAudioNode graphを
   * 明示的に切らないまま高密度発音を続けると、
   * iPhone等でGC / Web Audio資源回収が追いつかない場合がある。
   *
   * Delay使用時はtailがfxInput -> fxOutputを通るため、
   * releaseEndでは切らず、Delay cleanup予定時刻まで待つ。
   * Track ReverbはSend入力を別timerで切っており、
   * Convolver Bus自体は共有なのでtailを壊さない。
   */
  const graphCleanupAt =
    Math.max(
      releaseEnd + 0.15,
      delayGraphCleanupAt + 0.10
    );

  window.setTimeout(
    () => {
      /*
       * LFO sourceは停止後も接続が残るため切断する。
       */
      panLfoOscillators.forEach(
        node => {
          try {
            node.disconnect();
          } catch {}
        }
      );

      filterLfoNodes.forEach(
        node => {
          try {
            node.disconnect();
          } catch {}
        }
      );

      /*
       * CrusherはAudioWorkletNodeなので、
       * 発音単位で必ずgraphから外す。
       */
      [
        crusherNodeForCleanup,
        crusherDryGainForCleanup,
        crusherWetGainForCleanup
      ].forEach(
        node => {
          if (!node) {
            return;
          }

          try {
            node.disconnect();
          } catch {}
        }
      );

      /*
       * 発音ごとに生成する共通Dry / FX経路。
       * Delay tail終了後なので、ここで切っても音は変わらない。
       */
      [
        mixGain,
        filter1,
        filter2,
        panner,
        exportFadeGain,
        fxInput,
        fxOutput
      ].forEach(
        node => {
          if (!node) {
            return;
          }

          try {
            node.disconnect();
          } catch {}
        }
      );
    },
    Math.max(
      100,
      (
        graphCleanupAt -
        context.currentTime
      ) *
        1000
    )
  );
}

}

export function resumeAudio() {
  resumeAudioContext();
}

/* =========================
 * Offline export support
 * ========================= */
export async function beginOfflineAudioRender(
  offlineContext,
  {
    masterMix = {},
    masterVolume = 70
  } = {}
) {
  if (!offlineContext) {
    throw new Error("offline audio context is required");
  }

  const backup = {
    context,
    master,
    mixInput,
    mixGain,
    limiter,
    reverbConvolver,
    reverbDryGain,
    reverbWetGain,
    spectrumAnalyser,
    outputAnalyser,
    eqNodes,
    spectrumData,
    outputTimeData,
    bitCrusherWorkletReady,
    fmVoiceWorkletReady,
    audioClockReady,
    audioClockReadyPromise,
    offlineRenderMode,
    trackReverbImpulseCache: trackReverbImpulseCache.slice(),
    trackReverbBuses: [...trackReverbBuses.entries()],
    activeTrackVoices: [...activeTrackVoices.entries()]
  };

  context = offlineContext;

  sharedNoiseBuffer = null;
  sharedNoiseBufferContext = null;

  offlineRenderMode = true;
  audioClockReady = true;
  audioClockReadyPromise = null;
  bitCrusherWorkletReady = null;
  fmVoiceWorkletReady = null;
  spectrumData = null;
  outputTimeData = null;
  spectrumAnalyser = null;
  outputAnalyser = null;

  trackReverbImpulseCache.length = 0;
  trackReverbBuses.clear();
  activeTrackVoices.clear();

  master = context.createGain();
  master.gain.value = clamp(Number(masterVolume) || 0, 0, 100) / 100;

  mixInput = context.createGain();

  const eqValues = Array.isArray(masterMix.eq)
    ? masterMix.eq
    : Array(8).fill(0);

  eqNodes = EQ_FREQUENCIES.map((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0
      ? "lowshelf"
      : index === EQ_FREQUENCIES.length - 1
        ? "highshelf"
        : "peaking";
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    filter.gain.value = clamp(Number(eqValues[index]) || 0, -12, 12);
    return filter;
  });

  reverbConvolver = context.createConvolver();
  reverbConvolver.buffer = createMasterReverbImpulse();

  reverbDryGain = context.createGain();
  reverbWetGain = context.createGain();

  mixGain = context.createGain();
  mixGain.gain.value = clamp(Number(masterMix.volume ?? 100) || 0, 0, 100) / 100;

  limiter = context.createDynamicsCompressor();
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  limiter.threshold.value = clamp(Number(masterMix.limiter ?? -1) || 0, -24, 0);

  let previousNode = mixInput;
  eqNodes.forEach(filter => {
    previousNode.connect(filter);
    previousNode = filter;
  });

  previousNode.connect(reverbDryGain);
  reverbDryGain.connect(mixGain);

  previousNode.connect(reverbConvolver);
  reverbConvolver.connect(reverbWetGain);
  reverbWetGain.connect(mixGain);

  reverbDryGain.gain.value = 1;
  reverbWetGain.gain.value = clamp(Number(masterMix.reverb ?? 0) || 0, 0, 100) / 100;

  mixGain.connect(limiter);
  limiter.connect(master);
  master.connect(context.destination);

  /* Track Reverbは実際に使用されたSIZEだけ遅延生成する。 */


  await Promise.all([
    initializeBitCrusherWorklet(),
    initializeFmVoiceWorklet()
  ]);

  let restored = false;

  return function restoreOfflineAudioRender() {
    if (restored) return;
    restored = true;

    trackReverbImpulseCache.length = 0;
    trackReverbImpulseCache.push(...backup.trackReverbImpulseCache);

    trackReverbBuses.clear();
    backup.trackReverbBuses.forEach(([key, value]) => {
      trackReverbBuses.set(key, value);
    });

    activeTrackVoices.clear();
    backup.activeTrackVoices.forEach(([key, value]) => {
      activeTrackVoices.set(key, value);
    });

    context = backup.context;

    sharedNoiseBuffer = null;
    sharedNoiseBufferContext = null;

    master = backup.master;
    mixInput = backup.mixInput;
    mixGain = backup.mixGain;
    limiter = backup.limiter;
    reverbConvolver = backup.reverbConvolver;
    reverbDryGain = backup.reverbDryGain;
    reverbWetGain = backup.reverbWetGain;
    spectrumAnalyser = backup.spectrumAnalyser;
    outputAnalyser = backup.outputAnalyser;
    eqNodes = backup.eqNodes;
    spectrumData = backup.spectrumData;
    outputTimeData = backup.outputTimeData;
    bitCrusherWorkletReady = backup.bitCrusherWorkletReady;
    fmVoiceWorkletReady = backup.fmVoiceWorkletReady;
    audioClockReady = backup.audioClockReady;
    audioClockReadyPromise = backup.audioClockReadyPromise;
    offlineRenderMode = backup.offlineRenderMode;
  };
}
