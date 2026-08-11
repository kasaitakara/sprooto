import { FACTORY_SOUND_PRESETS } from "./sound-presets.js";
import { normalizeSound } from "./sound-defaults.js";

const USER_PRESET_STORAGE_KEY = "sprooto-user-sound-presets-v1";

export const SOUND_CATEGORIES = [
  "kick", "snare", "hh", "cymbal", "perc",
  "bass", "lead", "pad", "fx", "other"
];

function clonePreset(preset) {
  return {
    ...preset,
    sound: normalizeSound(preset.sound)
  };
}

export function getFactoryPresets() {
  return FACTORY_SOUND_PRESETS.map(clonePreset);
}

export function getUserPresets() {
  try {
    const value = JSON.parse(localStorage.getItem(USER_PRESET_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => item && typeof item.id === "string")
      .map(item => ({
        id: item.id,
        category: SOUND_CATEGORIES.includes(item.category) ? item.category : "other",
        name: String(item.name || "User Sound"),
        sound: normalizeSound(item.sound)
      }));
  } catch {
    return [];
  }
}

function writeUserPresets(presets) {
  localStorage.setItem(USER_PRESET_STORAGE_KEY, JSON.stringify(presets));
}

export function saveUserPreset({ id = null, category, name, sound }) {
  const presets = getUserPresets();
  const normalizedCategory = SOUND_CATEGORIES.includes(category) ? category : "other";
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return null;

  if (id) {
    const index = presets.findIndex(preset => preset.id === id);
    if (index < 0) return null;
    presets[index] = {
      ...presets[index],
      category: normalizedCategory,
      name: normalizedName,
      sound: normalizeSound(sound)
    };
    writeUserPresets(presets);
    return clonePreset(presets[index]);
  }

  const preset = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: normalizedCategory,
    name: normalizedName,
    sound: normalizeSound(sound)
  };

  presets.push(preset);
  writeUserPresets(presets);
  return clonePreset(preset);
}

export function deleteUserPreset(id) {
  const presets = getUserPresets();
  const next = presets.filter(preset => preset.id !== id);
  if (next.length === presets.length) return false;
  writeUserPresets(next);
  return true;
}

export function captureTrackSound(track) {
  return normalizeSound({
    base: track.base,
    offsets: track.offsets,
    fxMuted: track.fxMuted,
    envelopeSelectedId: track.envelopeSelectedId,
    oscSelectedId: track.oscSelectedId,
    lfoSelected: track.lfoSelected
  });
}

export function applyTrackSound(track, sound, soundName) {
  const normalized = normalizeSound(sound);
  track.base = structuredClone(normalized.base);
  track.fxMuted = normalized.fxMuted;
  track.envelopeSelectedId = normalized.envelopeSelectedId;
  track.oscSelectedId = normalized.oscSelectedId;
  track.lfoSelected = normalized.lfoSelected;
  track.soundName = String(soundName || "sound");
}

export function soundsEqual(a, b) {
  return JSON.stringify(normalizeSound(a)) === JSON.stringify(normalizeSound(b));
}
