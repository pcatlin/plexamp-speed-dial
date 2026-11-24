/** Light tick for each volume change. No-op where Vibration API is missing (e.g. iOS Safari). */
export function hapticForVolumeChange(from: number, to: number) {
  if (from === to) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(10);
}
