import { useEffect, useRef, useState, type RefObject } from "react";

function angleBetween(a: Touch, b: Touch) {
  return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
}

function normalizeAngleDelta(delta: number) {
  let value = delta;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, label, [role='slider'], [role='dialog'], .volumePopover, .modalBackdrop, .modalPanel",
    ),
  );
}

type Options = {
  enabled: boolean;
  /** Current volume 0–100 used as the gesture baseline. */
  getBaselineVolume: () => number;
  /** Apply an integer volume delta (may be called several times during a twist). */
  onVolumeDelta: (delta: number) => void;
  /** Called once when the two-finger gesture ends. */
  onGestureEnd?: () => void;
  /** Degrees of twist mapped across ±50 volume (default: half turn). */
  fullTwistVolume?: number;
};

/**
 * Two-finger twist-to-volume on `targetRef`. Single-finger scroll still works;
 * only an active two-finger gesture calls preventDefault.
 */
export function usePinchRotateVolume(targetRef: RefObject<HTMLElement | null>, options: Options) {
  const [overlayVolume, setOverlayVolume] = useState<number | null>(null);
  const [gesturing, setGesturing] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startAngleRef = useRef<number | null>(null);
  const baselineRef = useRef(0);
  const lastSentRef = useRef(0);
  const pendingDeltaRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const node = targetRef.current;
    if (!node) return;

    const flushPending = () => {
      flushTimerRef.current = null;
      const step = pendingDeltaRef.current;
      pendingDeltaRef.current = 0;
      if (step !== 0) optionsRef.current.onVolumeDelta(step);
    };

    const queueDelta = (step: number) => {
      pendingDeltaRef.current += step;
      if (flushTimerRef.current != null) return;
      flushTimerRef.current = setTimeout(flushPending, 80);
    };

    const resetGesture = () => {
      startAngleRef.current = null;
      setGesturing(false);
      setOverlayVolume(null);
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (pendingDeltaRef.current !== 0) flushPending();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!optionsRef.current.enabled) return;
      if (event.touches.length !== 2) {
        if (event.touches.length < 2) resetGesture();
        return;
      }
      if (isInteractiveTarget(event.target)) return;

      const angle = angleBetween(event.touches[0], event.touches[1]);
      const baseline = clampVolume(optionsRef.current.getBaselineVolume());
      startAngleRef.current = angle;
      baselineRef.current = baseline;
      lastSentRef.current = baseline;
      pendingDeltaRef.current = 0;
      setGesturing(true);
      setOverlayVolume(baseline);
      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startAngleRef.current == null || event.touches.length !== 2) return;
      event.preventDefault();

      const angle = angleBetween(event.touches[0], event.touches[1]);
      const delta = normalizeAngleDelta(angle - startAngleRef.current);
      const span = optionsRef.current.fullTwistVolume ?? 50;
      const next = clampVolume(baselineRef.current + (delta / Math.PI) * span);
      setOverlayVolume(next);

      const step = next - lastSentRef.current;
      if (step !== 0) {
        lastSentRef.current = next;
        queueDelta(step);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (startAngleRef.current == null) return;
      startAngleRef.current = null;
      setGesturing(false);
      setOverlayVolume(null);
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (pendingDeltaRef.current !== 0) flushPending();
      optionsRef.current.onGestureEnd?.();
    };

    node.addEventListener("touchstart", onTouchStart, { passive: false });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd);
    node.addEventListener("touchcancel", onTouchEnd);

    return () => {
      if (flushTimerRef.current != null) clearTimeout(flushTimerRef.current);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [targetRef]);

  return { overlayVolume, gesturing };
}
