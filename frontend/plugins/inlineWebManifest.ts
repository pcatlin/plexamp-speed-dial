import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const MANIFEST_PATH = resolve(import.meta.dirname, "../public/manifest.webmanifest");
const MANIFEST_LINK_RE = /<link rel="manifest" href="[^"]*"\s*\/?>/;

/** Embed manifest as a data URL so a separate /manifest.webmanifest fetch is not required (Cloudflare Access, etc.). */
export function inlineWebManifest(): Plugin {
  return {
    name: "inline-web-manifest",
    transformIndexHtml(html) {
      // Storybook (and other non-app HTML) has no app manifest link — leave it alone.
      if (!MANIFEST_LINK_RE.test(html)) {
        return html;
      }
      const json = readFileSync(MANIFEST_PATH, "utf-8").trim();
      const dataUrl = `data:application/manifest+json;base64,${Buffer.from(json, "utf-8").toString("base64")}`;
      return html.replace(MANIFEST_LINK_RE, `<link rel="manifest" href="${dataUrl}" />`);
    },
  };
}
