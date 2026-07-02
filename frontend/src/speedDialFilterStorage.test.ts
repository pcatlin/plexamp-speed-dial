import { afterEach, describe, expect, it } from "vitest";

import {
  loadSpeedDialFilters,
  reconcileSpeedDialFilters,
  saveSpeedDialFilters,
} from "./speedDialFilterStorage";

const KEY = "plexamp-speed-dial.speedDialFilters";

describe("speedDialFilterStorage", () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  it("saves and loads filter choices", () => {
    saveSpeedDialFilters({ playerId: 2, speakerId: "bathroom" });
    expect(loadSpeedDialFilters()).toEqual({ playerId: 2, speakerId: "bathroom" });
  });

  it("reconciles against available players and speakers", () => {
    expect(
      reconcileSpeedDialFilters({ playerId: 9, speakerId: "gone" }, [1, 2], ["kitchen"]),
    ).toEqual({ playerId: null, speakerId: null });
    expect(
      reconcileSpeedDialFilters({ playerId: 2, speakerId: "kitchen" }, [1, 2], ["kitchen"]),
    ).toEqual({ playerId: 2, speakerId: "kitchen" });
  });
});
