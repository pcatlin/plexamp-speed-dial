import { afterEach, describe, expect, it } from "vitest";

import {
  loadSelectedSpeakerIds,
  reconcileSelectedSpeakerIds,
  saveSelectedSpeakerIds,
} from "./playToStorage";

const KEY = "plexamp-speed-dial.selectedSpeakerIds";

describe("playToStorage", () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  it("saves and loads speaker ids", () => {
    saveSelectedSpeakerIds(["a", "b"]);
    expect(loadSelectedSpeakerIds()).toEqual(["a", "b"]);
  });

  it("reconciles against available speakers", () => {
    expect(reconcileSelectedSpeakerIds(["a", "b", "gone"], ["a", "c"])).toEqual(["a"]);
  });
});
