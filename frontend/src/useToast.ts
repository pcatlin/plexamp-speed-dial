import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 10_000;
const TOAST_EXIT_MS = 280;

export type ToastState = {
  text: string;
  phase: "enter" | "visible" | "exit";
};

export function useToast(durationMs = TOAST_DURATION_MS) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const beginExit = useCallback(() => {
    setToast((current) => {
      if (!current || current.phase === "exit") return current;
      return { ...current, phase: "exit" };
    });
    exitTimerRef.current = setTimeout(() => {
      setToast(null);
      exitTimerRef.current = null;
    }, TOAST_EXIT_MS);
  }, []);

  const showToast = useCallback(
    (text: string) => {
      clearTimers();

      setToast({ text, phase: "enter" });
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setToast((current) => (current?.text === text ? { text, phase: "visible" } : current));
          rafRef.current = null;
        });
      });

      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        beginExit();
      }, durationMs);
    },
    [clearTimers, beginExit, durationMs],
  );

  useEffect(() => clearTimers, [clearTimers]);

  return { toast, showToast };
}
