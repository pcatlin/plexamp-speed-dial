import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

describe("copyTextToClipboard", () => {
  beforeEach(() => {
    if (!document.execCommand) {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: vi.fn(),
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses execCommand when available", async () => {
    const execCommand = vi.spyOn(document, "execCommand").mockReturnValue(true);

    await expect(copyTextToClipboard("http://example.test/hook")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to Clipboard API when execCommand fails", async () => {
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await expect(copyTextToClipboard("http://example.test/hook")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("http://example.test/hook");
  });
});
