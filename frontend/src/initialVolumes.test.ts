import { describe, expect, it } from "vitest";
import {
  buildInitialVolumes,
  buildSpeedDialInitialVolumes,
  DEFAULT_INITIAL_VOLUME,
  hasSonosInitialVolumes,
  mergeSonosVolumes,
} from "./initialVolumes";

describe("mergeSonosVolumes", () => {
  it("defaults missing speaker ids to 20%", () => {
    expect(mergeSonosVolumes(["a", "b"], { a: 30 })).toEqual({ a: 30, b: DEFAULT_INITIAL_VOLUME });
  });
});

describe("buildInitialVolumes", () => {
  it("includes sonos and pioneer when configured", () => {
    expect(
      buildInitialVolumes({
        selectedSpeakerIds: ["s1"],
        sonosVolumes: { s1: 20 },
        pioneerVolume: 35,
        includePioneer: true,
      }),
    ).toEqual({ sonos: { s1: 20 }, pioneer: 35 });
  });

  it("returns undefined when nothing is configured", () => {
    expect(
      buildInitialVolumes({
        selectedSpeakerIds: [],
        sonosVolumes: {},
        pioneerVolume: 20,
        includePioneer: false,
      }),
    ).toBeUndefined();
  });
});

describe("buildSpeedDialInitialVolumes", () => {
  it("omits sonos volumes when set volume on play is off", () => {
    expect(
      buildSpeedDialInitialVolumes({
        speakerIds: ["s1"],
        sonosVolumes: { s1: 25 },
        setVolumesOnPlay: false,
      }),
    ).toBeNull();
  });

  it("stores sonos volumes when set volume on play is on", () => {
    expect(
      buildSpeedDialInitialVolumes({
        speakerIds: ["s1", "s2"],
        sonosVolumes: { s1: 25 },
        setVolumesOnPlay: true,
      }),
    ).toEqual({ sonos: { s1: 25, s2: DEFAULT_INITIAL_VOLUME } });
  });
});

describe("hasSonosInitialVolumes", () => {
  it("is false when sonos map is missing or empty", () => {
    expect(hasSonosInitialVolumes(null)).toBe(false);
    expect(hasSonosInitialVolumes({ sonos: {} })).toBe(false);
  });

  it("is true when sonos map has entries", () => {
    expect(hasSonosInitialVolumes({ sonos: { s1: 20 } })).toBe(true);
  });
});
