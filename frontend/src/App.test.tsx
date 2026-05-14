import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

const responses: Record<string, unknown> = {
  "/auth/plex/status": { connected: true, username: "owner" },
  "/media/playlists": [{ id: "playlist-1", title: "Top Mix", type: "playlist" }],
  "/sonos/speakers": [{ id: "s1", name: "Living Room", ip: "192.168.1.10" }],
  "/sonos/playback-state": { ok: true, playing: false, state: null, error: null },
  "/plexamp/playback-state": { ok: true, playing: false, state: null, error: null },
  "/players": [{ id: 1, name: "Plexamp Kitchen", host: "host", port: 32500, is_active: true }],
  "/speed-dial": [],
  "/play": { status: "ok", details: "Playing now" },
  "/media/collections": [{ id: "col-1", title: "Test Collection" }],
};

function mockPayload(path: string): unknown {
  const direct = responses[path];
  if (direct !== undefined) return direct;
  if (path.startsWith("/media/suggestions")) return { most_played: [], unplayed: [], random: [] };
  if (path.startsWith("/media/search")) return [];
  if (path.startsWith("/media/random-album"))
    return { id: "album-rand", title: "Random Album", type: "album" };
  if (path.startsWith("/media"))
    return [{ id: "mock-1", title: "Mock item", type: "playlist" }];
  return { id: 1, message: "ok" };
}

function apiPathFromFetchInput(input: RequestInfo | URL): string {
  const raw = input instanceof Request ? input.url : String(input);
  const pathname = new URL(raw, "http://localhost").pathname;
  return pathname.startsWith("/api/v1") ? pathname.slice("/api/v1".length) : pathname;
}

globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  const path = apiPathFromFetchInput(input);
  const payload = mockPayload(path);
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

describe("App", () => {
  it("renders and executes play action", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Plexamp Sonos Speed Dial")).toBeInTheDocument());
    await waitFor(() => {
      const sel = document.getElementById("pick-playlist") as HTMLSelectElement | null;
      expect(sel?.value).toBe("playlist-1");
    });
    const startButton = screen.getByRole("button", { name: "Start" });
    fireEvent.click(startButton);
    await waitFor(() => expect(screen.getByText("Playing now")).toBeInTheDocument());
  });

  it("opens credits from footer link and returns via hash", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Plexamp Sonos Speed Dial")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("link", { name: "Credits" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Credits", level: 1 })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("link", { name: /Back to app/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Plexamp Sonos Speed Dial", level: 1 })).toBeInTheDocument());
  });
});
