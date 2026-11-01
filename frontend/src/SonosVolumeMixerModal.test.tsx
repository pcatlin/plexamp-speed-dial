import { describe, expect, it } from "vitest";

import type { Speaker } from "./api";
import { speakerIsPlayingSomethingElse } from "./SonosVolumeMixerModal";

function speaker(partial: Partial<Speaker> & Pick<Speaker, "id" | "name">): Speaker {
  return {
    ip: "192.168.1.10",
    volume: 20,
    source: null,
    playing: null,
    ...partial,
  };
}

describe("speakerIsPlayingSomethingElse", () => {
  it("is true only when transport playing is true", () => {
    expect(
      speakerIsPlayingSomethingElse(
        speaker({ id: "a", name: "A", source: "Spotify · Song", playing: true }),
      ),
    ).toBe(true);
  });

  it("is false when paused or idle even if a source label is present", () => {
    expect(
      speakerIsPlayingSomethingElse(
        speaker({ id: "a", name: "A", source: "Song — Artist", playing: false }),
      ),
    ).toBe(false);
    expect(
      speakerIsPlayingSomethingElse(speaker({ id: "a", name: "A", source: "Idle", playing: false })),
    ).toBe(false);
    expect(
      speakerIsPlayingSomethingElse(
        speaker({ id: "a", name: "A", source: "Grouped · Kitchen", playing: null }),
      ),
    ).toBe(false);
  });
});
