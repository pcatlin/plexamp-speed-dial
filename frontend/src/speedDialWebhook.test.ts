import { describe, expect, it } from "vitest";

import { speedDialWebhookUrl } from "./api";

describe("speedDialWebhookUrl", () => {
  it("uses configured LAN base URL when set", () => {
    expect(speedDialWebhookUrl(7, "http://192.168.1.50")).toBe(
      "http://192.168.1.50/api/v1/speed-dial/7/webhook",
    );
  });

  it("strips trailing slash from configured base URL", () => {
    expect(speedDialWebhookUrl(7, "http://192.168.1.50/")).toBe(
      "http://192.168.1.50/api/v1/speed-dial/7/webhook",
    );
  });

  it("falls back to window origin when LAN URL is unset", () => {
    expect(speedDialWebhookUrl(7)).toBe("http://localhost:3000/api/v1/speed-dial/7/webhook");
  });
});
