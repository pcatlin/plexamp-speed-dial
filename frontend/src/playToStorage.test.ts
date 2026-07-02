import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_INITIAL_VOLUME } from "./initialVolumes";
import {
  loadPlayToState,
  loadSelectedSpeakerIds,
  reconcilePlayToState,
  reconcileSelectedSpeakerIds,
  savePlayToState,
  saveSelectedSpeakerIds,
} from "./playToStorage";

const PLAY_TO_KEY = "plexamp-speed-dial.playTo";
const LEGACY_KEY = "plexamp-speed-dial.selectedSpeakerIds";

describe("playToStorage", () => {
  afterEach(() => {
    localStorage.removeItem(PLAY_TO_KEY);
    localStorage.removeItem(LEGACY_KEY);
  });

  it("saves and loads full play-to state", () => {
    savePlayToState({
      speakerIds: ["a", "b"],
      playerId: 3,
      setVolumesOnPlay: true,
      sonosVolumes: { a: 25 },
      pioneerVolume: 40,
    });
    expect(loadPlayToState()).toEqual({
      speakerIds: ["a", "b"],
      playerId: 3,
      setVolumesOnPlay: true,
      sonosVolumes: { a: 25 },
      pioneerVolume: 40,
    });
  });

  it("migrates legacy speaker id storage", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(["kitchen"]));
    expect(loadPlayToState().speakerIds).toEqual(["kitchen"]);
  });

  it("saves and loads speaker ids via legacy helpers", () => {
    saveSelectedSpeakerIds(["a", "b"]);
    expect(loadSelectedSpeakerIds()).toEqual(["a", "b"]);
  });

  it("reconciles against available speakers", () => {
    expect(reconcileSelectedSpeakerIds(["a", "b", "gone"], ["a", "c"])).toEqual(["a"]);
  });

  it("reconciles play-to state against available players and speakers", () => {
    expect(
      reconcilePlayToState(
        {
          speakerIds: ["a", "gone"],
          playerId: 9,
          setVolumesOnPlay: true,
          sonosVolumes: { a: 30, gone: 10 },
          pioneerVolume: DEFAULT_INITIAL_VOLUME,
        },
        [1, 2],
        ["a"],
      ),
    ).toEqual({
      speakerIds: ["a"],
      playerId: null,
      setVolumesOnPlay: true,
      sonosVolumes: { a: 30 },
      pioneerVolume: DEFAULT_INITIAL_VOLUME,
    });
  });
});
