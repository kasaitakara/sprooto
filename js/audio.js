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
let fmVoiceWorkletReady = null;

/*
 * CRUSHは発音ごとにWorkletを作らず、
 * Trackごとに1台のAudioWorkletNodeを常設して再利用する。
 */
let audioClockReady = false;
let audioClockReadyPromise = null;
let offlineRenderMode = false;

let sprootoDebugStarted = false;
let sprootoDebugInterval = null;
let sprootoDebugPlayCallsTotal = 0;
let sprootoDebugPlayCallsWindow = 0;
let sprootoDebugNodesCreated = 0;
let sprootoDebugNodesReleased = 0;
let sprootoDebugNodesCreatedWindow = 0;
let sprootoDebugNodesReleasedWindow = 0;
let sprootoDebugCleanups = 0;
let sprootoDebugTimersScheduled = 0;
let sprootoDebugTimersFired = 0;
let sprootoDebugTimerMaxLateMsWindow = 0;
let sprootoDebugOscEndedWindow = 0;

let sprootoDebugWallStart = 0;
let sprootoDebugAudioStart = 0;

let sprootoDebugRafStarted = false;
let sprootoDebugRafLast = 0;
let sprootoDebugMainLagMaxWindow = 0;
let sprootoDebugRafFramesWindow = 0;

let sprootoDebugHeartbeatNode = null;
let sprootoDebugHeartbeatReady = null;
let sprootoDebugHeartbeatLastWall = 0;
let sprootoDebugHeartbeatMaxGapWindow = 0;
let sprootoDebugHeartbeatCount = 0;
let sprootoDebugHeartbeatFrame = 0;
let sprootoDebugHeartbeatAudioTime = 0;
let sprootoDebugHeartbeatFrameGapMaxWindow = 0;

let sprootoDebugStateChanges = 0;
let sprootoDebugLastState = "none";

let sprootoDebugFmWorkletCreatedTotal = 0;

const sprootoDebugReleasedNodes = new WeakSet();
const sprootoDebugNodeTypes = new WeakMap();
const sprootoDebugNodeRoles = new WeakMap();
const sprootoDebugLiveByType = Object.create(null);
const sprootoDebugLiveByRole = Object.create(null);

function sprootoDebugType(node) {
  const name = node?.constructor?.name ?? "other";

  if (/AudioWorkletNode/i.test(name)) return "worklet";
  if (/GainNode/i.test(name)) return "gain";
  if (/StereoPannerNode/i.test(name)) return "pan";
  if (/BiquadFilterNode/i.test(name)) return "filter";
  if (/OscillatorNode|AudioBufferSourceNode|ConstantSourceNode/i.test(name)) return "source";
  if (/DelayNode/i.test(name)) return "delay";
  if (/ConvolverNode/i.test(name)) return "conv";
  return "other";
}

function sprootoDebugNode(node, role = null) {
  if (node) {
    const type = sprootoDebugType(node);
    sprootoDebugNodesCreated += 1;
    sprootoDebugNodesCreatedWindow += 1;
    sprootoDebugNodeTypes.set(node, type);
    sprootoDebugLiveByType[type] = (sprootoDebugLiveByType[type] || 0) + 1;

    if (role) {
      sprootoDebugNodeRoles.set(node, role);
      sprootoDebugLiveByRole[role] =
        (sprootoDebugLiveByRole[role] || 0) + 1;
    }
  }
  return node;
}

function sprootoDebugReleaseNode(node) {
  if (!node || sprootoDebugReleasedNodes.has(node)) {
    return;
  }

  sprootoDebugReleasedNodes.add(node);
  sprootoDebugNodesReleased += 1;
  sprootoDebugNodesReleasedWindow += 1;

  const type = sprootoDebugNodeTypes.get(node);
  if (type) {
    sprootoDebugLiveByType[type] = Math.max(0, (sprootoDebugLiveByType[type] || 0) - 1);
  }

  const role = sprootoDebugNodeRoles.get(node);
  if (role) {
    sprootoDebugLiveByRole[role] =
      Math.max(0, (sprootoDebugLiveByRole[role] || 0) - 1);
  }

  try {
    node.disconnect();
  } catch {}
}


function sprootoDebugStartRafMonitor() {
  if (
    sprootoDebugRafStarted ||
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }

  sprootoDebugRafStarted = true;

  const tick = timestamp => {
    if (sprootoDebugRafLast > 0) {
      const gap =
        timestamp -
        sprootoDebugRafLast;

      sprootoDebugMainLagMaxWindow =
        Math.max(
          sprootoDebugMainLagMaxWindow,
          Math.max(
            0,
            gap - 16.7
          )
        );
    }

    sprootoDebugRafLast =
      timestamp;

    sprootoDebugRafFramesWindow +=
      1;

    window.requestAnimationFrame(
      tick
    );
  };

  window.requestAnimationFrame(
    tick
  );
}

async function sprootoDebugStartHeartbeat() {
  if (
    offlineRenderMode ||
    !context?.audioWorklet ||
    sprootoDebugHeartbeatNode
  ) {
    return;
  }

  try {
    if (!sprootoDebugHeartbeatReady) {
      const processorSource = `
        class SprootoDebugHeartbeatProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.frames = 0;
          }

          process(inputs, outputs) {
            const channel =
              outputs[0]?.[0];

            if (channel) {
              channel.fill(0);
            }

            this.frames += 128;

            if (
              this.frames >=
              sampleRate * 0.25
            ) {
              this.frames = 0;

              this.port.postMessage({
                frame: currentFrame,
                time: currentTime
              });
            }

            return true;
          }
        }

        registerProcessor(
          "sprooto-debug-heartbeat-v12",
          SprootoDebugHeartbeatProcessor
        );
      `;

      const blob =
        new Blob(
          [processorSource],
          {
            type: "application/javascript"
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      sprootoDebugHeartbeatReady =
        context.audioWorklet
          .addModule(url)
          .finally(
            () => {
              URL.revokeObjectURL(
                url
              );
            }
          );
    }

    await sprootoDebugHeartbeatReady;

    if (sprootoDebugHeartbeatNode) {
      return;
    }

    const node =
      new AudioWorkletNode(
        context,
        "sprooto-debug-heartbeat-v12",
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1]
        }
      );

    const silent =
      context.createGain();

    silent.gain.value =
      0;

    node
      .connect(silent)
      .connect(context.destination);

    node.port.onmessage =
      event => {
        const wallNow =
          performance.now();

        const frame =
          Number(
            event?.data?.frame
          ) || 0;

        const audioTime =
          Number(
            event?.data?.time
          ) || 0;

        if (
          sprootoDebugHeartbeatLastWall >
          0
        ) {
          sprootoDebugHeartbeatMaxGapWindow =
            Math.max(
              sprootoDebugHeartbeatMaxGapWindow,
              wallNow -
                sprootoDebugHeartbeatLastWall
            );
        }

        if (
          sprootoDebugHeartbeatFrame >
          0 &&
          frame >
            sprootoDebugHeartbeatFrame
        ) {
          const expectedFrameGap =
            context.sampleRate * 0.25;

          const actualFrameGap =
            frame -
            sprootoDebugHeartbeatFrame;

          sprootoDebugHeartbeatFrameGapMaxWindow =
            Math.max(
              sprootoDebugHeartbeatFrameGapMaxWindow,
              Math.abs(
                actualFrameGap -
                  expectedFrameGap
              )
            );
        }

        sprootoDebugHeartbeatLastWall =
          wallNow;

        sprootoDebugHeartbeatFrame =
          frame;

        sprootoDebugHeartbeatAudioTime =
          audioTime;

        sprootoDebugHeartbeatCount +=
          1;
      };

    sprootoDebugHeartbeatNode =
      node;
  } catch (error) {
    console.warn(
      "Debug heartbeat unavailable:",
      error
    );
  }
}

function sprootoDebugTimeout(callback, delay) {
  sprootoDebugTimersScheduled += 1;

  const safeDelay =
    Math.max(0, Number(delay) || 0);

  const expectedAt =
    performance.now() + safeDelay;

  return window.setTimeout(
    () => {
      sprootoDebugTimersFired += 1;

      const lateMs =
        Math.max(
          0,
          performance.now() - expectedAt
        );

      sprootoDebugTimerMaxLateMsWindow =
        Math.max(
          sprootoDebugTimerMaxLateMsWindow,
          lateMs
        );

      callback();
    },
    safeDelay
  );
}

function startSprootoDebugOverlay() {
  if (
    sprootoDebugStarted ||
    typeof window === "undefined"
  ) {
    return;
  }

  sprootoDebugStarted = true;

  sprootoDebugWallStart =
    performance.now();

  sprootoDebugAudioStart =
    context?.currentTime || 0;

  sprootoDebugLastState =
    context?.state ?? "none";

  sprootoDebugStartRafMonitor();

  let panel =
    document.getElementById(
      "sprooto-audio-debug-panel"
    );

  if (!panel) {
    panel =
      document.createElement(
        "div"
      );

    panel.id =
      "sprooto-audio-debug-panel";

    Object.assign(
  panel.style,
  {
    position: "fixed",
    top: "8px",
    right: "calc(50% - 172px)",

    zIndex: "999999",
    padding: "6px 8px",
    fontFamily: '"DM Mono", monospace',
    fontSize: "10px",
    lineHeight: "1.25",
    whiteSpace: "pre",
    pointerEvents: "none",
    background: "rgba(21, 21, 21, 0.78)",
    color: "#fff",
    borderRadius: "6px"
  }
);

    const debugHost =
      document.body ||
      document.documentElement;

    debugHost?.appendChild(
      panel
    );
  }

  sprootoDebugInterval =
    window.setInterval(
      () => {
        if (!panel) {
          return;
        }

        const wall =
          (
            performance.now() -
            sprootoDebugWallStart
          ) / 1000;

        const audio =
          context
            ? context.currentTime -
              sprootoDebugAudioStart
            : 0;

        const drift =
          wall -
          audio;

        const hbAge =
          sprootoDebugHeartbeatLastWall > 0
            ? performance.now() -
              sprootoDebugHeartbeatLastWall
            : -1;

        const hbAudioDrift =
          sprootoDebugHeartbeatAudioTime > 0
            ? wall -
              (
                sprootoDebugHeartbeatAudioTime -
                sprootoDebugAudioStart
              )
            : 0;

        let outputWallDrift = NaN;

        try {
          if (
            typeof context?.getOutputTimestamp ===
            "function"
          ) {
            const stamp =
              context.getOutputTimestamp();

            const outputContextTime =
              Number(
                stamp?.contextTime
              );

            const outputPerformanceTime =
              Number(
                stamp?.performanceTime
              );

            if (
              Number.isFinite(outputContextTime) &&
              Number.isFinite(outputPerformanceTime)
            ) {
              const stampWall =
                (
                  outputPerformanceTime -
                  sprootoDebugWallStart
                ) / 1000;

              const stampAudio =
                outputContextTime -
                sprootoDebugAudioStart;

              outputWallDrift =
                stampWall -
                stampAudio;
            }
          }
        } catch {}

        const baseLatency =
          Number(
            context?.baseLatency
          );

        const outputLatency =
          Number(
            context?.outputLatency
          );

        panel.textContent =
  [
    `t ${audio.toFixed(0)} drift ${drift >= 0 ? "+" : ""}${drift.toFixed(2)} ${context?.state ?? "none"}`,
    `main ${Math.round(sprootoDebugMainLagMaxWindow)}ms timer ${Math.round(sprootoDebugTimerMaxLateMsWindow)}ms`,
    `hb ${hbAge < 0 ? "-" : Math.round(hbAge)}ms gap ${Math.round(sprootoDebugHeartbeatMaxGapWindow)}ms`,
    `nodes ${sprootoDebugNodesCreated} live ${Math.max(0, sprootoDebugNodesCreated - sprootoDebugNodesReleased)} src ${sprootoDebugLiveByType.source || 0} wrk ${sprootoDebugLiveByType.worklet || 0}`
  ].join("\n");

        sprootoDebugPlayCallsWindow = 0;
        sprootoDebugNodesCreatedWindow = 0;
        sprootoDebugNodesReleasedWindow = 0;
        sprootoDebugMainLagMaxWindow = 0;
        sprootoDebugRafFramesWindow = 0;
        sprootoDebugTimerMaxLateMsWindow = 0;
        sprootoDebugHeartbeatMaxGapWindow = 0;
        sprootoDebugHeartbeatFrameGapMaxWindow = 0;
        sprootoDebugOscEndedWindow = 0;
      },
      1000
    );
}

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

          sprootoDebugTimeout(
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


export async function initializeAudio() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();

    startSprootoDebugOverlay();
    audioClockReady = false;
    audioClockReadyPromise = null;
    master = sprootoDebugNode(context.createGain());
    master.gain.value = 0.7;

    mixInput = sprootoDebugNode(context.createGain());

    eqNodes = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = sprootoDebugNode(context.createBiquadFilter());
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

    reverbDryGain = sprootoDebugNode(context.createGain());
    reverbWetGain = sprootoDebugNode(context.createGain());

    mixGain = sprootoDebugNode(context.createGain());
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

context.addEventListener(
  "statechange",
  () => {
    const nextState =
      context?.state ?? "none";

    if (
      nextState !==
      sprootoDebugLastState
    ) {
      sprootoDebugStateChanges += 1;
      sprootoDebugLastState =
        nextState;
    }
  }
);
  }

  await initializeFmVoiceWorklet();

  if (!offlineRenderMode) {
    sprootoDebugStartHeartbeat();
  }

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
    sprootoDebugNode(context.createConstantSource(), "lfo");

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
  sprootoDebugPlayCallsTotal += 1;
  sprootoDebugPlayCallsWindow += 1;

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
 * Attackは現行仕様を維持：
 * 1〜100を約1ms〜1秒へ非線形変換。
 */
const attack =
  0.001 +
  0.999 *
    Math.pow(
      attackNormalized,
      2.4
    );

/*
 * H/D：
 * -50〜-1 = hold
 * 0       = 最短クリック
 * +1〜+50 = decay
 */
const holdDecayValue =
  clamp(
    (soundTrack.base.holdDecay ?? 0) +
      offset("holdDecay"),
    -50,
    50
  );

const holdDecayAmount =
  Math.abs(holdDecayValue);

const holdDecayNormalized =
  holdDecayAmount / 50;

const envelopeDuration =
  holdDecayAmount === 0
    ? 0.005
    : 0.005 +
      9.995 *
        Math.pow(
          holdDecayNormalized,
          3
        );

  const sineVolume =
    clamp(
      (soundTrack.base.sineVolume ?? 100) +
        offset("sineVolume"),
      0,
      100
    ) / 100;

  const commonEnvelopeDuration =
    envelopeDuration;

  const maximumDecay =
    commonEnvelopeDuration;

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


  const panLfoActive = [1, 2].some(lfoNumber => {
    const prefix = `lfo${lfoNumber}`;
    if (soundTrack.base[`${prefix}Target`] !== "pan") {
      return false;
    }

    return clamp(
      (soundTrack.base[`${prefix}Depth`] ?? 0) +
        offset(`${prefix}Depth`),
      0,
      100
    ) > 0;
  });

  /*
   * Pan fast path:
   * center固定かつPan LFOなしならStereoPannerNodeを作らない。
   */
  const panner =
    (panValue !== 0 || panLfoActive)
      ? sprootoDebugNode(context.createStereoPanner())
      : null;

/*
 * Filter OFF fast path:
 * cutoff 0では、従来allpassとして毎発音2個生成していた
 * BiquadFilterNodeを完全に省略する。
 */
const filterEnabled =
  filterCutoff !== 0;

const filter1 =
  filterEnabled
    ? sprootoDebugNode(context.createBiquadFilter())
    : null;

const filter2 =
  filterEnabled
    ? sprootoDebugNode(context.createBiquadFilter())
    : null;

const gateEnd =
  now + envelopeDuration + maximumStrumDelay;

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
const panLfoGainNodes = [];

  if (panner) {
    panner.pan.setValueAtTime(
      panValue,
      now
    );
  }

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
  if (!panner) {
    return;
  }

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
        now + envelopeDuration + 0.05
    });

  panLfoOscillators.push(
    randomSource
  );

  return;
}

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

const lfoOscillator =
  sprootoDebugNode(context.createOscillator(), "osc");

const lfoGain =
  sprootoDebugNode(context.createGain());

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

  panLfoGainNodes.push(
    lfoGain
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
        sprootoDebugNode(context.createConstantSource(), "lfo");

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
        sprootoDebugNode(context.createConstantSource(), "lfo");

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
  sprootoDebugNode(context.createGain(), "mix");

 /*
 * 前のhold音が次トリガーまで残る場合、
 * 次音直前の4msだけ滑らかに閉じる。
 *
 * linear rampではなく滑らかなカーブを使い、
 * 急激な傾きによるクリックを抑える。
 */
if (
  previousVoice?.isHold &&
  previousVoice?.gainNode &&
  previousVoice.endTime > now
) {
  const previousGain =
    previousVoice.gainNode.gain;

  const transitionTime =
    0.004;

  const transitionStart =
    Math.max(
      context.currentTime,
      now - transitionTime
    );

  if (
    typeof previousGain.cancelAndHoldAtTime ===
    "function"
  ) {
    previousGain.cancelAndHoldAtTime(
      transitionStart
    );
  } else {
    previousGain.cancelScheduledValues(
      transitionStart
    );
  }

  const fadeCurve =
    new Float32Array([
      1,
      0.9619,
      0.8536,
      0.6913,
      0.5,
      0.3087,
      0.1464,
      0.0381,
      0.0001
    ]);

  previousGain.setValueCurveAtTime(
    fadeCurve,
    transitionStart,
    Math.max(
      0.001,
      now - transitionStart
    )
  );
}
  
const peakLevel =
  Math.max(
    0.0001,
    velocity
  );

const attackEnd =
  now + attack;

mixGain.gain.setValueAtTime(
  0.0001,
  now
);

mixGain.gain.exponentialRampToValueAtTime(
  peakLevel,
  attackEnd
);

/*
 * H/D envelope
 *
 * decay側：Attack終了後から指定時間で0へ直線減衰。
 * hold側 ：Attack終了後から指定時間Peakを保持。
 * 0      ：最短クリック。終了時は共通Releaseで閉じる。
 */
if (holdDecayValue > 0) {
  mixGain.gain.linearRampToValueAtTime(
    0.0001,
    Math.max(
      attackEnd + 0.001,
      gateEnd
    )
  );
} else {
  mixGain.gain.setValueAtTime(
    peakLevel,
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

let voiceOutputNode = mixGain;

if (filterEnabled) {
  mixGain
    .connect(filter1)
    .connect(filter2);

  voiceOutputNode = filter2;
}

if (panner) {
  voiceOutputNode.connect(panner);
  voiceOutputNode = panner;
}

/*
 * Track FX廃止後は、Pan後の信号をMaster Mixへ直結する。
 * Offline Export時だけFade用GainNodeを挟む。
 */
let exportFadeGain = null;
const fadeEnvelope = options.fadeEnvelope;

if (offlineRenderMode || fadeEnvelope) {
  exportFadeGain = sprootoDebugNode(context.createGain());
  exportFadeGain.gain.setValueAtTime(1, 0);

  if (fadeEnvelope) {
    const fadeInStart = Number(fadeEnvelope.fadeInStart);
    const fadeInEnd = Number(fadeEnvelope.fadeInEnd);
    const fadeOutStart = Number(fadeEnvelope.fadeOutStart);
    const fadeOutEnd = Number(fadeEnvelope.fadeOutEnd);

    if (Number.isFinite(fadeInStart) && Number.isFinite(fadeInEnd) && fadeInEnd > fadeInStart) {
      exportFadeGain.gain.setValueAtTime(0, fadeInStart);
      exportFadeGain.gain.linearRampToValueAtTime(1, fadeInEnd);
    }

    if (Number.isFinite(fadeOutStart) && Number.isFinite(fadeOutEnd) && fadeOutEnd > fadeOutStart) {
      exportFadeGain.gain.setValueAtTime(1, fadeOutStart);
      exportFadeGain.gain.linearRampToValueAtTime(0, fadeOutEnd);
    }
  }

  voiceOutputNode.connect(exportFadeGain);
  exportFadeGain.connect(mixInput);
} else {
  voiceOutputNode.connect(mixInput);
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

  const fmVoiceNodesForCleanup = [];
  const fmVoiceGainsForCleanup = [];
  let fmVoiceCleanupAt = releaseEnd;

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

      const sineGain = sprootoDebugNode(context.createGain(), "sineGain");
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
          sprootoDebugNode(context.createOscillator(), "osc");

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

        /*
         * Native sine cleanup
         *
         * iPhone長時間再生でOscillatorNodeのended通知も
         * Noiseと同様に途中から止まり、oscillator / sineGainが
         * 滞留することを確認。
         *
         * stop時刻は既知なので、ended依存をやめて
         * sineStopAt直後にsprooto側timerで明示releaseする。
         */
        if (!offlineRenderMode) {
          sprootoDebugTimeout(
            () => {
              sprootoDebugOscEndedWindow += 1;
              sprootoDebugReleaseNode(oscillator);
              sprootoDebugReleaseNode(sineGain);
            },
            Math.max(
              20,
              (
                sineStopAt -
                context.currentTime +
                0.05
              ) * 1000
            )
          );
        }
      } else {
        sprootoDebugFmWorkletCreatedTotal += 1;

        const fmVoice =
          sprootoDebugNode(
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
            )
          );

        fmVoice
          .connect(sineGain)
          .connect(mixGain);

        if (!offlineRenderMode) {
          fmVoiceNodesForCleanup.push(fmVoice);
          fmVoiceGainsForCleanup.push(sineGain);
          fmVoiceCleanupAt = Math.max(fmVoiceCleanupAt, sineStopAt);
        }
      }
    }
  }

  if (!offlineRenderMode && fmVoiceNodesForCleanup.length > 0) {
    sprootoDebugTimeout(
      () => {
        fmVoiceNodesForCleanup.forEach(sprootoDebugReleaseNode);
        fmVoiceGainsForCleanup.forEach(sprootoDebugReleaseNode);
      },
      Math.max(
        50,
        (fmVoiceCleanupAt - context.currentTime + 0.05) * 1000
      )
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
  sprootoDebugTimeout(
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
  const graphCleanupAt = releaseEnd + 0.15;

  sprootoDebugTimeout(
    () => {
      sprootoDebugCleanups += 1;

      /*
       * LFO sourceは停止後も接続が残るため切断する。
       */
      panLfoOscillators.forEach(
        sprootoDebugReleaseNode
      );

      panLfoGainNodes.forEach(
        sprootoDebugReleaseNode
      );

      filterLfoNodes.forEach(
        sprootoDebugReleaseNode
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
].forEach(
  sprootoDebugReleaseNode
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
    fmVoiceWorkletReady,
    audioClockReady,
    audioClockReadyPromise,
    offlineRenderMode,
    activeTrackVoices: [...activeTrackVoices.entries()]
  };

  context = offlineContext;

  offlineRenderMode = true;
  audioClockReady = true;
  audioClockReadyPromise = null;
  fmVoiceWorkletReady = null;
  spectrumData = null;
  outputTimeData = null;
  spectrumAnalyser = null;
  outputAnalyser = null;

  activeTrackVoices.clear();

  master = sprootoDebugNode(context.createGain());
  master.gain.value = clamp(Number(masterVolume) || 0, 0, 100) / 100;

  mixInput = sprootoDebugNode(context.createGain());

  const eqValues = Array.isArray(masterMix.eq)
    ? masterMix.eq
    : Array(8).fill(0);

  eqNodes = EQ_FREQUENCIES.map((frequency, index) => {
    const filter = sprootoDebugNode(context.createBiquadFilter());
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

  reverbDryGain = sprootoDebugNode(context.createGain());
  reverbWetGain = sprootoDebugNode(context.createGain());

  mixGain = sprootoDebugNode(context.createGain());
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


  await initializeFmVoiceWorklet();

  let restored = false;

  return function restoreOfflineAudioRender() {
    if (restored) return;
    restored = true;

    activeTrackVoices.clear();
    backup.activeTrackVoices.forEach(([key, value]) => {
      activeTrackVoices.set(key, value);
    });

    context = backup.context;

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
    fmVoiceWorkletReady = backup.fmVoiceWorkletReady;
    audioClockReady = backup.audioClockReady;
    audioClockReadyPromise = backup.audioClockReadyPromise;
    offlineRenderMode = backup.offlineRenderMode;
  };
}

