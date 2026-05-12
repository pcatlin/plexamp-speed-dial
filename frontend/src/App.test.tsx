import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

const responses: Record<string, unknown> = {
  "/auth/plex/status": { connected: true, username: "owner" },
  "/media/playlists": [{ id: "playlist-1", title: "Top Mix", type: "playlist" }],
  "/sonos/speakers": [{ id: "s1", name: "Living Room", ip: "192.168.1.10" }],
  "/players": [{ id: 1, name: "Plexamp Kitchen", host: "host", port: 32500, is_active: true }],
  "/speed-dial": [],
  "/play": { status: "ok", details: "Playing now" },
  "/media/collections": [{ id: "col-1", title: "Test Collection" }],
};

function mockPayload(path: string): unknown {
  const direct = responses[path];
  if (direct !== undefined) return direct;
  if (path.startsWith("/media/random-album"))
    return { id: "album-rand", title: "Random Album", type: "album" };
  if (path.startsWith("/media"))
    return [{ id: "mock-1", title: "Mock item", type: "playlist" }];
  return { id: 1, message: "ok" };
}

globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const path = url.replace("http://localhost:8000/api/v1", "");
  const payload = mockPayload(path);
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

describe("App", () => {
  it("renders and executes play action", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Plexamp Sonos Speed Dial")).toBeInTheDocument());
    const playButton = screen.getByRole("button", { name: "Play" });
    fireEvent.click(playButton);
    await waitFor(() => expect(screen.getByText("Playing now")).toBeInTheDocument());
  });
});
