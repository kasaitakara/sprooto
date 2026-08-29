import {
  patterns,
  fills,
  sections,
  song,
  state,
  clamp,
  resolveStepSound
} from "./sequencer.js";

import {
  playTrackStep,
  beginOfflineAudioRender
} from "./audio.js";

const EXPORT_SAMPLE_RATE = 48000;
const EXPORT_CHANNELS = 2;
const EXPORT_TAIL_MAX_SECONDS = 30;
const EXPORT_TAIL_MIN_SECONDS = 0.75;
const TAIL_SILENCE_THRESHOLD = 0.0001; // -80 dBFS
const TAIL_SILENCE_HOLD_SECONDS = 0.5;

const SUB_PATTERNS = Object.freeze([
  { divisions: 2, hits: [0, 1] },
  { divisions: 2, hits: [1] },
  { divisions: 3, hits: [0, 1, 2] },
  { divisions: 4, hits: [0, 1, 2, 3] },
  { divisions: 4, hits: [0, 2] },
  { divisions: 4, hits: [0, 1] },
  { divisions: 6, hits: [0, 1, 2, 3, 4, 5] }
]);

export class ExportCancelledError extends Error {
  constructor() {
    super("export cancelled");
    this.name = "ExportCancelledError";
  }
}

function assertNotCancelled(signal) {
  if (signal?.cancelled) {
    throw new ExportCancelledError();
  }
}

function sourceData(type, index) {
  return type === "fill"
    ? fills[index]
    : patterns[index];
}

function sourceLength(source) {
  const tracks = source?.tracks ?? [];
  return Math.max(
    1,
    ...tracks.map(track => clamp(Math.round(Number(track.stepLength) || 1), 1, 64))
  );
}

function flattenSection(sectionIndex) {
  const section = sections[sectionIndex];
  if (!section?.sequence?.length) return [];

  return section.sequence
    .map(item => ({ type: item.type, index: item.index }))
    .filter(item => sourceData(item.type, item.index));
}

function flattenTarget(target) {
  if (target === "song") {
    const result = [];

    song.sequence.forEach(part => {
      if (part.type === "section") {
        result.push(...flattenSection(part.index));
        return;
      }

      if (sourceData(part.type, part.index)) {
        result.push({ type: part.type, index: part.index });
      }
    });

    return result;
  }

  if (state.selectedPlaybackType === "section") {
    return flattenSection(state.selectedSectionIndex);
  }

  return [{
    type: state.selectedSourceType,
    index: state.selectedSourceType === "fill"
      ? state.selectedFillIndex ?? 0
      : state.selectedPatternIndex
  }].filter(item => sourceData(item.type, item.index));
}

function resolvedSoundValue(soundTrack, track, stepIndex, id, min, max) {
  const usingPin = soundTrack !== track;
  const offset = usingPin
    ? 0
    : Number(track.offsets[id]?.[stepIndex]) || 0;

  return clamp(
    Number(soundTrack.base[id]) + offset,
    min,
    max
  );
}

function subVelocityScale(crescendo, hitIndex, hitCount) {
  const amount = clamp(Math.round(Number(crescendo) || 0), -3, 3);
  if (amount === 0 || hitCount <= 1) return 1;

  const progress = hitIndex / (hitCount - 1);
  const depth = Math.abs(amount) * 0.25;

  return amount > 0
    ? 1 - depth * (1 - progress)
    : 1 - depth * progress;
}

function timingOffsetSeconds(track, stepIndex, bpm) {
  const quarterSeconds = 60 / Math.max(1, bpm);
  const unitSeconds = quarterSeconds / 64;
  const swingValue = clamp(Number(track.swing) || 0, -8, 8);

  const soundTrack =
    resolveStepSound(
      track,
      stepIndex
    );

  const usingPin =
    soundTrack !== track;

  const nudgeValue = clamp(
    Math.round(
      (Number(soundTrack.base.nudge) || 0) +
      (
        usingPin
          ? 0
          : (Number(track.offsets.nudge?.[stepIndex]) || 0)
      )
    ),
    -4,
    4
  );

  return (
    (stepIndex % 2 === 1 ? swingValue * unitSeconds : 0) +
    nudgeValue * unitSeconds
  );
}

function timingGuardSeconds(bpm) {
  return (60 / Math.max(1, bpm)) / 64 * 12;
}

function audibleTracks(source) {
  const sourceTracks = source?.tracks ?? [];
  const hasSolo = sourceTracks.some(track => track.solo);

  return sourceTracks.filter(
    track => !track.muted && (!hasSolo || track.solo)
  );
}

function estimateTailSafetySeconds(sources, bpm, masterReverbAmount = 0) {
  let required = Number(masterReverbAmount) > 0 ? 2.7 : EXPORT_TAIL_MIN_SECONDS;

  const inspectSound = (sound, track, stepIndex, usingPin = false) => {
    if (!sound?.base) return;

    const offset = id => usingPin
      ? 0
      : (Number(track.offsets?.[id]?.[stepIndex]) || 0);

    const gateValue = clamp((Number(sound.base.gate) || 5) + offset("gate"), 1, 100);
    const gateNormalized = (gateValue - 1) / 99;
    const gateSeconds = 0.005 + 9.995 * Math.pow(gateNormalized, 3);
    required = Math.max(required, gateSeconds + 0.15);
  };

  sources.forEach(item => {
    const source = sourceData(item.type, item.index);
    audibleTracks(source).forEach(track => {
      const length = clamp(Math.round(Number(track.stepLength) || 1), 1, 64);
      for (let stepIndex = 0; stepIndex < length; stepIndex++) {
        const pinSlot = track.pins?.[stepIndex] ?? null;
        const hasSound = Boolean(
          track.steps?.[stepIndex] ||
          pinSlot === "a" ||
          pinSlot === "b" ||
          pinSlot === "c"
        );
        if (!hasSound) continue;
        const sound = resolveStepSound(track, stepIndex);
        inspectSound(sound, track, stepIndex, sound !== track);
      }
    });
  });

  return clamp(required, EXPORT_TAIL_MIN_SECONDS, EXPORT_TAIL_MAX_SECONDS);
}

async function scheduleSource({
  source,
  sourceStartSeconds,
  bpm,
  headSeconds,
  guardSeconds,
  signal
}) {
  const stepSeconds = (60 / Math.max(1, bpm)) / 4;
  const length = sourceLength(source);
  const sourceTracks = audibleTracks(source);

  for (let tick = 0; tick < length; tick++) {
    assertNotCancelled(signal);

    for (const track of sourceTracks) {
      const trackStepIndex = tick % clamp(Math.round(Number(track.stepLength) || 1), 1, 64);
      const pinSlot = track.pins?.[trackStepIndex] ?? null;
      const hasSound = Boolean(
        track.steps?.[trackStepIndex] ||
        pinSlot === "a" ||
        pinSlot === "b" ||
        pinSlot === "c"
      );
      if (!hasSound) continue;

      const soundTrack = resolveStepSound(track, trackStepIndex);
      const probability = resolvedSoundValue(
        soundTrack,
        track,
        trackStepIndex,
        "probability",
        0,
        100
      );

      if (Math.random() * 100 >= probability) continue;

      const baseStart =
        guardSeconds +
        headSeconds +
        sourceStartSeconds +
        tick * stepSeconds +
        timingOffsetSeconds(track, trackStepIndex, bpm);

      const patternIndex = Math.round(
        resolvedSoundValue(
          soundTrack,
          track,
          trackStepIndex,
          "subPattern",
          -1,
          6
        )
      );

      const pattern = patternIndex >= 0
        ? SUB_PATTERNS[patternIndex]
        : null;

      if (!pattern) {
        await playTrackStep(track, trackStepIndex, Math.max(0, baseStart), { bpm });
        continue;
      }

      const subProbability = resolvedSoundValue(
        soundTrack,
        track,
        trackStepIndex,
        "subProbability",
        0,
        100
      );

      if (Math.random() * 100 >= subProbability) {
        await playTrackStep(track, trackStepIndex, Math.max(0, baseStart), { bpm });
        continue;
      }

      const crescendo = resolvedSoundValue(
        soundTrack,
        track,
        trackStepIndex,
        "subCrescendo",
        -3,
        3
      );

      for (let hitIndex = 0; hitIndex < pattern.hits.length; hitIndex++) {
        const subIndex = pattern.hits[hitIndex];
        const eventTime = baseStart + stepSeconds * (subIndex / pattern.divisions);

        await playTrackStep(
          track,
          trackStepIndex,
          Math.max(0, eventTime),
          {
            bpm,
            velocityScale: subVelocityScale(crescendo, hitIndex, pattern.hits.length)
          }
        );
      }
    }
  }

  return length * stepSeconds;
}

function findTailEndFrame(buffer, bodyEndFrame) {
  const holdFrames = Math.max(
    1,
    Math.round(TAIL_SILENCE_HOLD_SECONDS * buffer.sampleRate)
  );
  const blockFrames = Math.max(1, Math.round(buffer.sampleRate * 0.01));
  let silenceFrames = 0;
  let silenceStart = bodyEndFrame;

  for (let start = bodyEndFrame; start < buffer.length; start += blockFrames) {
    const end = Math.min(buffer.length, start + blockFrames);
    let peak = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let frame = start; frame < end; frame++) {
        const absolute = Math.abs(data[frame]);
        if (absolute > peak) peak = absolute;
      }
    }

    if (peak <= TAIL_SILENCE_THRESHOLD) {
      if (silenceFrames === 0) silenceStart = start;
      silenceFrames += end - start;
      if (silenceFrames >= holdFrames) {
        return Math.max(bodyEndFrame, silenceStart);
      }
    } else {
      silenceFrames = 0;
      silenceStart = end;
    }
  }

  return buffer.length;
}

function copyProcessedChannels({
  buffer,
  guardFrames,
  outputEndFrame,
  headSeconds,
  bodyDuration,
  fadeInSeconds,
  fadeOutSeconds
}) {
  const sampleRate = buffer.sampleRate;
  const outputLength = Math.max(1, outputEndFrame - guardFrames);
  const channels = Array.from(
    { length: EXPORT_CHANNELS },
    (_, channelIndex) => {
      const source = buffer.getChannelData(
        Math.min(channelIndex, buffer.numberOfChannels - 1)
      );
      return source.slice(guardFrames, outputEndFrame);
    }
  );

  const bodyStart = Math.round(headSeconds * sampleRate);
  const bodyEnd = Math.min(
    outputLength,
    Math.round((headSeconds + bodyDuration) * sampleRate)
  );

  const fadeInFrames = Math.min(
    Math.round(Math.max(0, fadeInSeconds) * sampleRate),
    Math.max(0, bodyEnd - bodyStart)
  );

  const fadeOutFrames = Math.min(
    Math.round(Math.max(0, fadeOutSeconds) * sampleRate),
    Math.max(0, bodyEnd - bodyStart)
  );

  channels.forEach(data => {
    for (let index = 0; index < fadeInFrames; index++) {
      const gain = fadeInFrames <= 1
        ? 1
        : index / (fadeInFrames - 1);
      data[bodyStart + index] *= gain;
    }

    const fadeOutStart = Math.max(bodyStart, bodyEnd - fadeOutFrames);
    for (let frame = fadeOutStart; frame < bodyEnd; frame++) {
      const gain = fadeOutFrames <= 1
        ? 0
        : (bodyEnd - 1 - frame) / (fadeOutFrames - 1);
      data[frame] *= clamp(gain, 0, 1);
    }
  });

  return channels;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function encodeWav24(channels, sampleRate) {
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = 3;
  const blockAlign = channels.length * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels.length; channel++) {
      const sample = clamp(channels[channel][frame] || 0, -1, 1);
      let integer = sample < 0
        ? Math.round(sample * 0x800000)
        : Math.round(sample * 0x7fffff);

      if (integer < 0) integer += 0x1000000;

      view.setUint8(offset, integer & 0xff);
      view.setUint8(offset + 1, (integer >> 8) & 0xff);
      view.setUint8(offset + 2, (integer >> 16) & 0xff);
      offset += 3;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function renderExportWav({
  target = "song",
  endMode = "tail",
  headSeconds = 0,
  fadeInSeconds = 0,
  fadeOutSeconds = 0,
  bpm = 120,
  masterVolume = 70,
  signal = null,
  onProgress = null
} = {}) {
  assertNotCancelled(signal);

  const sources = flattenTarget(target);
  if (!sources.length) {
    throw new Error(target === "song" ? "song is empty" : "part is empty");
  }

  const safeBpm = clamp(Number(bpm) || 120, 40, 300);
  const safeHead = endMode === "loop" ? 0 : clamp(Number(headSeconds) || 0, 0, 5);
  const safeFadeIn = endMode === "loop" ? 0 : clamp(Number(fadeInSeconds) || 0, 0, 30);
  const safeFadeOut = endMode === "loop" ? 0 : clamp(Number(fadeOutSeconds) || 0, 0, 30);
  const guardSeconds = timingGuardSeconds(safeBpm);

  let bodyDuration = 0;
  sources.forEach(item => {
    bodyDuration += sourceLength(sourceData(item.type, item.index)) * ((60 / safeBpm) / 4);
  });

  const tailSafety = endMode === "tail"
    ? estimateTailSafetySeconds(
        sources,
        safeBpm,
        song.masterMix?.reverb ?? 0
      )
    : 0;

  const renderDuration = Math.max(
    0.1,
    guardSeconds + safeHead + bodyDuration + tailSafety
  );

  const frameLength = Math.ceil(renderDuration * EXPORT_SAMPLE_RATE);
  const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;

  if (!OfflineAudioContextClass) {
    throw new Error("offline audio rendering is not supported in this browser");
  }

  onProgress?.(4, "preparing");

  const offlineContext = new OfflineAudioContextClass(
    EXPORT_CHANNELS,
    frameLength,
    EXPORT_SAMPLE_RATE
  );

  const restoreAudio = await beginOfflineAudioRender(
    offlineContext,
    {
      masterMix: song.masterMix,
      masterVolume
    }
  );

  try {
    let sourceStartSeconds = 0;

    for (let index = 0; index < sources.length; index++) {
      assertNotCancelled(signal);
      const item = sources[index];
      const source = sourceData(item.type, item.index);

      await scheduleSource({
        source,
        sourceStartSeconds,
        bpm: safeBpm,
        headSeconds: safeHead,
        guardSeconds,
        signal
      });

      sourceStartSeconds += sourceLength(source) * ((60 / safeBpm) / 4);
      onProgress?.(
        8 + Math.round(((index + 1) / sources.length) * 16),
        "preparing"
      );
    }

    assertNotCancelled(signal);
    onProgress?.(25, "rendering");

    const renderedBuffer = await offlineContext.startRendering();
    assertNotCancelled(signal);
    onProgress?.(93, "processing");

    const guardFrames = Math.round(guardSeconds * EXPORT_SAMPLE_RATE);
    const rawBodyEndFrame = Math.min(
      renderedBuffer.length,
      Math.round((guardSeconds + safeHead + bodyDuration) * EXPORT_SAMPLE_RATE)
    );

    const rawEndFrame = endMode === "loop"
      ? rawBodyEndFrame
      : findTailEndFrame(renderedBuffer, rawBodyEndFrame);

    const channels = copyProcessedChannels({
      buffer: renderedBuffer,
      guardFrames,
      outputEndFrame: rawEndFrame,
      headSeconds: safeHead,
      bodyDuration,
      fadeInSeconds: safeFadeIn,
      fadeOutSeconds: safeFadeOut
    });

    assertNotCancelled(signal);
    const blob = encodeWav24(channels, EXPORT_SAMPLE_RATE);
    onProgress?.(100, "done");

    return {
      blob,
      sampleRate: EXPORT_SAMPLE_RATE,
      bitDepth: 24,
      channels: EXPORT_CHANNELS,
      duration: channels[0].length / EXPORT_SAMPLE_RATE,
      bodyDuration,
      headSeconds: safeHead
    };
  } finally {
    restoreAudio();
  }
}
