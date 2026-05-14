import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
