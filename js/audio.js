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

function makeNoiseBuffer(duration) {
  const size = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, size, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export async function playTrackStep(track, stepIndex, delaySeconds = 0) {
  await initializeAudio();
  const now = context.currentTime + Math.max(0, Number(delaySeconds) || 0);
  const offset = id => track.offsets[id]?.[stepIndex] ?? 0;
  const note = 60 + track.base.note + offset("note");
  const velocity = clamp(track.base.velocity + offset("velocity"), 0, 100) / 100;
  const decay = Math.max(0.03, clamp(track.base.decay + offset("decay"), 1, 50) / 10);
  const depth = clamp(track.base.fmDepth + offset("fmDepth"), 0, 20);
  const tone = clamp(track.base.tone + offset("tone"), 0, 100);
  const panValue = (clamp(track.base.pan + offset("pan"), 0, 100) - 50) / 50;

  const output = context.createGain();
  const panner = context.createStereoPanner();
  const filter = context.createBiquadFilter();
  panner.pan.setValueAtTime(panValue, now);

  if (tone < 50) {
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(120 + Math.pow(tone / 50, 2) * 18000, now);
  } else if (tone > 50) {
    filter.type = "highpass";
    filter.frequency.setValueAtTime(Math.pow((tone - 50) / 50, 2) * 6000 + 20, now);
  } else {
    filter.type = "allpass";
  }

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity), now + 0.008);
  output.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  output.connect(filter).connect(panner).connect(master);

  const stopAt = now + decay + 0.03;
  const sineLevel = clamp(track.base.sine, 0, 100) / 100;
  if (sineLevel > 0) {
    const carrier = context.createOscillator();
    const sineGain = context.createGain();
    const modulator = context.createOscillator();
    const modulationGain = context.createGain();
    const carrierFrequency = frequency(note);
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(carrierFrequency, now);
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(carrierFrequency * Math.max(0.01, track.base.fmRatio), now);
    modulationGain.gain.setValueAtTime(carrierFrequency * depth * 0.1, now);
    sineGain.gain.value = sineLevel;
    modulator.connect(modulationGain).connect(carrier.frequency);
    carrier.connect(sineGain).connect(output);
    carrier.start(now); modulator.start(now);
    carrier.stop(stopAt); modulator.stop(stopAt);
  }

  const noiseLevel = clamp(track.base.noise, 0, 100) / 100;
  if (noiseLevel > 0) {
    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    noise.buffer = makeNoiseBuffer(decay + 0.05);
    noiseGain.gain.value = noiseLevel;
    noise.connect(noiseGain).connect(output);
    noise.start(now);
    noise.stop(stopAt);
  }
}

export function resumeAudio() {
  resumeAudioContext();
}