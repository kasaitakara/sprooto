import {
  createSnapshot,
  restoreSnapshot,
  state
} from "./sequencer.js";

const STORAGE_KEY =
  "sprooto-autosave-v1";

const AUTOSAVE_DELAY = 500;

let autosaveTimer = null;

function makeStoredSnapshot() {
  const snapshot =
    createSnapshot();

  const bpmInput =
    document.getElementById(
      "bpm-input"
    );

  const masterVolumeInput =
    document.getElementById(
      "master-volume"
    );

  snapshot.appSettings = {
    bpm:
      Number(
        bpmInput?.value
      ) || 120,

    masterVolume:
      Number(
        masterVolumeInput?.value
      ) || 70
  };
  /*
   * 再生中の状態は保存しない。
   * 復元時は必ず停止状態にする。
   */
  snapshot.state.isPlaying =
    false;

  snapshot.state.playingStepIndex =
    null;

  snapshot.state.playingSourceType =
    null;

  snapshot.state.playingPatternIndex =
    null;

  snapshot.state.playingFillIndex =
    null;

  snapshot.state.playingSectionIndex =
    null;

  snapshot.state.playingSectionItemIndex =
    null;

  snapshot.state.queuedSourceType =
    null;

  snapshot.state.queuedPatternIndex =
    null;

  snapshot.state.queuedFillIndex =
    null;

  snapshot.state.queuedSectionIndex =
    null;

  return snapshot;
}

export function saveAutosave() {
  try {
    const snapshot =
      makeStoredSnapshot();

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(snapshot)
    );

    return true;
  } catch (error) {
    console.error(
      "sprooto autosave failed:",
      error
    );

    return false;
  }
}

export function scheduleAutosave() {
  clearTimeout(
    autosaveTimer
  );

  autosaveTimer =
    setTimeout(
      saveAutosave,
      AUTOSAVE_DELAY
    );
}

function migrateSnapshot(snapshot) {
  const sources = [
    ...(snapshot.patterns ?? []),
    ...(snapshot.fills ?? [])
  ];

  sources.forEach(source => {
    source?.tracks?.forEach(track => {
      if (!track.base) {
        track.base = {};
      }

      if (!track.offsets) {
        track.offsets = {};
      }

      const migratedSounds = [
        track,
        track?.pinSounds?.a,
        track?.pinSounds?.b,
        track?.pinSounds?.c
      ].filter(Boolean);

      migratedSounds.forEach(sound => {
        if (!sound.base) {
          sound.base = {};
        }

        if (!sound.offsets) {
          sound.offsets = {};
        }

        const articulationDefaults = {
          glide: 0,
          nudge: 0,
          strum: 0
        };

        Object.entries(articulationDefaults)
          .forEach(([id, defaultValue]) => {
            if (typeof sound.base[id] !== "number") {
              sound.base[id] = defaultValue;
            }

            if (!Array.isArray(sound.offsets[id])) {
              sound.offsets[id] = Array(64).fill(0);
            }
          });

        if (!["glide", "nudge", "strum"].includes(sound.articulationSelectedId)) {
          sound.articulationSelectedId = "glide";
        }
      });

      const chordDefaults = { chord: 0, voices: 4, inversion: 0, };
      Object.entries(chordDefaults).forEach(([id, defaultValue]) => {
        if (typeof track.base[id] !== "number") {
          track.base[id] = defaultValue;
        }
        if (!Array.isArray(track.offsets[id])) {
          track.offsets[id] = Array(64).fill(0);
        }
      });

      if (
        typeof track.base.attack !==
        "number"
      ) {
        track.base.attack = 1;
      }

      if (
        !Array.isArray(
          track.offsets.attack
        )
      ) {
        track.offsets.attack =
          Array(64).fill(0);
      }
    });
  });

  return snapshot;
}

export function restoreAutosave() {
  try {
    const storedText =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!storedText) {
      return false;
    }

    const snapshot =
      JSON.parse(
        storedText
      );

    if (
      !snapshot ||
      !Array.isArray(
        snapshot.patterns
      ) ||
      !Array.isArray(
        snapshot.fills
      ) ||
      !Array.isArray(
        snapshot.sections
      ) ||
      !snapshot.state
    ) {
      return false;
    }

    const migratedSnapshot =
  migrateSnapshot(
    snapshot
  );

restoreSnapshot(
  migratedSnapshot
);

const storedSettings =
  migratedSnapshot.appSettings;

if (storedSettings) {
  const bpmInput =
    document.getElementById(
      "bpm-input"
    );

  const masterVolumeInput =
    document.getElementById(
      "master-volume"
    );

  const masterVolumeValue =
    document.getElementById(
      "master-volume-value"
    );

  if (bpmInput) {
    const bpm =
      Math.min(
        300,
        Math.max(
          40,
          Math.round(
            Number(
              storedSettings.bpm
            ) || 120
          )
        )
      );

    bpmInput.value =
      String(bpm);
  }

  if (masterVolumeInput) {
    const masterVolume =
      Math.min(
        100,
        Math.max(
          0,
          Math.round(
            Number(
              storedSettings.masterVolume
            ) || 70
          )
        )
      );

    masterVolumeInput.value =
      String(
        masterVolume
      );

    if (masterVolumeValue) {
      masterVolumeValue.value =
        String(
          masterVolume
        );

      masterVolumeValue.textContent =
        String(
          masterVolume
        );
    }
  }
}

    /*
     * 古い保存データなどに再生状態が
     * 残っていても必ず停止する。
     */
    state.isPlaying =
      false;

    state.playingStepIndex =
      null;

    state.playingSourceType =
      null;

    state.playingPatternIndex =
      null;

    state.playingFillIndex =
      null;

    state.playingSectionIndex =
      null;

    state.playingSectionItemIndex =
      null;

    state.queuedSourceType =
      null;

    state.queuedPatternIndex =
      null;

    state.queuedFillIndex =
      null;

    state.queuedSectionIndex =
      null;

    return true;
  } catch (error) {
    console.error(
      "sprooto restore failed:",
      error
    );

    return false;
  }
}

export function initializeAutosave() {
  /*
   * 操作終了後に保存予約する。
   * setTimeoutを挟むことで、
   * 実際のデータ変更後に保存される。
   */
  [
    "pointerup",
    "change",
    "input",
    "keyup"
  ].forEach(
    eventName => {
      document.addEventListener(
        eventName,
        scheduleAutosave
      );
    }
  );

  /*
   * 他アプリへ移る直前にも即時保存する。
   */
  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState ===
        "hidden"
      ) {
        clearTimeout(
          autosaveTimer
        );

        saveAutosave();
      }
    }
  );

  window.addEventListener(
    "pagehide",
    saveAutosave
  );
}