import { afterEach, describe, expect, it } from "vitest";

import {
  loadPickMusicState,
  reconcileSelectedCollectionId,
  savePickMusicState,
} from "./pickMusicStorage";

const KEY = "plexamp-speed-dial.pickMusic";

describe("pickMusicStorage", () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  it("saves and loads pick music state", () => {
    savePickMusicState({
      pickTab: "artist",
      selectedMedia: { id: "1", type: "artist", title: "Radiohead", subtitle: "Rock" },
      selectedCollectionId: "coll-1",
      artistRadio: false,
      shufflePlaylist: false,
      shuffleArtist: true,
      radioDegreesOfSeparation: 3,
    });
    expect(loadPickMusicState()).toEqual({
      pickTab: "artist",
      selectedMedia: { id: "1", type: "artist", title: "Radiohead", subtitle: "Rock" },
      selectedCollectionId: "coll-1",
      artistRadio: false,
      shufflePlaylist: false,
      shuffleArtist: true,
      radioDegreesOfSeparation: 3,
    });
  });

  it("reconciles collection id against available collections", () => {
    expect(reconcileSelectedCollectionId("gone", ["a", "b"])).toBe("");
    expect(reconcileSelectedCollectionId("b", ["a", "b"])).toBe("b");
  });
});
