import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css";

// iOS Safari can still pinch-zoom despite viewport meta; block gesture events.
const blockZoomGesture = (event: Event) => event.preventDefault();
document.addEventListener("gesturestart", blockZoomGesture, { passive: false });
document.addEventListener("gesturechange", blockZoomGesture, { passive: false });
document.addEventListener("gestureend", blockZoomGesture, { passive: false });

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const scope = import.meta.env.BASE_URL;
    const swUrl = `${scope}sw.js`.replace(/\/{2,}/g, "/");
    void navigator.serviceWorker.register(swUrl, { scope }).catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
