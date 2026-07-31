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

export async function playTrackStep(
  track,
  stepIndex,
  delaySeconds = 0
) {
  await initializeAudio();

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
      ) / 100
    );

  const decay =
    Math.max(
      0.03,
      clamp(
        track.base.decay +
        offset("decay"),
        1,
        50
      ) / 10
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

  const output =
    context.createGain();

  const panner =
    context.createStereoPanner();

  const filter =
    context.createBiquadFilter();

  panner.pan.setValueAtTime(
    panValue,
    now
  );

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

  output.gain.setValueAtTime(
    0.0001,
    now
  );

  output.gain.exponentialRampToValueAtTime(
    Math.max(
      0.0001,
      velocity
    ),
    now + attack
  );

  output.gain.exponentialRampToValueAtTime(
    0.0001,
    now + attack + decay
  );

  output
    .connect(filter)
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
        decay +
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

  const stopAt =
    now +
    attack +
    decay +
    0.03;

  const sineLevel =
    clamp(
      track.base.sine,
      0,
      100
    ) / 100;

  if (sineLevel > 0) {
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

    carrier.type = "sine";

    carrier.frequency.setValueAtTime(
      carrierFrequency,
      now
    );

    modulator.type = "sine";

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

    sineGain.gain.value =
      sineLevel;

    modulator
      .connect(modulationGain)
      .connect(carrier.frequency);

    carrier
      .connect(sineGain)
      .connect(output);

    carrier.start(now);
    modulator.start(now);

    carrier.stop(stopAt);
    modulator.stop(stopAt);
  }

  const noiseLevel =
    clamp(
      track.base.noise,
      0,
      100
    ) / 100;

  if (noiseLevel > 0) {
    const noise =
      context.createBufferSource();

    const noiseGain =
      context.createGain();

    noise.buffer =
      makeNoiseBuffer(
        attack +
        decay +
        0.05
      );

    noiseGain.gain.value =
      noiseLevel;

    noise
      .connect(noiseGain)
      .connect(output);

    noise.start(now);
    noise.stop(stopAt);
  }
}

export function resumeAudio() {
  resumeAudioContext();
}