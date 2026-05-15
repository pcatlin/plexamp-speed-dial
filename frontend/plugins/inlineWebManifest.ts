import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const MANIFEST_PATH = resolve(__dirname, "../public/manifest.webmanifest");
const MANIFEST_LINK_RE = /<link rel="manifest" href="[^"]*"\s*\/?>/;

/** Embed manifest as a data URL so a separate /manifest.webmanifest fetch is not required (Cloudflare Access, etc.). */
export function inlineWebManifest(): Plugin {
  return {
    name: "inline-web-manifest",
    transformIndexHtml(html) {
      const json = readFileSync(MANIFEST_PATH, "utf-8").trim();
      const dataUrl = `data:application/manifest+json;base64,${Buffer.from(json, "utf-8").toString("base64")}`;
      if (!MANIFEST_LINK_RE.test(html)) {
        throw new Error("index.html: expected <link rel=\"manifest\" …> to replace");
      }
      return html.replace(MANIFEST_LINK_RE, `<link rel="manifest" href="${dataUrl}" />`);
    },
  };
}
