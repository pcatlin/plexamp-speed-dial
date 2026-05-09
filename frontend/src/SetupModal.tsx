import { useEffect, useState } from "react";
import type { Player, RuntimeSettings } from "./api";
import { api } from "./api";

function parsePlexampEndpoint(raw: string): { label: string; host: string; port: number } {
  const s = raw.trim();
  if (!s) throw new Error("Enter a Plexamp hostname or URL.");
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const host = url.hostname;
      if (!host) throw new Error("Missing hostname");
      const port = url.port ? parseInt(url.port, 10) : 32500;
      return { label: host, host, port };
    } catch {
      throw new Error("Invalid URL.");
    }
  }
  const first = s.split(/[/\s]/)[0] ?? "";
  if (first.includes(":")) {
    const [maybeHost, portStr] = first.split(":");
    const port = Number.parseInt(portStr ?? "", 10);
    const host = (maybeHost ?? "").trim();
    if (host && Number.isFinite(port) && port > 0 && port < 65536) {
      return { label: host, host, port };
    }
  }
  return { label: first, host: first, port: 32500 };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onPlayersUpdated: () => Promise<void>;
  afterRuntimeSaved?: () => Promise<void>;
  /** Sync parent after Plex OAuth completes (reload library, etc.). */
  onPlexAuthRefresh?: () => Promise<void>;
  onToast: (message: string) => void;
};

export function SetupModal({
  open,
  onClose,
  onPlayersUpdated,
  afterRuntimeSaved,
  onPlexAuthRefresh,
  onToast,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authConnected, setAuthConnected] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [plexUrl, setPlexUrl] = useState("");
  const [plexUrlEffective, setPlexUrlEffective] = useState("");
  const [plexSslVerify, setPlexSslVerify] = useState(true);
  const [sonosSeeds, setSonosSeeds] = useState("");
  const [sonosTimeout, setSonosTimeout] = useState(10);
  const [sonosScan, setSonosScan] = useState(true);
  const [sonosIface, setSonosIface] = useState("");
  const [sonosDemo, setSonosDemo] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerInput, setPlayerInput] = useState("");
  const [playerNameHint, setPlayerNameHint] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [settings, plist, auth] = await Promise.all([api.runtimeSettings(), api.players(), api.authStatus()]);
        if (cancelled) return;
        applySettings(settings);
        setPlayers(plist);
        setAuthConnected(auth.connected);
        setAuthUsername(auth.username ?? "");
        setPlayerInput("");
        setPlayerNameHint("");
      } catch (e) {
        onToast(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally reload only when modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function applySettings(s: RuntimeSettings) {
    setPlexUrl(s.plex_server_url);
    setPlexUrlEffective(s.plex_server_url_effective);
    setPlexSslVerify(s.plex_ssl_verify);
    setSonosSeeds(s.sonos_seed_ips);
    setSonosTimeout(s.sonos_discover_timeout);
    setSonosScan(s.sonos_allow_network_scan);
    setSonosIface(s.sonos_interface_addr);
    setSonosDemo(s.sonos_demo_fallback);
  }

  const saveSetup = async () => {
    setBusy(true);
    try {
      const saved = await api.saveRuntimeSettings({
        plex_server_url: plexUrl.trim(),
        plex_ssl_verify: plexSslVerify,
        sonos_seed_ips: sonosSeeds.trim(),
        sonos_discover_timeout: sonosTimeout,
        sonos_allow_network_scan: sonosScan,
        sonos_interface_addr: sonosIface.trim(),
        sonos_demo_fallback: sonosDemo,
      });
      applySettings(saved);
      await afterRuntimeSaved?.().catch(() => undefined);
      onToast("Setup saved.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addPlayer = async () => {
    setBusy(true);
    try {
      const { label, host, port } = parsePlexampEndpoint(playerInput || playerNameHint);
      const name = playerNameHint.trim() || label;
      await api.createPlayer({ name, host, port, is_active: true });
      setPlayers(await api.players());
      setPlayerInput("");
      setPlayerNameHint("");
      await onPlayersUpdated();
      onToast(`Added Plexamp player ${name} (${host}:${port}).`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const testPlexServer = async () => {
    setBusy(true);
    try {
      const r = await api.plexServerTest();
      const libs = r.music_library_sections.join(", ") || "(none)";
      onToast(
        r.ok
          ? `Plex OK — ${r.friendly_name ?? "server"} @ ${r.configured_url}. Music libs: ${libs}. ${r.error_detail ?? ""}`.trim()
          : `Plex check failed (${r.configured_url || "no URL"}): ${r.error_detail ?? "unknown"} (ssl_verify=${r.ssl_verify_enabled})`,
      );
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const connectPlex = async () => {
    setBusy(true);
    onToast("Opening Plex sign-in — approve this app in the browser window…");
    try {
      const start = await api.startAuth();
      window.open(start.auth_url, "_blank", "noopener,noreferrer");
      let finished = false;
      for (let i = 0; i < 90; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api.pollPlexPin(start.pin_id);
        if (st.status === "connected") {
          finished = true;
          setAuthConnected(true);
          setAuthUsername(st.username ?? "");
          onToast("Plex linked. Loading your library…");
          await onPlexAuthRefresh?.().catch(() => undefined);
          onToast(`Plex linked as ${st.username ?? "account"}`);
          break;
        }
      }
      if (!finished) {
        const last = await api.authStatus();
        if (!last.connected) {
          onToast("Still waiting for Plex approval, or sign-in timed out. Try Connect again.");
        }
      }
    } catch (e) {
      onToast(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removePlayer = async (id: number) => {
    setBusy(true);
    try {
      await api.deletePlayer(id);
      const plist = await api.players();
      setPlayers(plist);
      await onPlayersUpdated();
      onToast("Removed player.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modalPanel" role="dialog" aria-modal="true" aria-labelledby="setup-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2 id="setup-title">Setup</h2>
          <button type="button" className="ghost" disabled={busy} onClick={() => onClose()} aria-label="Close setup">
            Close
          </button>
        </div>

        {loading ? <p className="hint">Loading…</p> : null}

        <section className="modalSection">
          <h3>Plex account</h3>
          <p>{authConnected ? `Connected as ${authUsername || "owner"}` : "Not connected"}</p>
          <p className="hint">
            Set the server URL in the next section first (or rely on env). Then link your Plex account; after that you can run a
            server test with your saved token.
          </p>
          <div className="modalButtonRow">
            <button type="button" disabled={busy || loading || !authConnected} onClick={() => void testPlexServer()}>
              Test Plex server
            </button>
            <button type="button" disabled={busy || loading} onClick={() => void connectPlex()}>
              {authConnected ? "Reconnect Plex" : "Connect Plex"}
            </button>
          </div>
          {!authConnected ? <p className="hint">Connect Plex first — the server test requires a linked account.</p> : null}
        </section>

        <section className="modalSection">
          <h3>Plex Media Server</h3>
          <label className="fieldLabel">
            Base URL (empty = env <code>PLEX_SERVER_URL</code>)
            <input
              type="url"
              className="textInput"
              placeholder="http://192.168.1.10:32400"
              autoComplete="off"
              value={plexUrl}
              onChange={(e) => setPlexUrl(e.target.value)}
            />
          </label>
          <p className="hint">
            Effective URL:{" "}
            <code>{plexUrlEffective || "(not set)"}</code>
          </p>
          <label className="checkboxRow slim">
            <input type="checkbox" checked={plexSslVerify} onChange={(e) => setPlexSslVerify(e.target.checked)} />
            Verify HTTPS certificates (disable for insecure / self-signed PMS HTTPS)
          </label>
        </section>

        <section className="modalSection">
          <h3>Sonos discovery</h3>
          <p className="hint">
            Stored in this app&apos;s database. Use comma-separated IPs of any ZonePlayer when multicast fails (Docker, VLANs).
          </p>
          <label className="fieldLabel">
            Seed IPs
            <input
              type="text"
              className="textInput"
              placeholder="192.168.1.20, 192.168.1.21"
              value={sonosSeeds}
              onChange={(e) => setSonosSeeds(e.target.value)}
            />
          </label>
          <label className="fieldLabel">
            Discover timeout (seconds)
            <input
              type="number"
              className="textInput narrow"
              min={2}
              max={60}
              value={sonosTimeout}
              onChange={(e) => setSonosTimeout(Number(e.target.value) || 10)}
            />
          </label>
          <label className="checkboxRow slim">
            <input type="checkbox" checked={sonosScan} onChange={(e) => setSonosScan(e.target.checked)} />
            Allow network scan (SoCo SSDP fallback)
          </label>
          <label className="fieldLabel">
            Interface address (optional)
            <input type="text" className="textInput" placeholder="192.168.1.50" value={sonosIface} onChange={(e) => setSonosIface(e.target.value)} />
          </label>
          <label className="checkboxRow slim warning">
            <input type="checkbox" checked={sonosDemo} onChange={(e) => setSonosDemo(e.target.checked)} />
            Demo speaker fallback (placeholder devices if nothing discovered)
          </label>
        </section>

        <section className="modalSection">
          <h3>Plexamp players</h3>
          <p className="hint">
            Hostname, IP, <code>http://host:32500</code>, or <code>host:32500</code>. Companion port defaults to{" "}
            <code>32500</code>.
          </p>
          <div className="inlineGrow">
            <label className="fieldLabel mb0 stretch">
              Add player
              <input
                type="text"
                className="textInput"
                placeholder="192.168.1.5 or http://kitchen.local:32500"
                value={playerInput}
                onChange={(e) => {
                  setPlayerInput(e.target.value);
                  setPlayerNameHint("");
                }}
              />
            </label>
            <label className="fieldLabel mb0 stretch">
              Display name (optional)
              <input
                type="text"
                className="textInput"
                placeholder="Kitchen Plexamp"
                value={playerNameHint}
                onChange={(e) => setPlayerNameHint(e.target.value)}
              />
            </label>
            <button type="button" className="nowrap" disabled={busy} onClick={() => void addPlayer()}>
              Add
            </button>
          </div>
          <ul className="playerList">
            {players.map((p) => (
              <li key={p.id}>
                <span className="playerMeta">
                  <strong>{p.name}</strong>
                  <span className="dim">
                    {" "}
                    {p.host}:{p.port}
                  </span>
                </span>
                <button type="button" className="danger nowrap" disabled={busy} onClick={() => void removePlayer(p.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {players.length === 0 ? <p className="hint">No players yet.</p> : null}
        </section>

        <div className="modalActions">
          <button type="button" className="primary" disabled={busy || loading} onClick={() => void saveSetup()}>
            Save connection settings
          </button>
        </div>
      </div>
    </div>
  );
}
