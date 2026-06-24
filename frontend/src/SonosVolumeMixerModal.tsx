import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, Speaker } from "./api";
import { DEFAULT_INITIAL_VOLUME } from "./initialVolumes";

type SonosVolumeMixerModalProps = {
  open: boolean;
  speakers: Speaker[];
  selectedSpeakerIds: string[];
  fallbackVolumes: Record<string, number>;
  onClose: () => void;
  onSpeakerVolumeChange: (speakerId: string, volume: number) => void;
  onSpeakersRefreshed: (speakers: Speaker[]) => void;
  onToast: (message: string) => void;
};

function sortSpeakersWithSelectedFirst(speakers: Speaker[], selectedSpeakerIds: string[]): Speaker[] {
  const selected = new Set(selectedSpeakerIds);
  const inGroup = speakers
    .filter((speaker) => selected.has(speaker.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const others = speakers
    .filter((speaker) => !selected.has(speaker.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...inGroup, ...others];
}

function volumeForSpeaker(speaker: Speaker, fallbackVolumes: Record<string, number>): number {
  if (speaker.volume != null) return speaker.volume;
  return fallbackVolumes[speaker.id] ?? DEFAULT_INITIAL_VOLUME;
}

export function SonosVolumeMixerModal({
  open,
  speakers,
  selectedSpeakerIds,
  fallbackVolumes,
  onClose,
  onSpeakerVolumeChange,
  onSpeakersRefreshed,
  onToast,
}: SonosVolumeMixerModalProps) {
  const [loading, setLoading] = useState(false);
  const [showAllSpeakers, setShowAllSpeakers] = useState(false);
  const [localVolumes, setLocalVolumes] = useState<Record<string, number>>({});
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const fallbackVolumesRef = useRef(fallbackVolumes);
  const speakersRef = useRef(speakers);
  fallbackVolumesRef.current = fallbackVolumes;
  speakersRef.current = speakers;

  const visibleSpeakers = useMemo(() => {
    if (showAllSpeakers) {
      return sortSpeakersWithSelectedFirst(speakers, selectedSpeakerIds);
    }
    const selected = new Set(selectedSpeakerIds);
    return speakers
      .filter((speaker) => selected.has(speaker.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [speakers, selectedSpeakerIds, showAllSpeakers]);

  const hasHiddenSpeakers = useMemo(() => {
    const selected = new Set(selectedSpeakerIds);
    return speakers.some((speaker) => !selected.has(speaker.id));
  }, [speakers, selectedSpeakerIds]);

  useEffect(() => {
    if (!open) return;
    setShowAllSpeakers(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .speakers()
      .then((rows) => {
        if (cancelled) return;
        onSpeakersRefreshed(rows);
        const next: Record<string, number> = {};
        for (const speaker of rows) {
          next[speaker.id] = volumeForSpeaker(speaker, fallbackVolumesRef.current);
        }
        setLocalVolumes(next);
      })
      .catch((error) => {
        if (cancelled) return;
        onToast(error instanceof Error ? error.message : String(error));
        const next: Record<string, number> = {};
        for (const speaker of speakersRef.current) {
          next[speaker.id] = volumeForSpeaker(speaker, fallbackVolumesRef.current);
        }
        setLocalVolumes(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, onSpeakersRefreshed, onToast]);

  useEffect(() => {
    return () => {
      for (const timer of pendingTimers.current.values()) {
        clearTimeout(timer);
      }
      pendingTimers.current.clear();
    };
  }, []);

  const commitVolume = useCallback(
    (speakerId: string, volume: number) => {
      onSpeakerVolumeChange(speakerId, volume);
      const existing = pendingTimers.current.get(speakerId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        pendingTimers.current.delete(speakerId);
        api
          .sonosVolumeSet({ [speakerId]: volume })
          .catch((error) => onToast(error instanceof Error ? error.message : String(error)));
      }, 250);
      pendingTimers.current.set(speakerId, timer);
    },
    [onSpeakerVolumeChange, onToast],
  );

  const handleVolumeChange = (speakerId: string, volume: number) => {
    setLocalVolumes((current) => ({ ...current, [speakerId]: volume }));
    commitVolume(speakerId, volume);
  };

  if (!open) return null;

  const emptyMessage = showAllSpeakers
    ? "No Sonos speakers discovered."
    : "No speakers selected in Play To.";

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="modalPanel sonosVolumeMixerModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sonos-volume-mixer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <h2 id="sonos-volume-mixer-title">Sonos volumes</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {hasHiddenSpeakers ? (
          <label className="sonosVolumeMixerToggle">
            <input
              type="checkbox"
              checked={showAllSpeakers}
              onChange={(event) => setShowAllSpeakers(event.target.checked)}
            />
            Show all speakers
          </label>
        ) : null}
        {loading ? <p className="sonosVolumeMixerStatus">Loading speakers…</p> : null}
        <ul className="sonosVolumeMixerList" aria-busy={loading}>
          {visibleSpeakers.map((speaker) => {
            const volume = localVolumes[speaker.id] ?? volumeForSpeaker(speaker, fallbackVolumes);
            return (
              <li key={speaker.id} className="sonosVolumeMixerRow">
                <span className="sonosVolumeMixerName">{speaker.name}</span>
                <label className="sonosVolumeMixerSlider">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    disabled={loading}
                    onChange={(event) => handleVolumeChange(speaker.id, Number(event.target.value))}
                  />
                  <span className="sonosVolumeMixerValue">{volume}%</span>
                </label>
              </li>
            );
          })}
        </ul>
        {visibleSpeakers.length === 0 && !loading ? (
          <p className="sonosVolumeMixerStatus">{emptyMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
