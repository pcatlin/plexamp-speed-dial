import { useEffect, useState } from "react";

import type { Speaker } from "./api";
import { DEFAULT_INITIAL_VOLUME } from "./initialVolumes";
import { VolumeEditorPopover } from "./VolumeEditorPopover";

type SpeedDialPlayTargetDialogProps = {
  open: boolean;
  favoriteLabel: string;
  speakers: Speaker[];
  speakerIds: string[];
  sonosVolumes: Record<string, number>;
  setVolumesOnPlay: boolean;
  onClose: () => void;
  onSave: (speakerIds: string[], sonosVolumes: Record<string, number>, setVolumesOnPlay: boolean) => void;
};

export function SpeedDialPlayTargetDialog({
  open,
  favoriteLabel,
  speakers,
  speakerIds,
  sonosVolumes,
  setVolumesOnPlay,
  onClose,
  onSave,
}: SpeedDialPlayTargetDialogProps) {
  const [draftSpeakerIds, setDraftSpeakerIds] = useState(speakerIds);
  const [draftSonosVolumes, setDraftSonosVolumes] = useState(sonosVolumes);
  const [draftSetVolumesOnPlay, setDraftSetVolumesOnPlay] = useState(setVolumesOnPlay);
  const [volumeEditor, setVolumeEditor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftSpeakerIds(speakerIds);
    setDraftSonosVolumes(sonosVolumes);
    setDraftSetVolumesOnPlay(setVolumesOnPlay);
    setVolumeEditor(null);
  }, [open, speakerIds, sonosVolumes, setVolumesOnPlay]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!volumeEditor) return;
    const close = () => setVolumeEditor(null);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [volumeEditor]);

  if (!open) return null;

  const toggleSpeaker = (speakerId: string) => {
    setDraftSpeakerIds((current) =>
      current.includes(speakerId) ? current.filter((id) => id !== speakerId) : [...current, speakerId],
    );
    setDraftSonosVolumes((current) =>
      current[speakerId] === undefined ? { ...current, [speakerId]: DEFAULT_INITIAL_VOLUME } : current,
    );
  };

  const setSonosSpeakerVolume = (speakerId: string, volume: number) => {
    setDraftSonosVolumes((current) => ({ ...current, [speakerId]: volume }));
  };

  const handleSave = () => {
    onSave(draftSpeakerIds, draftSonosVolumes, draftSetVolumesOnPlay);
    onClose();
  };

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="modalPanel speedDialPlayTargetDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speed-dial-play-target-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <h2 id="speed-dial-play-target-title">Play to</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="speedDialPlayTargetDialogSubtitle">{favoriteLabel}</p>
        <p className="hint speedDialPlayTargetDialogHint">Choose Sonos speakers for this favorite.</p>
        <label className="playToVolumeToggle speedDialPlayTargetDialogVolumeToggle">
          <input
            type="checkbox"
            checked={draftSetVolumesOnPlay}
            onChange={(event) => setDraftSetVolumesOnPlay(event.target.checked)}
          />
          <span>Set volume on play</span>
        </label>
        {speakers.length === 0 ? (
          <p className="hint">No speakers discovered.</p>
        ) : (
          <div
            className={`pickGrid${draftSetVolumesOnPlay ? " pickGrid--volumeOnPlay" : ""}`}
            role="group"
            aria-label="Sonos speakers"
          >
            {speakers.map((speaker) => {
              const selected = draftSpeakerIds.includes(speaker.id);
              const volume = draftSonosVolumes[speaker.id] ?? DEFAULT_INITIAL_VOLUME;
              const editorOpen = volumeEditor === speaker.id;
              return (
                <div key={speaker.id} className="pickGridCell">
                  <button
                    type="button"
                    className={`pickGridBtn${selected ? " pickGridBtn--selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggleSpeaker(speaker.id)}
                  >
                    {speaker.name}
                  </button>
                  {draftSetVolumesOnPlay && selected ? (
                    <>
                      <button
                        type="button"
                        className="pickGridVolumeBtn"
                        aria-expanded={editorOpen}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setVolumeEditor((current) => (current === speaker.id ? null : speaker.id))}
                      >
                        {volume}%
                      </button>
                      {editorOpen ? (
                        <VolumeEditorPopover
                          title={speaker.name}
                          value={volume}
                          onChange={(next) => setSonosSpeakerVolume(speaker.id, next)}
                          onClose={() => setVolumeEditor(null)}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="modalActions">
          <button type="button" className="confirmDialogBtn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="confirmDialogBtn primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
