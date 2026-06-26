import { useEffect, useState } from "react";
import type { AudioOutput, Player, RuntimeSettings, Speaker } from "./api";
import { api } from "./api";
import { audioOutputsEqual, defaultAudioOutput } from "./audioOutput";
import { PlayerAudioRouteFields, audioOutputFromPlayer } from "./PlayerAudioRouteFields";

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
  onPlayerPatched?: (player: Player) => Promise<void>;
  afterRuntimeSaved?: () => Promise<void>;
  /** Sync parent after Plex OAuth completes (reload library, etc.). */
  onPlexAuthRefresh?: () => Promise<void>;
  onToast: (message: string) => void;
};

export function SetupModal({
  open,
  onClose,
  onPlayersUpdated,
  onPlayerPatched,
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
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("");
  const [webhooksEnabled, setWebhooksEnabled] = useState(false);
  const [webhookLinksHidden, setWebhookLinksHidden] = useState(false);
  const [newPlayerAudioOutput, setNewPlayerAudioOutput] = useState<AudioOutput>(defaultAudioOutput);
  const [sonosSpeakers, setSonosSpeakers] = useState<Speaker[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerAudioDrafts, setPlayerAudioDrafts] = useState<Record<number, AudioOutput>>({});
  const [playerInput, setPlayerInput] = useState("");
  const [playerNameHint, setPlayerNameHint] = useState("");
  const [testPlayerId, setTestPlayerId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [settings, plist, auth, spk] = await Promise.all([
          api.runtimeSettings(),
          api.players(),
          api.authStatus(),
          api.speakers().catch(() => [] as Speaker[]),
        ]);
        if (cancelled) return;
        applySettings(settings);
        setSonosSpeakers(spk);
        setPlayers(plist);
        setPlayerAudioDrafts(
          Object.fromEntries(plist.map((p) => [p.id, audioOutputFromPlayer(p)] as const)),
        );
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
    setPlexUrl(s.plex_server_url ?? "");
    setPlexUrlEffective(s.plex_server_url_effective ?? "");
    setPlexSslVerify(s.plex_ssl_verify);
    setSonosSeeds(s.sonos_seed_ips);
    setSonosTimeout(s.sonos_discover_timeout);
    setSonosScan(s.sonos_allow_network_scan);
    setSonosIface(s.sonos_interface_addr);
    setWebhookBaseUrl(s.webhook_base_url ?? "");
    setWebhooksEnabled(Boolean(s.webhooks_enabled));
    setWebhookLinksHidden(Boolean(s.webhook_links_hidden));
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
        webhook_base_url: webhookBaseUrl.trim(),
        webhooks_enabled: webhooksEnabled,
        webhook_links_hidden: webhookLinksHidden,
      });
      applySettings(saved);
      try {
        setSonosSpeakers(await api.speakers());
      } catch {
        setSonosSpeakers([]);
      }
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
      await api.createPlayer({
        name,
        host,
        port,
        is_active: true,
        audio_output: newPlayerAudioOutput,
      });
      setPlayers(await api.players());
      setPlayerInput("");
      setPlayerNameHint("");
      setNewPlayerAudioOutput(defaultAudioOutput());
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

  const setPlayerAudioDraft = (playerId: number, audio_output: AudioOutput) => {
    setPlayerAudioDrafts((current) => ({ ...current, [playerId]: audio_output }));
  };

  const commitPlayerAudioOutput = async (playerId: number, audio_output: AudioOutput) => {
    const saved = players.find((p) => p.id === playerId);
    if (saved && audioOutputsEqual(audioOutputFromPlayer(saved), audio_output)) {
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patchPlayer(playerId, { audio_output });
      setPlayers((current) => current.map((p) => (p.id === playerId ? updated : p)));
      setPlayerAudioDrafts((current) => ({ ...current, [playerId]: audio_output }));
      await onPlayerPatched?.(updated);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const testPlayerAudioOutput = async (playerId: number) => {
    setTestPlayerId(playerId);
    try {
      const result = await api.audioOutputTest(playerId);
      onToast(result.details);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setTestPlayerId(null);
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

  const hasBaseUrl = (plexUrl ?? "").trim().length > 0;

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
          <h3>Plex Media Server</h3>
          <label className="fieldLabel">
            Base URL (required)
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
          <h3>Plex account</h3>
          <p>{authConnected ? `Connected as ${authUsername || "owner"}` : "Not connected"}</p>
          <div className="modalButtonRow">
            <button type="button" disabled={busy || loading || !authConnected} onClick={() => void testPlexServer()}>
              Test Plex server
            </button>
            <button type="button" disabled={busy || loading || !hasBaseUrl} onClick={() => void connectPlex()}>
              {authConnected ? "Reconnect Plex" : "Connect Plex"}
            </button>
          </div>
          {!authConnected ? <p className="hint">Connect Plex first — the server test requires a linked account.</p> : null}
        </section>

        <section className="modalSection">
          <h3>Speed-dial webhooks</h3>
          <p className="hint">
            LAN URL of this app for Home Assistant and other automations. Copied webhook links use this instead of the
            public Cloudflare hostname.
          </p>
          <label className="checkboxRow slim">
            <input
              type="checkbox"
              checked={webhooksEnabled}
              onChange={(e) => setWebhooksEnabled(e.target.checked)}
            />
            Enable webhooks
          </label>
          <label className="checkboxRow slim">
            <input
              type="checkbox"
              checked={webhookLinksHidden}
              disabled={!webhooksEnabled}
              onChange={(e) => setWebhookLinksHidden(e.target.checked)}
            />
            Hide webhook link icons on favorites
          </label>
          <label className="fieldLabel">
            Webhook base URL (LAN)
            <input
              type="url"
              className="textInput"
              placeholder="http://192.168.1.50"
              autoComplete="off"
              disabled={!webhooksEnabled}
              value={webhookBaseUrl}
              onChange={(e) => setWebhookBaseUrl(e.target.value)}
            />
          </label>
          {!webhooksEnabled ? (
            <p className="hint">Webhook URLs return forbidden until enabled. Link icons stay hidden.</p>
          ) : null}
        </section>

        <section className="modalSection">
          <h3>Sonos discovery</h3>
          <p className="hint">Use comma-separated IPs of a speaker if speakers cannot be detected.</p>
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
            Allow network scan (SSDP fallback)
          </label>
          <label className="fieldLabel">
            Interface address (optional)
            <input type="text" className="textInput" placeholder="192.168.1.50" value={sonosIface} onChange={(e) => setSonosIface(e.target.value)} />
          </label>
        </section>

        <section className="modalSection">
          <h3>Plexamp players</h3>
          <p className="hint">
            Hostname or IP of each Plexamp player. Route its analog output through Sonos line-in, a Pioneer AV receiver, or
            none (Plexamp only).
          </p>
          <div className="inlineGrow">
            <label className="fieldLabel mb0 stretch">
              Add player
              <input
                type="text"
                className="textInput"
                placeholder="192.168.1.5 or http://kitchen.local"
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
          <PlayerAudioRouteFields
            idPrefix="new-player"
            value={newPlayerAudioOutput}
            onChange={setNewPlayerAudioOutput}
            sonosSpeakers={sonosSpeakers}
            disabled={busy}
          />
          <ul className="playerList">
            {players.map((p) => (
              <li key={p.id}>
                <span className="playerMeta">
                  <strong>{p.name}</strong>
                  <span className="dim">
                    {" "}
                    {p.host}
                  </span>
                </span>
                <div className="playerRouteCell">
                  <PlayerAudioRouteFields
                    idPrefix={`player-${p.id}`}
                    value={playerAudioDrafts[p.id] ?? audioOutputFromPlayer(p)}
                    onChange={(next) => setPlayerAudioDraft(p.id, next)}
                    onCommit={(next) => void commitPlayerAudioOutput(p.id, next)}
                    sonosSpeakers={sonosSpeakers}
                    disabled={busy}
                    onTest={() => testPlayerAudioOutput(p.id)}
                    testBusy={testPlayerId === p.id}
                  />
                </div>
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
        <footer className="modalCreditsFooter">
          <a href="#/credits" className="creditsLink" onClick={() => onClose()}>
            Credits
          </a>
        </footer>
      </div>
    </div>
  );
}
