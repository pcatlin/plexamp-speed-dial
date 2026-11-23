import { describe, expect, it } from "vitest";

import {
  PIONEER_DEFAULT_ISCP_PORT,
  ampHostField,
  buildAudioOutput,
  parsePioneerHostField,
  pioneerAmpIdFromOutput,
  pioneerLabelForPlayer,
} from "./audioOutput";

describe("parsePioneerHostField", () => {
  it("defaults ISCP port to 60128", () => {
    expect(parsePioneerHostField("192.168.1.50")).toEqual({
      host: "192.168.1.50",
      port: PIONEER_DEFAULT_ISCP_PORT,
    });
  });

  it("parses host:port overrides", () => {
    expect(parsePioneerHostField("receiver.local:60129")).toEqual({
      host: "receiver.local",
      port: 60129,
    });
  });
});

describe("ampHostField", () => {
  it("omits default port from display value", () => {
    expect(ampHostField({ host: "10.0.0.5", port: 60128 })).toBe("10.0.0.5");
  });

  it("includes non-default port in display value", () => {
    expect(ampHostField({ host: "10.0.0.5", port: 60129 })).toBe("10.0.0.5:60129");
  });
});

describe("pioneerLabelForPlayer", () => {
  const player = {
    id: 1,
    name: "Caldera",
    host: "plexamp.local",
    port: 32500,
    is_active: true,
    audio_output: { kind: "pioneer" as const, config: { amp_id: 7 } },
  };

  it("prefers linked amp name", () => {
    expect(
      pioneerLabelForPlayer(player, [{ id: 7, name: "Living room", host: "10.0.0.5", port: 60128, input_code: "02" }]),
    ).toBe("Living room");
  });

  it("falls back to player name when amp is missing", () => {
    expect(pioneerLabelForPlayer(player, [])).toBe("Caldera");
  });
});

describe("buildAudioOutput pioneer", () => {
  it("stores amp_id", () => {
    expect(buildAudioOutput("pioneer", "", 3)).toEqual({
      kind: "pioneer",
      config: { amp_id: 3 },
    });
  });

  it("reads amp_id from output", () => {
    expect(pioneerAmpIdFromOutput({ kind: "pioneer", config: { amp_id: 9 } })).toBe(9);
  });
});
