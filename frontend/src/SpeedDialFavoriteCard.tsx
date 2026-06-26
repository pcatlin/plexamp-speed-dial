import { useEffect, useRef, useState } from "react";

import type { SpeedDial } from "./api";
import { API_BASE, speedDialWebhookUrl } from "./api";
import { copyTextToClipboard } from "./clipboard";
import { IconLink, IconPlay, IconTrash } from "./icons";
import { speedDialDisplayLabel } from "./speedDialLabel";

type SpeedDialFavoriteCardProps = {
  favorite: SpeedDial;
  editMode: boolean;
  playerName: string;
  playTarget: string;
  webhookBaseUrl: string;
  showWebhookLink: boolean;
  onPlay: () => void;
  onDelete: () => void;
  onRename: (id: number, label: string) => Promise<void>;
  onToast: (message: string) => void;
};

export function SpeedDialFavoriteCard({
  favorite,
  editMode,
  playerName,
  playTarget,
  webhookBaseUrl,
  showWebhookLink,
  onPlay,
  onDelete,
  onRename,
  onToast,
}: SpeedDialFavoriteCardProps) {
  const [draftLabel, setDraftLabel] = useState(favorite.label);
  const savingRef = useRef(false);
  const displayLabel = speedDialDisplayLabel(favorite.label);

  useEffect(() => {
    setDraftLabel(favorite.label);
  }, [favorite.label]);

  const wasEditingRef = useRef(editMode);
  useEffect(() => {
    if (wasEditingRef.current && !editMode) {
      void commitLabel();
    }
    wasEditingRef.current = editMode;
  }, [editMode]);

  const commitLabel = async () => {
    const trimmed = draftLabel.trim();
    if (!trimmed) {
      setDraftLabel(favorite.label);
      return;
    }
    if (trimmed === favorite.label || savingRef.current) return;
    savingRef.current = true;
    try {
      await onRename(favorite.id, trimmed);
    } catch (error) {
      setDraftLabel(favorite.label);
      onToast(error instanceof Error ? error.message : String(error));
    } finally {
      savingRef.current = false;
    }
  };

  const coverArt = (
    <span className="favoriteArt">
      {favorite.has_cover_art ? (
        <img
          className="favoriteCover"
          src={`${API_BASE}/speed-dial/${favorite.id}/cover`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            (event.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="favoriteCover favoriteCover--placeholder" aria-hidden />
      )}
      {!editMode ? (
        <span className="favoritePlayOverlay" aria-hidden>
          <IconPlay className="favoritePlayIcon" />
        </span>
      ) : null}
    </span>
  );

  const meta = (
    <>
      <span className="favoriteMeta">{playerName}</span>
      <span className="favoriteMeta">{playTarget}</span>
    </>
  );

  const webhookUrl = speedDialWebhookUrl(favorite.id, webhookBaseUrl);

  const copyWebhookUrl = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
    void copyTextToClipboard(webhookUrl).then((ok) => {
      onToast(ok ? "Webhook URL copied" : "Could not copy webhook URL");
    });
  };

  return (
    <div className="favorite">
      {editMode ? (
        <button
          type="button"
          className="favoriteDelete"
          aria-label={`Delete ${displayLabel}`}
          onClick={onDelete}
        >
          <IconTrash />
        </button>
      ) : null}
      {showWebhookLink ? (
        <button
          type="button"
          className="favoriteWebhookLink"
          title="Copy webhook URL to play this favorite"
          aria-label={`Copy webhook URL to play ${displayLabel}`}
          onClick={(event) => void copyWebhookUrl(event)}
        >
          <IconLink />
        </button>
      ) : null}
      {editMode ? (
        <div className="favoriteEdit">
          {coverArt}
          <div className="favoriteText">
            <input
              type="text"
              className="favoriteLabelInput"
              value={draftLabel}
              aria-label={`Rename ${displayLabel}`}
              onChange={(event) => setDraftLabel(event.target.value)}
              onBlur={() => void commitLabel()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setDraftLabel(favorite.label);
                  event.currentTarget.blur();
                }
              }}
            />
            {meta}
          </div>
        </div>
      ) : (
        <button type="button" className="favoritePlay" onClick={onPlay}>
          {coverArt}
          <span className="favoriteText">
            <span className="favoriteLabel">{displayLabel}</span>
            {meta}
          </span>
        </button>
      )}
    </div>
  );
}
