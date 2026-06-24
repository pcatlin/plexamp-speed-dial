export const RADIO_RANDOMNESS_STEPS = [1, 2, 3, -1] as const;

export function radioRandomnessLabel(value: number): string {
  return value === -1 ? "Unlimited" : String(value);
}

export function radioRandomnessFromSliderIndex(index: number): number {
  const clamped = Math.max(0, Math.min(RADIO_RANDOMNESS_STEPS.length - 1, index));
  return RADIO_RANDOMNESS_STEPS[clamped];
}

export function radioRandomnessSliderIndex(value: number): number {
  const idx = (RADIO_RANDOMNESS_STEPS as readonly number[]).indexOf(value);
  return idx >= 0 ? idx : 0;
}
