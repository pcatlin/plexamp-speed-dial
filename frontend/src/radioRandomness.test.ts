import { describe, expect, it } from "vitest";
import {
  radioRandomnessFromSliderIndex,
  radioRandomnessLabel,
  radioRandomnessSliderIndex,
} from "./radioRandomness";

describe("radioRandomness", () => {
  it("maps slider positions to API values", () => {
    expect(radioRandomnessFromSliderIndex(0)).toBe(1);
    expect(radioRandomnessFromSliderIndex(1)).toBe(2);
    expect(radioRandomnessFromSliderIndex(2)).toBe(3);
    expect(radioRandomnessFromSliderIndex(3)).toBe(-1);
  });

  it("maps API values back to slider positions", () => {
    expect(radioRandomnessSliderIndex(1)).toBe(0);
    expect(radioRandomnessSliderIndex(2)).toBe(1);
    expect(radioRandomnessSliderIndex(3)).toBe(2);
    expect(radioRandomnessSliderIndex(-1)).toBe(3);
  });

  it("labels unlimited separately", () => {
    expect(radioRandomnessLabel(2)).toBe("2");
    expect(radioRandomnessLabel(-1)).toBe("Unlimited");
  });
});
