import { useEffect, useState } from "react";
import type { Amp, AudioOutput, Player, RuntimeSettings, Speaker } from "./api";
import { api } from "./api";
import { AmpFields, ampDraftFromAmp, type AmpDraft } from "./AmpFields";
import { audioOutputsEqual, defaultAudioOutput, normalizePioneerInputCode } from "./audioOutput";
import { PlayerAudioRouteFields, audioOutputFromPlayer } from "./PlayerAudioRouteFields";
import { ConfirmDialog } from "./ConfirmDialog";
import { SetupModalNav, type SetupSectionId } from "./SetupModalNav";

const DEFAULT_AMP_DRAFT: AmpDraft = {
  name: "",
  host: "",
  port: 60128,
  input_code: "02",
};

const PLEXAMP_DEFAULT_PORT = 32500;

function parsePlayerEndpoint(raw: string): { label: string; host: string; port: number } {
  const s = raw.trim();
  if (!s) throw new Error("Enter a player hostname or URL.");
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const host = url.hostname;
      if (!host) throw new Error("Missing hostname");
      const port = url.port ? parseInt(url.port, 10) : PLEXAMP_DEFAULT_PORT;
      return { label: host, host, port };
    } catch {
      throw new Error("Invalid URL.");
    }
  }
  const first = s.split(/[/\s]/)[0] ?? "";
  if (first.includes(":")) {
    const colon = first.lastIndexOf(":");
    const maybeHost = first.slice(0, colon).trim();
    const portStr = first.slice(colon + 1);
    const port = Number.parseInt(portStr ?? "", 10);
    if (maybeHost && Number.isFinite(port) && port > 0 && port < 65536) {
      return { label: maybeHost, host: maybeHost, port };
    }
  }
  return { label: first, host: first, port: PLEXAMP_DEFAULT_PORT };
}

function playerHostField(player: { host: string; port: number }): string {
  const host = (player.host || "").trim();
  if (!host) return "";
  if (player.port && player.port !== PLEXAMP_DEFAULT_PORT) return `${host}:${player.port}`;
  return host;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onPlayersUpdated: () => Promise<void>;
  onPlayerPatched?: (player: Player) => Promise<void>;
  onAmpsUpdated?: () => Promise<void>;
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
  onAmpsUpdated,
  afterRuntimeSaved,
  onPlexAuthRefresh,
  onToast,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<SetupSectionId>("plex");
  const [authConnected, setAuthConnected] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [plexUrl, setPlexUrl] = useState("");
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
  const [amps, setAmps] = useState<Amp[]>([]);
  const [ampDrafts, setAmpDrafts] = useState<Record<number, AmpDraft>>({});
  const [newAmpDraft, setNewAmpDraft] = useState<AmpDraft>(DEFAULT_AMP_DRAFT);
  const [playerAudioDrafts, setPlayerAudioDrafts] = useState<Record<number, AudioOutput>>({});
  const [playerNameDrafts, setPlayerNameDrafts] = useState<Record<number, string>>({});
  const [playerHostDrafts, setPlayerHostDrafts] = useState<Record<number, string>>({});
  const [playerInput, setPlayerInput] = useState("");
  const [playerNameHint, setPlayerNameHint] = useState("");
  const [testAmpId, setTestAmpId] = useState<number | null>(null);
  const [playerDeleteTarget, setPlayerDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [ampDeleteTarget, setAmpDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const syncAmpState = (list: Amp[]) => {
    setAmps(list);
    setAmpDrafts(Object.fromEntries(list.map((amp) => [amp.id, ampDraftFromAmp(amp)] as const)));
  };

  useEffect(() => {
    if (!open) {
      setPlayerDeleteTarget(null);
      setAmpDeleteTarget(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setActiveSection("plex");
    (async () => {
      try {
        const [settings, plist, alist, auth, spk] = await Promise.all([
          api.runtimeSettings(),
          api.players(),
          api.amps(),
          api.authStatus(),
          api.speakers().catch(() => [] as Speaker[]),
        ]);
        if (cancelled) return;
        applySettings(settings);
        setSonosSpeakers(spk);
        setPlayers(plist);
        syncAmpState(alist);
        setPlayerAudioDrafts(
          Object.fromEntries(plist.map((p) => [p.id, audioOutputFromPlayer(p)] as const)),
        );
        setPlayerNameDrafts(Object.fromEntries(plist.map((p) => [p.id, p.name] as const)));
        setPlayerHostDrafts(Object.fromEntries(plist.map((p) => [p.id, playerHostField(p)] as const)));
        setAuthConnected(auth.connected);
        setAuthUsername(auth.username ?? "");
        setPlayerInput("");
        setPlayerNameHint("");
        setNewAmpDraft(DEFAULT_AMP_DRAFT);
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
    setPlexSslVerify(s.plex_ssl_verify);
    setSonosSeeds(s.sonos_seed_ips);
    setSonosTimeout(s.sonos_discover_timeout);
    setSonosScan(s.sonos_allow_network_scan);
    setSonosIface(s.sonos_interface_addr);
    setWebhookBaseUrl(s.webhook_base_url ?? "");
    setWebhooksEnabled(Boolean(s.webhooks_enabled));
    setWebhookLinksHidden(Boolean(s.webhook_links_hidden));
  }

  const saveAll = async () => {
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

    let nextAmps = amps;
    for (const amp of amps) {
      const draft = ampDrafts[amp.id] ?? ampDraftFromAmp(amp);
      const name = draft.name.trim();
      const host = draft.host.trim();
      const inputCode = normalizePioneerInputCode(draft.input_code);
      if (!name || !host) continue;
      const dirty =
        name !== amp.name ||
        host !== amp.host ||
        draft.port !== amp.port ||
        inputCode !== normalizePioneerInputCode(amp.input_code);
      if (!dirty) continue;
      const updated = await api.patchAmp(amp.id, {
        name,
        host,
        port: draft.port,
        input_code: inputCode,
      });
      nextAmps = nextAmps.map((row) => (row.id === amp.id ? updated : row));
    }
    syncAmpState(nextAmps);
    await onAmpsUpdated?.().catch(() => undefined);

    let nextPlayers = players;
    for (const player of players) {
      const audioDraft = playerAudioDrafts[player.id];
      const nameDraft = (playerNameDrafts[player.id] ?? player.name).trim();
      const hostRaw = (playerHostDrafts[player.id] ?? playerHostField(player)).trim();
      const audioDirty =
        Boolean(audioDraft) && !audioOutputsEqual(audioOutputFromPlayer(player), audioDraft!);
      const nameDirty = nameDraft !== player.name && nameDraft.length > 0;
      let hostDirty = false;
      let hostPatch: { host: string; port: number } | null = null;
      if (hostRaw && hostRaw !== playerHostField(player)) {
        const parsed = parsePlayerEndpoint(hostRaw);
        if (parsed.host !== player.host || parsed.port !== player.port) {
          hostDirty = true;
          hostPatch = { host: parsed.host, port: parsed.port };
        }
      }
      if (!audioDirty && !nameDirty && !hostDirty) {
        continue;
      }
      const updated = await api.patchPlayer(player.id, {
        ...(nameDirty ? { name: nameDraft } : {}),
        ...(hostPatch ? hostPatch : {}),
        ...(audioDirty ? { audio_output: audioDraft } : {}),
      });
      nextPlayers = nextPlayers.map((p) => (p.id === player.id ? updated : p));
      await onPlayerPatched?.(updated);
    }
    setPlayers(nextPlayers);
    setPlayerAudioDrafts(
      Object.fromEntries(nextPlayers.map((p) => [p.id, audioOutputFromPlayer(p)] as const)),
    );
    setPlayerNameDrafts(Object.fromEntries(nextPlayers.map((p) => [p.id, p.name] as const)));
    setPlayerHostDrafts(Object.fromEntries(nextPlayers.map((p) => [p.id, playerHostField(p)] as const)));

    try {
      setSonosSpeakers(await api.speakers());
    } catch {
      setSonosSpeakers([]);
    }
    await afterRuntimeSaved?.().catch(() => undefined);
  };

  const handleSave = async () => {
    if (busy || loading) return;
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
    setBusy(true);
    try {
      await saveAll();
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
      const { label, host, port } = parsePlayerEndpoint(playerInput || playerNameHint);
      const name = playerNameHint.trim() || label;
      await api.createPlayer({
        name,
        host,
        port,
        is_active: true,
        audio_output: newPlayerAudioOutput,
      });
      const plist = await api.players();
      setPlayers(plist);
      setPlayerAudioDrafts(
        Object.fromEntries(plist.map((p) => [p.id, audioOutputFromPlayer(p)] as const)),
      );
      setPlayerNameDrafts(Object.fromEntries(plist.map((p) => [p.id, p.name] as const)));
      setPlayerHostDrafts(Object.fromEntries(plist.map((p) => [p.id, playerHostField(p)] as const)));
      setPlayerInput("");
      setPlayerNameHint("");
      setNewPlayerAudioOutput(defaultAudioOutput());
      await onPlayersUpdated();
      onToast(`Added player ${name} (${host}:${port}).`);
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

  const setPlayerNameDraft = (playerId: number, name: string) => {
    setPlayerNameDrafts((current) => ({ ...current, [playerId]: name }));
  };

  const setPlayerHostDraft = (playerId: number, host: string) => {
    setPlayerHostDrafts((current) => ({ ...current, [playerId]: host }));
  };

  const commitPlayerName = async (playerId: number) => {
    const saved = players.find((p) => p.id === playerId);
    if (!saved) return;
    const nextName = (playerNameDrafts[playerId] ?? saved.name).trim();
    if (!nextName) {
      setPlayerNameDrafts((current) => ({ ...current, [playerId]: saved.name }));
      return;
    }
    if (nextName === saved.name) {
      setPlayerNameDrafts((current) => ({ ...current, [playerId]: saved.name }));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patchPlayer(playerId, { name: nextName });
      setPlayers((current) => current.map((p) => (p.id === playerId ? updated : p)));
      setPlayerNameDrafts((current) => ({ ...current, [playerId]: updated.name }));
      await onPlayerPatched?.(updated);
    } catch (e) {
      setPlayerNameDrafts((current) => ({ ...current, [playerId]: saved.name }));
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const commitPlayerHost = async (playerId: number) => {
    const saved = players.find((p) => p.id === playerId);
    if (!saved) return;
    const raw = (playerHostDrafts[playerId] ?? playerHostField(saved)).trim();
    if (!raw) {
      setPlayerHostDrafts((current) => ({ ...current, [playerId]: playerHostField(saved) }));
      return;
    }
    let parsed: { host: string; port: number };
    try {
      parsed = parsePlayerEndpoint(raw);
    } catch (e) {
      setPlayerHostDrafts((current) => ({ ...current, [playerId]: playerHostField(saved) }));
      onToast(e instanceof Error ? e.message : String(e));
      return;
    }
    if (parsed.host === saved.host && parsed.port === saved.port) {
      setPlayerHostDrafts((current) => ({ ...current, [playerId]: playerHostField(saved) }));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patchPlayer(playerId, { host: parsed.host, port: parsed.port });
      setPlayers((current) => current.map((p) => (p.id === playerId ? updated : p)));
      setPlayerHostDrafts((current) => ({ ...current, [playerId]: playerHostField(updated) }));
      await onPlayerPatched?.(updated);
    } catch (e) {
      setPlayerHostDrafts((current) => ({ ...current, [playerId]: playerHostField(saved) }));
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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

  const addAmp = async () => {
    setBusy(true);
    try {
      const name = newAmpDraft.name.trim();
      const host = newAmpDraft.host.trim();
      if (!host) throw new Error("Enter a receiver IP or hostname.");
      const displayName = name || host;
      await api.createAmp({
        name: displayName,
        host,
        port: newAmpDraft.port,
        input_code: normalizePioneerInputCode(newAmpDraft.input_code),
      });
      syncAmpState(await api.amps());
      setNewAmpDraft(DEFAULT_AMP_DRAFT);
      await onAmpsUpdated?.();
      onToast(`Added amp ${displayName}.`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setAmpDraft = (ampId: number, draft: AmpDraft) => {
    setAmpDrafts((current) => ({ ...current, [ampId]: draft }));
  };

  const commitAmpDraft = async (ampId: number, draft: AmpDraft) => {
    const saved = amps.find((row) => row.id === ampId);
    if (!saved) return;
    const name = draft.name.trim();
    const host = draft.host.trim();
    const inputCode = normalizePioneerInputCode(draft.input_code);
    if (!name || !host) {
      setAmpDrafts((current) => ({ ...current, [ampId]: ampDraftFromAmp(saved) }));
      return;
    }
    if (
      name === saved.name &&
      host === saved.host &&
      draft.port === saved.port &&
      inputCode === normalizePioneerInputCode(saved.input_code)
    ) {
      setAmpDrafts((current) => ({ ...current, [ampId]: ampDraftFromAmp(saved) }));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patchAmp(ampId, {
        name,
        host,
        port: draft.port,
        input_code: inputCode,
      });
      setAmps((current) => current.map((row) => (row.id === ampId ? updated : row)));
      setAmpDrafts((current) => ({ ...current, [ampId]: ampDraftFromAmp(updated) }));
      await onAmpsUpdated?.();
    } catch (e) {
      setAmpDrafts((current) => ({ ...current, [ampId]: ampDraftFromAmp(saved) }));
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const testAmp = async (ampId: number) => {
    setTestAmpId(ampId);
    try {
      const result = await api.ampTest(ampId);
      onToast(result.details);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setTestAmpId(null);
    }
  };

  const removeAmp = async (id: number) => {
    setBusy(true);
    try {
      await api.deleteAmp(id);
      syncAmpState(await api.amps());
      await onAmpsUpdated?.();
      onToast("Removed amp.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
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
      setPlayerAudioDrafts(
        Object.fromEntries(plist.map((p) => [p.id, audioOutputFromPlayer(p)] as const)),
      );
      setPlayerNameDrafts(Object.fromEntries(plist.map((p) => [p.id, p.name] as const)));
      setPlayerHostDrafts(Object.fromEntries(plist.map((p) => [p.id, playerHostField(p)] as const)));
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
    <>
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modalPanel setupModalPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <h2 id="setup-title">Setup</h2>
          <div className="setupModalHeaderActions">
            <button type="button" className="primary" disabled={busy || loading} onClick={() => void handleSave()}>
              Save
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={onClose} aria-label="Close setup">
              Close
            </button>
          </div>
        </div>

        {loading ? <p className="hint">Loading…</p> : null}

        <div className="setupModalBody">
          <SetupModalNav
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            disabled={busy || loading}
          />

          <div className="setupModalContent">
            {activeSection === "plex" ? (
              <>
                <section className="setupModalPage" aria-labelledby="setup-plex-title">
                  <h3 id="setup-plex-title">Plex Media Server</h3>
                  <p className="hint setupModalIntro">
                    Link your Plex account and point the app at your Plex Media Server on the LAN.
                  </p>
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
                  <label className="checkboxRow slim">
                    <input type="checkbox" checked={plexSslVerify} onChange={(e) => setPlexSslVerify(e.target.checked)} />
                    Verify HTTPS certificates (disable for insecure / self-signed PMS HTTPS)
                  </label>
                </section>

                <section className="setupModalPage setupModalPageSpaced" aria-labelledby="setup-plex-account-title">
                  <h3 id="setup-plex-account-title">Plex account</h3>
                  <p>{authConnected ? `Connected as ${authUsername || "owner"}` : "Not connected"}</p>
                  <div className="modalButtonRow">
                    <button type="button" disabled={busy || loading || !authConnected} onClick={() => void testPlexServer()}>
                      Test Plex server
                    </button>
                    <button type="button" disabled={busy || loading || !hasBaseUrl} onClick={() => void connectPlex()}>
                      {authConnected ? "Reconnect Plex" : "Connect Plex"}
                    </button>
                  </div>
                  {!authConnected ? (
                    <p className="hint">Connect Plex first — the server test requires a linked account.</p>
                  ) : null}
                </section>
              </>
            ) : null}

            {activeSection === "sonos" ? (
              <section className="setupModalPage" aria-labelledby="setup-sonos-title">
                <h3 id="setup-sonos-title">Sonos discovery</h3>
                <p className="hint setupModalIntro">
                  Help the app find speakers on your network. Use seed IPs when SSDP discovery is unreliable.
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
                  Allow network scan (SSDP fallback)
                </label>
                <label className="fieldLabel">
                  Interface address (optional)
                  <input
                    type="text"
                    className="textInput"
                    placeholder="192.168.1.50"
                    value={sonosIface}
                    onChange={(e) => setSonosIface(e.target.value)}
                  />
                </label>
              </section>
            ) : null}

            {activeSection === "amps" ? (
              <section className="setupModalPage" aria-labelledby="setup-amps-title">
                <h3 id="setup-amps-title">Amps</h3>
                <p className="hint setupModalIntro">
                  Pioneer (or compatible) AV receivers. Players with Pioneer AVR routing pick an amp from this list.
                </p>
                <div className="playerAddForm">
                  <AmpFields
                    idPrefix="new-amp"
                    value={newAmpDraft}
                    onChange={setNewAmpDraft}
                    disabled={busy}
                  />
                  <div className="playerListItemFooter">
                    <button type="button" className="nowrap" disabled={busy} onClick={() => void addAmp()}>
                      Add amp
                    </button>
                  </div>
                </div>

                <div className="playerListDivider" role="separator" />
                <h4 className="playerListHeading">Configured amps</h4>
                {amps.length === 0 ? <p className="hint">No amps yet.</p> : null}
                <ul className="playerList">
                  {amps.map((amp) => (
                    <li key={amp.id} className="playerListItem">
                      <AmpFields
                        idPrefix={`amp-${amp.id}`}
                        value={ampDrafts[amp.id] ?? ampDraftFromAmp(amp)}
                        onChange={(next) => setAmpDraft(amp.id, next)}
                        onCommit={(next) => void commitAmpDraft(amp.id, next)}
                        disabled={busy}
                      />
                      <div className="playerListItemFooter">
                        <button
                          type="button"
                          className="danger nowrap"
                          disabled={busy}
                          onClick={() =>
                            setAmpDeleteTarget({
                              id: amp.id,
                              name: (ampDrafts[amp.id]?.name ?? amp.name).trim() || amp.name,
                            })
                          }
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="nowrap"
                          disabled={busy || testAmpId === amp.id}
                          onClick={() => void testAmp(amp.id)}
                        >
                          {testAmpId === amp.id ? "Testing…" : "Test receiver"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {activeSection === "plexamp" ? (
              <section className="setupModalPage" aria-labelledby="setup-plexamp-title">
                <h3 id="setup-plexamp-title">Players</h3>
                <p className="hint setupModalIntro">
                  Hostname or IP of each Plexamp or Caldera player (companion port defaults to 32500). Playback uses the
                  same createPlayQueue companion API for both. Route analog output through Sonos line-in, a Pioneer amp
                  (configured under Amps), or none (player only).
                </p>
                <div className="playerAddForm">
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
                        placeholder="Kitchen"
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
                    amps={amps}
                    disabled={busy}
                  />
                </div>

                <div className="playerListDivider" role="separator" />
                <h4 className="playerListHeading">Configured players</h4>
                {players.length === 0 ? <p className="hint">No players yet.</p> : null}
                <ul className="playerList">
                  {players.map((p) => (
                    <li key={p.id} className="playerListItem">
                      <div className="playerMeta">
                        <label className="fieldLabel mb0 playerNameField">
                          Display name
                          <input
                            type="text"
                            className="textInput"
                            value={playerNameDrafts[p.id] ?? p.name}
                            disabled={busy}
                            onChange={(e) => setPlayerNameDraft(p.id, e.target.value)}
                            onBlur={() => void commitPlayerName(p.id)}
                          />
                        </label>
                        <label className="fieldLabel mb0 playerHostField">
                          IP or hostname
                          <input
                            type="text"
                            className="textInput"
                            placeholder="192.168.1.5 or host:32500"
                            value={playerHostDrafts[p.id] ?? playerHostField(p)}
                            disabled={busy}
                            onChange={(e) => setPlayerHostDraft(p.id, e.target.value)}
                            onBlur={() => void commitPlayerHost(p.id)}
                          />
                        </label>
                      </div>
                      <div className="playerRouteCell">
                        <PlayerAudioRouteFields
                          idPrefix={`player-${p.id}`}
                          value={playerAudioDrafts[p.id] ?? audioOutputFromPlayer(p)}
                          onChange={(next) => setPlayerAudioDraft(p.id, next)}
                          onCommit={(next) => void commitPlayerAudioOutput(p.id, next)}
                          sonosSpeakers={sonosSpeakers}
                          amps={amps}
                          disabled={busy}
                        />
                      </div>
                      <div className="playerListItemFooter">
                        <button
                          type="button"
                          className="danger nowrap playerDeleteBtn"
                          disabled={busy}
                          onClick={() =>
                            setPlayerDeleteTarget({
                              id: p.id,
                              name: (playerNameDrafts[p.id] ?? p.name).trim() || p.name,
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {activeSection === "webhooks" ? (
              <section className="setupModalPage" aria-labelledby="setup-webhooks-title">
                <h3 id="setup-webhooks-title">Speed-dial webhooks</h3>
                <p className="hint setupModalIntro">
                  LAN URL of this app for local LAN friendly links.
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
            ) : null}
          </div>
        </div>

        <footer className="modalCreditsFooter">
          <a
            href="#/credits"
            className="creditsLink"
            onClick={(e) => {
              e.preventDefault();
              onClose();
              window.location.hash = "#/credits";
            }}
          >
            Credits
          </a>
        </footer>
      </div>
    </div>
    <ConfirmDialog
      open={playerDeleteTarget !== null}
      title="Are you sure?"
      message={
        playerDeleteTarget
          ? `Remove player “${playerDeleteTarget.name}”?`
          : ""
      }
      confirmLabel="Delete"
      destructive
      onCancel={() => setPlayerDeleteTarget(null)}
      onConfirm={() => {
        if (!playerDeleteTarget) return;
        const { id } = playerDeleteTarget;
        setPlayerDeleteTarget(null);
        void removePlayer(id);
      }}
    />
    <ConfirmDialog
      open={ampDeleteTarget !== null}
      title="Are you sure?"
      message={
        ampDeleteTarget
          ? `Remove amp “${ampDeleteTarget.name}”? Players still using it must be reassigned first.`
          : ""
      }
      confirmLabel="Delete"
      destructive
      onCancel={() => setAmpDeleteTarget(null)}
      onConfirm={() => {
        if (!ampDeleteTarget) return;
        const { id } = ampDeleteTarget;
        setAmpDeleteTarget(null);
        void removeAmp(id);
      }}
    />
    </>
  );
}
