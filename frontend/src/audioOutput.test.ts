import { describe, expect, it } from "vitest";

import {
  PIONEER_DEFAULT_ISCP_PORT,
  parsePioneerHostField,
  pioneerHostFieldFromOutput,
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

describe("pioneerHostFieldFromOutput", () => {
  it("omits default port from display value", () => {
    expect(
      pioneerHostFieldFromOutput({
        kind: "pioneer",
        config: { host: "10.0.0.5", input_code: "02", port: 60128 },
      }),
    ).toBe("10.0.0.5");
  });

  it("includes non-default port in display value", () => {
    expect(
      pioneerHostFieldFromOutput({
        kind: "pioneer",
        config: { host: "10.0.0.5", input_code: "02", port: 60129 },
      }),
    ).toBe("10.0.0.5:60129");
  });
});
