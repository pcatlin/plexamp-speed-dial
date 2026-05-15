import type { ToastState } from "./useToast";

type Props = {
  toast: ToastState | null;
};

export function Toast({ toast }: Props) {
  if (!toast) return null;
  return (
    <div className={`appToast appToast--${toast.phase}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}
