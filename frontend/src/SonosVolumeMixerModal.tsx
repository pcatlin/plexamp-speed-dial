import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, Speaker } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { DEFAULT_INITIAL_VOLUME } from "./initialVolumes";

type SonosVolumeMixerModalProps = {
  open: boolean;
  speakers: Speaker[];
  selectedSpeakerIds: string[];
  fallbackVolumes: Record<string, number>;
  onClose: () => void;
  onSpeakerVolumeChange: (speakerId: string, volume: number) => void;
  onSelectedSpeakerIdsChange: (speakerIds: string[]) => void;
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

/** True only when the speaker's group is actively playing (not just paused / showing a source). */
export function speakerIsPlayingSomethingElse(speaker: Speaker): boolean {
  return speaker.playing === true;
}

export function SonosVolumeMixerModal({
  open,
  speakers,
  selectedSpeakerIds,
  fallbackVolumes,
  onClose,
  onSpeakerVolumeChange,
  onSelectedSpeakerIdsChange,
  onSpeakersRefreshed,
  onToast,
}: SonosVolumeMixerModalProps) {
  const [loading, setLoading] = useState(false);
  const [showAllSpeakers, setShowAllSpeakers] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [localVolumes, setLocalVolumes] = useState<Record<string, number>>({});
  const [pendingAdd, setPendingAdd] = useState<Speaker | null>(null);
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

  const selectedSet = useMemo(() => new Set(selectedSpeakerIds), [selectedSpeakerIds]);

  useEffect(() => {
    if (!open) {
      setPendingAdd(null);
      setShowAllSpeakers(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingAdd) {
          setPendingAdd(null);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, pendingAdd]);

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

  const refreshSpeakersQuietly = useCallback(async () => {
    try {
      const rows = await api.speakers();
      onSpeakersRefreshed(rows);
      const next: Record<string, number> = {};
      for (const speaker of rows) {
        next[speaker.id] = volumeForSpeaker(speaker, fallbackVolumesRef.current);
      }
      setLocalVolumes((current) => ({ ...next, ...current }));
    } catch {
      /* keep local list */
    }
  }, [onSpeakersRefreshed]);

  const addSpeakerToGroup = useCallback(
    async (speaker: Speaker) => {
      setMembershipBusy(true);
      try {
        const result = await api.sonosGroupAdd(selectedSpeakerIds, [speaker.id]);
        onSelectedSpeakerIdsChange([...selectedSpeakerIds, speaker.id]);
        onToast(result.details);
        await refreshSpeakersQuietly();
      } catch (error) {
        onToast(error instanceof Error ? error.message : String(error));
      } finally {
        setMembershipBusy(false);
        setPendingAdd(null);
      }
    },
    [selectedSpeakerIds, onSelectedSpeakerIdsChange, onToast, refreshSpeakersQuietly],
  );

  const removeSpeakerFromGroup = useCallback(
    async (speaker: Speaker) => {
      setMembershipBusy(true);
      try {
        const result = await api.sonosGroupRemove([speaker.id]);
        onSelectedSpeakerIdsChange(selectedSpeakerIds.filter((id) => id !== speaker.id));
        onToast(result.details);
        await refreshSpeakersQuietly();
      } catch (error) {
        onToast(error instanceof Error ? error.message : String(error));
      } finally {
        setMembershipBusy(false);
      }
    },
    [selectedSpeakerIds, onSelectedSpeakerIdsChange, onToast, refreshSpeakersQuietly],
  );

  const handleMembershipToggle = (speaker: Speaker, nextChecked: boolean) => {
    if (membershipBusy || loading) return;
    if (nextChecked) {
      if (speakerIsPlayingSomethingElse(speaker)) {
        setPendingAdd(speaker);
        return;
      }
      void addSpeakerToGroup(speaker);
      return;
    }
    void removeSpeakerFromGroup(speaker);
  };

  if (!open) return null;

  const emptyMessage = showAllSpeakers
    ? "No Sonos speakers discovered."
    : "No speakers selected in Play To.";

  const pendingSource = (pendingAdd?.source || "").trim() || "something else";

  return (
    <>
      <div
        className="modalBackdrop"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && !pendingAdd && onClose()}
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
            <button type="button" className="ghost" onClick={onClose} disabled={membershipBusy}>
              Close
            </button>
          </div>
          <p className="sonosVolumeMixerHint">Check speakers to add or remove them from the current group.</p>
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
          <ul className="sonosVolumeMixerList" aria-busy={loading || membershipBusy}>
            {visibleSpeakers.map((speaker) => {
              const inGroup = selectedSet.has(speaker.id);
              const volume = localVolumes[speaker.id] ?? volumeForSpeaker(speaker, fallbackVolumes);
              return (
                <li key={speaker.id} className="sonosVolumeMixerRow">
                  <label className="sonosVolumeMixerMember">
                    <input
                      type="checkbox"
                      checked={inGroup}
                      disabled={loading || membershipBusy}
                      onChange={(event) => handleMembershipToggle(speaker, event.target.checked)}
                    />
                    <span className="sonosVolumeMixerName">{speaker.name}</span>
                  </label>
                  {speaker.source ? (
                    <span className="sonosVolumeMixerSource">{speaker.source}</span>
                  ) : null}
                  <label className="sonosVolumeMixerSlider">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      disabled={loading || !inGroup}
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

      <ConfirmDialog
        open={pendingAdd !== null}
        title="Add speaker to group?"
        message={
          pendingAdd
            ? `${pendingAdd.name} is currently playing “${pendingSource}”. Adding it will interrupt that playback.`
            : ""
        }
        confirmLabel="Add anyway"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setPendingAdd(null)}
        onConfirm={() => {
          if (pendingAdd) void addSpeakerToGroup(pendingAdd);
        }}
      />
    </>
  );
}
