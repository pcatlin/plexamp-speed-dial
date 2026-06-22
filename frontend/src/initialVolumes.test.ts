import { describe, expect, it } from "vitest";
import { buildInitialVolumes, DEFAULT_INITIAL_VOLUME, mergeSonosVolumes } from "./initialVolumes";

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
