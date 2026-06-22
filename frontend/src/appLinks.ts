/** Deep links / intents to open native Sonos and Plexamp apps. */

export const SONOS_ANDROID_PACKAGE = "com.sonos.acr2";
export const PLEXAMP_ANDROID_PACKAGE = "tv.plex.labs.plexamp";

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

/** True on iOS and Android clients where native app links work from the browser. */
export function isMobileAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua);
}

function playStoreUrl(packageName: string): string {
  return `https://play.google.com/store/apps/details?id=${packageName}`;
}

function androidViewIntent(
  packageName: string,
  scheme: string,
  hostPath = "",
  withPlayStoreFallback = true,
): string {
  const parts = [`scheme=${scheme}`, `package=${packageName}`];
  if (withPlayStoreFallback) {
    parts.push(`S.browser_fallback_url=${encodeURIComponent(playStoreUrl(packageName))}`);
  }
  return `intent://${hostPath}#Intent;${parts.join(";")};end`;
}

export function sonosAppHref(): string {
  if (!isAndroid()) return "sonoscontroller://";
  // Sonos S2 registers sonos-2:// (sonoscontroller:// is iOS-only).
  return androidViewIntent(SONOS_ANDROID_PACKAGE, "sonos-2");
}

export function plexampAppHref(): string {
  if (isAndroid()) return androidViewIntent(PLEXAMP_ANDROID_PACKAGE, "plexamp");
  return "plexamp://";
}

function attemptAndroidAppOpen(
  event: { preventDefault: () => void },
  packageName: string,
  attempts: Array<{ scheme: string; hostPath?: string }>,
): void {
  if (!isAndroid()) return;
  event.preventDefault();

  let index = 0;
  const tryNext = () => {
    if (index >= attempts.length) {
      window.location.assign(androidViewIntent(packageName, attempts[0]!.scheme, attempts[0]!.hostPath));
      return;
    }
    const { scheme, hostPath = "" } = attempts[index]!;
    window.location.assign(androidViewIntent(packageName, scheme, hostPath, false));
    index += 1;
    window.setTimeout(() => {
      if (document.visibilityState === "visible") tryNext();
    }, 600);
  };

  tryNext();
}

export function openSonosApp(event: { preventDefault: () => void }): void {
  if (!isAndroid()) return;
  event.preventDefault();
  window.location.assign(sonosAppHref());
}

export function openPlexampApp(event: { preventDefault: () => void }): void {
  attemptAndroidAppOpen(event, PLEXAMP_ANDROID_PACKAGE, [
    { scheme: "plexamp" },
    { scheme: "https", hostPath: "listen.plex.tv/" },
  ]);
}
