import type { ReactNode } from "react";

import {
  IconList,
  IconPause,
  IconPlay,
  IconPowerOff,
  IconSkipNext,
  IconSkipPrevious,
  IconVolumeDown,
  IconVolumeUp,
} from "./icons";

export type PlaybackNowPlaying = {
  title: string;
  artist?: string | null;
  album?: string | null;
  /** Optional cover art URL; when omitted a placeholder square is shown. */
  artUrl?: string | null;
};

export type PlaybackTransportProps = {
  nowPlaying?: PlaybackNowPlaying | null;
  sonosVolumePercent?: number | null;
  receiverStatusLine?: string | null;
  playbackActive?: boolean;
  showPioneerControls?: boolean;
  showSonosControls?: boolean;
  receiverPowerOn?: boolean;
  onPlayPause?: () => void;
  onSkipPrevious?: () => void;
  onSkipNext?: () => void;
  onToggleReceiverPower?: () => void;
  onVolumeDown?: () => void;
  onVolumeUp?: () => void;
  onOpenSonosMixer?: () => void;
  nowPlayingHref?: string;
  sonosHref?: string;
};

function ControlFramesetLegend({ title }: { title: string }) {
  return (
    <legend className="controlFramesetLegend">
      <span>{title}</span>
    </legend>
  );
}

function noop(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function PlaybackTransport({
  nowPlaying = null,
  sonosVolumePercent = null,
  receiverStatusLine = null,
  playbackActive = false,
  showPioneerControls = false,
  showSonosControls = false,
  receiverPowerOn = true,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
  onToggleReceiverPower,
  onVolumeDown,
  onVolumeUp,
  onOpenSonosMixer,
  nowPlayingHref = "#",
  sonosHref = "#",
}: PlaybackTransportProps) {
  const showOutputControls = showPioneerControls || showSonosControls;
  const showStatus =
    Boolean(nowPlaying) ||
    Boolean(showPioneerControls && receiverStatusLine) ||
    (showSonosControls && sonosVolumePercent != null);

  let status: ReactNode = null;
  if (showStatus) {
    status = (
      <div className="playbackStatus" aria-live="polite">
        {nowPlaying ? (
          <a
            className="nowPlaying playbackStatusLink"
            href={nowPlayingHref}
            aria-label="Open Plexamp app"
            title="Open Plexamp app"
            onClick={noop}
          >
            {nowPlaying.artUrl ? (
              <img
                className="nowPlayingArt"
                src={nowPlaying.artUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="nowPlayingArt nowPlayingArtPlaceholder" aria-hidden="true" />
            )}
            <div className="nowPlayingText">
              <div className="nowPlayingTitle">{nowPlaying.title}</div>
              {nowPlaying.artist || nowPlaying.album ? (
                <div className="nowPlayingMeta">
                  {[nowPlaying.artist, nowPlaying.album].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>
          </a>
        ) : null}
        {showSonosControls && sonosVolumePercent != null ? (
          <a
            className="playbackStatusVolume playbackStatusLink"
            href={sonosHref}
            aria-label="Open Sonos app"
            title="Open Sonos app"
            onClick={noop}
          >
            {sonosVolumePercent}%
          </a>
        ) : null}
        {showPioneerControls && receiverStatusLine ? (
          <p className="receiverStatusRow">{receiverStatusLine}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="controlRailDock" style={{ position: "relative", inset: "auto", width: "100%" }}>
      <aside className="controlRail" aria-label="Playback controls" style={{ width: "100%", maxWidth: 420 }}>
        <fieldset className="controlFrameset controlFrameset--unified">
          <ControlFramesetLegend title="Playback" />
          {status}
          <div className="mediaToolbar mediaToolbarStack" role="group" aria-label="Playback transport">
            <button
              type="button"
              className="iconBtn"
              aria-label={playbackActive ? "Pause playback" : "Play"}
              title={playbackActive ? "Pause" : "Play"}
              onClick={onPlayPause}
            >
              {playbackActive ? <IconPause /> : <IconPlay />}
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Previous track"
              title="Previous track"
              onClick={onSkipPrevious}
            >
              <IconSkipPrevious />
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Next track"
              title="Next track"
              onClick={onSkipNext}
            >
              <IconSkipNext />
            </button>
            {showOutputControls ? <span className="controlToolbarDivider" aria-hidden="true" /> : null}
            {showPioneerControls ? (
              <>
                <button
                  type="button"
                  className={`iconBtn${receiverPowerOn ? "" : " iconBtn--active"}`}
                  aria-label={receiverPowerOn ? "Standby" : "Power on"}
                  title={receiverPowerOn ? "Standby" : "Power on"}
                  onClick={onToggleReceiverPower}
                >
                  <IconPowerOff />
                </button>
                <button
                  type="button"
                  className="iconBtn"
                  aria-label="Lower receiver volume"
                  title="Volume down"
                  onClick={onVolumeDown}
                >
                  <IconVolumeDown />
                </button>
                <button
                  type="button"
                  className="iconBtn"
                  aria-label="Raise receiver volume"
                  title="Volume up"
                  onClick={onVolumeUp}
                >
                  <IconVolumeUp />
                </button>
              </>
            ) : null}
            {showSonosControls ? (
              <>
                <button
                  type="button"
                  className="iconBtn"
                  aria-label="Lower volume on selected Sonos speakers"
                  title="Volume down"
                  onClick={onVolumeDown}
                >
                  <IconVolumeDown />
                </button>
                <button
                  type="button"
                  className="iconBtn"
                  aria-label="Raise volume on selected Sonos speakers"
                  title="Volume up"
                  onClick={onVolumeUp}
                >
                  <IconVolumeUp />
                </button>
                <button
                  type="button"
                  className="iconBtn"
                  aria-label="Adjust all Sonos speaker volumes"
                  title="All speaker volumes"
                  onClick={onOpenSonosMixer}
                >
                  <IconList />
                </button>
              </>
            ) : null}
          </div>
        </fieldset>
      </aside>
    </div>
  );
}
