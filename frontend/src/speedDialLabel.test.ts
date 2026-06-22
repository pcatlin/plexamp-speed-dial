import { describe, expect, it } from "vitest";
import { buildSpeedDialLabel, formatSpeedDialPlayTarget, speedDialDisplayLabel } from "./speedDialLabel";

describe("speedDialDisplayLabel", () => {
  it("strips legacy player suffix", () => {
    expect(speedDialDisplayLabel("Morning Mix -> Kitchen")).toBe("Morning Mix");
  });

  it("keeps radio and shuffle suffixes", () => {
    expect(speedDialDisplayLabel("Artist Name (radio) (shuffle)")).toBe("Artist Name (radio) (shuffle)");
  });
});

describe("buildSpeedDialLabel", () => {
  it("returns title only when no options are set", () => {
    expect(buildSpeedDialLabel("Playlist A", {})).toBe("Playlist A");
  });

  it("appends radio and shuffle suffixes", () => {
    expect(buildSpeedDialLabel("Artist Name", { radio: true, shuffle: true })).toBe("Artist Name (radio) (shuffle)");
  });

  it("appends shuffle only for playlists", () => {
    expect(buildSpeedDialLabel("Playlist A", { shuffle: true })).toBe("Playlist A (shuffle)");
  });
});

describe("formatSpeedDialPlayTarget", () => {
  const speakers = [
    { id: "s1", name: "Bathroom" },
    { id: "s2", name: "Fridge" },
  ];

  it("shows speaker volumes when initial volumes are saved", () => {
    expect(
      formatSpeedDialPlayTarget({
        speakerIds: ["s1", "s2"],
        initialVolumes: { sonos: { s1: 20, s2: 10 } },
        isPioneer: false,
        pioneerLabel: "Pioneer AVR",
        speakers,
      }),
    ).toBe("Bathroom (20%), Fridge (10%)");
  });

  it("shows plain speaker names when no volumes are saved", () => {
    expect(
      formatSpeedDialPlayTarget({
        speakerIds: ["s1", "s2"],
        initialVolumes: null,
        isPioneer: false,
        pioneerLabel: "Pioneer AVR",
        speakers,
      }),
    ).toBe("Bathroom, Fridge");
  });

  it("shows pioneer volume when saved", () => {
    expect(
      formatSpeedDialPlayTarget({
        speakerIds: [],
        initialVolumes: { pioneer: 35 },
        isPioneer: true,
        pioneerLabel: "Pioneer AVR",
        speakers,
      }),
    ).toBe("Pioneer AVR (35%)");
  });
});
