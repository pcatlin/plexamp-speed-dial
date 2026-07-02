import { describe, expect, it } from "vitest";

import { artistOrderModeUsesShuffle, parseArtistOrderMode } from "./artistOrder";

describe("artistOrder", () => {
  it("parses stored order modes", () => {
    expect(parseArtistOrderMode("popular_order")).toBe("popular_order");
    expect(parseArtistOrderMode("popular_tracks_order")).toBe("popular_tracks_order");
  });

  it("migrates legacy external ratings mode", () => {
    expect(parseArtistOrderMode("external_ratings_order")).toBe("popular_tracks_order");
  });

  it("migrates legacy shuffleArtist boolean", () => {
    expect(parseArtistOrderMode(undefined, true)).toBe("shuffle");
    expect(parseArtistOrderMode(undefined, false)).toBe("album_order");
  });

  it("identifies shuffle mode", () => {
    expect(artistOrderModeUsesShuffle("shuffle")).toBe(true);
    expect(artistOrderModeUsesShuffle("album_order")).toBe(false);
  });
});
