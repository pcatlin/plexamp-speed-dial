import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLEXAMP_ANDROID_PACKAGE,
  SONOS_ANDROID_PACKAGE,
  openPlexampApp,
  openSonosApp,
  plexampAppHref,
  sonosAppHref,
} from "./appLinks";

describe("sonosAppHref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses sonoscontroller on iOS", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    expect(sonosAppHref()).toBe("sonoscontroller://");
  });

  it("uses sonos-2 intent with the Sonos package on Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Android 14" });
    const href = sonosAppHref();
    expect(href).toContain("scheme=sonos-2");
    expect(href).toContain(`package=${SONOS_ANDROID_PACKAGE}`);
    expect(href).toContain(encodeURIComponent(playStore(SONOS_ANDROID_PACKAGE)));
  });
});

describe("plexampAppHref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses plexamp:// on iOS", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    expect(plexampAppHref()).toBe("plexamp://");
  });

  it("uses plexamp intent with the Plexamp package on Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Android 14" });
    const href = plexampAppHref();
    expect(href).toContain("scheme=plexamp");
    expect(href).toContain(`package=${PLEXAMP_ANDROID_PACKAGE}`);
    expect(href).toContain(encodeURIComponent(playStore(PLEXAMP_ANDROID_PACKAGE)));
  });
});

describe("openSonosApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assigns the intent href on Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Android 14" });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const preventDefault = vi.fn();
    openSonosApp({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(sonosAppHref());
  });

  it("does nothing on non-Android", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const preventDefault = vi.fn();
    openSonosApp({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("openPlexampApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("tries plexamp then listen.plex.tv on Android", () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { userAgent: "Android 14" });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    vi.stubGlobal("document", { visibilityState: "visible" });
    const preventDefault = vi.fn();

    openPlexampApp({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0]![0]).toContain("scheme=plexamp");
    expect(assign.mock.calls[0]![0]).not.toContain("browser_fallback_url");

    vi.advanceTimersByTime(600);
    expect(assign).toHaveBeenCalledTimes(2);
    expect(assign.mock.calls[1]![0]).toContain("listen.plex.tv/");
    expect(assign.mock.calls[1]![0]).toContain("scheme=https");
  });
});

function playStore(packageName: string): string {
  return `https://play.google.com/store/apps/details?id=${packageName}`;
}
