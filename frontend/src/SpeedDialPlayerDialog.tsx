import { useEffect, useState } from "react";

import type { Player } from "./api";

type SpeedDialPlayerDialogProps = {
  open: boolean;
  favoriteLabel: string;
  players: Player[];
  playerId: number;
  onClose: () => void;
  onSave: (playerId: number) => void;
};

export function SpeedDialPlayerDialog({
  open,
  favoriteLabel,
  players,
  playerId,
  onClose,
  onSave,
}: SpeedDialPlayerDialogProps) {
  const [draftPlayerId, setDraftPlayerId] = useState(playerId);

  useEffect(() => {
    if (!open) return;
    setDraftPlayerId(playerId);
  }, [open, playerId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    onSave(draftPlayerId);
    onClose();
  };

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="modalPanel speedDialPlayerDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speed-dial-player-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <h2 id="speed-dial-player-title">Plexamp player</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="speedDialPlayTargetDialogSubtitle">{favoriteLabel}</p>
        <p className="hint speedDialPlayTargetDialogHint">Choose which Plexamp player plays this favorite.</p>
        {players.length === 0 ? (
          <p className="hint">Add a Plexamp player in Setup.</p>
        ) : (
          <div className="pickGrid" role="group" aria-label="Plexamp players">
            {players.map((player) => {
              const selected = draftPlayerId === player.id;
              return (
                <button
                  key={player.id}
                  type="button"
                  className={`pickGridBtn${selected ? " pickGridBtn--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => setDraftPlayerId(player.id)}
                >
                  {player.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="modalActions">
          <button type="button" className="confirmDialogBtn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="confirmDialogBtn primary"
            disabled={players.length === 0}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
