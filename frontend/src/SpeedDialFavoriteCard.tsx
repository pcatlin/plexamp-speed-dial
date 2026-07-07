import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type { InitialVolumes, Player, Speaker, SpeedDial } from "./api";
import { API_BASE, speedDialWebhookUrl } from "./api";
import { outputKindForPlayer, pioneerHostFieldFromOutput } from "./audioOutput";
import { copyTextToClipboard } from "./clipboard";
import { IconGrip, IconLink, IconPlay, IconTrash } from "./icons";
import { DEFAULT_INITIAL_VOLUME, buildSpeedDialInitialVolumes, hasSonosInitialVolumes, initialVolumesWithoutSonos, mergeSonosVolumes } from "./initialVolumes";
import { formatSpeedDialPlayTarget, speedDialDisplayLabel } from "./speedDialLabel";
import { SpeedDialPlayerDialog } from "./SpeedDialPlayerDialog";
import { SpeedDialPlayTargetDialog } from "./SpeedDialPlayTargetDialog";

type SpeedDialPatch = {
  label?: string;
  player_id?: number;
  speaker_ids?: string[];
  initial_volumes?: InitialVolumes | null;
};

type SpeedDialFavoriteReorder = {
  enabled: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

type SpeedDialFavoriteCardProps = {
  favorite: SpeedDial;
  editMode: boolean;
  playTarget: string;
  players: Player[];
  speakers: Speaker[];
  webhookBaseUrl: string;
  showWebhookLink: boolean;
  reorder?: SpeedDialFavoriteReorder;
  onPlay: () => void;
  onDelete: () => void;
  onPatch: (id: number, patch: SpeedDialPatch) => Promise<void>;
  onToast: (message: string) => void;
};

function sonosVolumesFromFavorite(favorite: SpeedDial, speakers: Speaker[]): Record<string, number> {
  const merged = mergeSonosVolumes(favorite.speaker_ids, favorite.initial_volumes?.sonos ?? {});
  for (const id of favorite.speaker_ids) {
    if (merged[id] === undefined) {
      const speaker = speakers.find((row) => row.id === id);
      merged[id] = speaker?.volume ?? DEFAULT_INITIAL_VOLUME;
    }
  }
  return merged;
}

function buildCommitVolumes(
  speakerIds: string[],
  sonosVolumes: Record<string, number>,
  existing: InitialVolumes | null | undefined,
  setVolumesOnPlay: boolean,
): InitialVolumes | null {
  return buildSpeedDialInitialVolumes({
    speakerIds,
    sonosVolumes,
    setVolumesOnPlay,
    existing,
  });
}

function volumesEqual(a: InitialVolumes | null | undefined, b: InitialVolumes | null | undefined): boolean {
  const normalize = (value: InitialVolumes | null | undefined): InitialVolumes | null => {
    if (!value) return null;
    const sonos = value.sonos ?? {};
    const pioneer = value.pioneer ?? null;
    if (Object.keys(sonos).length === 0 && pioneer == null) return null;
    return pioneer == null ? { sonos } : { sonos, pioneer };
  };
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  if (!left || !right) return false;
  const leftSonos = left.sonos ?? {};
  const rightSonos = right.sonos ?? {};
  const leftKeys = Object.keys(leftSonos).sort();
  const rightKeys = Object.keys(rightSonos).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  if (!leftKeys.every((key, index) => key === rightKeys[index])) return false;
  if (!leftKeys.every((key) => leftSonos[key] === rightSonos[key])) return false;
  return (left.pioneer ?? null) === (right.pioneer ?? null);
}

function speakerIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

function playerNameForId(players: Player[], playerId: number): string {
  return players.find((player) => player.id === playerId)?.name ?? "Unknown player";
}

export function SpeedDialFavoriteCard({
  favorite,
  editMode,
  playTarget,
  players,
  speakers,
  webhookBaseUrl,
  showWebhookLink,
  reorder,
  onPlay,
  onDelete,
  onPatch,
  onToast,
}: SpeedDialFavoriteCardProps) {
  const [draftLabel, setDraftLabel] = useState(favorite.label);
  const [draftPlayerId, setDraftPlayerId] = useState(favorite.player_id);
  const [draftSpeakerIds, setDraftSpeakerIds] = useState(favorite.speaker_ids);
  const [draftSonosVolumes, setDraftSonosVolumes] = useState(() => sonosVolumesFromFavorite(favorite, speakers));
  const [draftSetVolumesOnPlay, setDraftSetVolumesOnPlay] = useState(() => hasSonosInitialVolumes(favorite.initial_volumes));
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);
  const [playTargetDialogOpen, setPlayTargetDialogOpen] = useState(false);
  const savingRef = useRef(false);
  const playerDirtyRef = useRef(false);
  const playTargetDirtyRef = useRef(false);
  const displayLabel = speedDialDisplayLabel(favorite.label);

  const draftPlayer = useMemo(
    () => players.find((player) => player.id === draftPlayerId),
    [players, draftPlayerId],
  );
  const draftIsSonosPlayer = outputKindForPlayer(draftPlayer) !== "pioneer";
  const draftPlayerName = playerNameForId(players, draftPlayerId);

  const draftPlayTarget = useMemo(() => {
    const isPioneer = !draftIsSonosPlayer;
    const pioneerLabel =
      pioneerHostFieldFromOutput(draftPlayer?.audio_output ?? { kind: "none", config: {} }).trim() || "Pioneer AVR";
    return formatSpeedDialPlayTarget({
      speakerIds: draftSpeakerIds,
      initialVolumes: buildCommitVolumes(
        draftSpeakerIds,
        draftSonosVolumes,
        favorite.initial_volumes,
        draftSetVolumesOnPlay,
      ),
      isPioneer,
      pioneerLabel,
      speakers,
    });
  }, [
    draftIsSonosPlayer,
    draftPlayer,
    draftSpeakerIds,
    draftSonosVolumes,
    draftSetVolumesOnPlay,
    favorite.initial_volumes,
    speakers,
  ]);

  useEffect(() => {
    setDraftLabel(favorite.label);
    setDraftPlayerId(favorite.player_id);
    setDraftSpeakerIds(favorite.speaker_ids);
    setDraftSonosVolumes(sonosVolumesFromFavorite(favorite, speakers));
    setDraftSetVolumesOnPlay(hasSonosInitialVolumes(favorite.initial_volumes));
    playerDirtyRef.current = false;
    playTargetDirtyRef.current = false;
  }, [favorite.id, favorite.label, favorite.player_id, favorite.speaker_ids, favorite.initial_volumes, speakers]);

  useEffect(() => {
    if (!editMode) {
      setPlayerDialogOpen(false);
      setPlayTargetDialogOpen(false);
    }
  }, [editMode]);

  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (wasEditingRef.current && !editMode) {
      void commitEdits();
    }
    wasEditingRef.current = editMode;
  }, [editMode]);

  const commitEdits = async () => {
    if (savingRef.current) return;

    const patch: SpeedDialPatch = {};
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== favorite.label) {
      patch.label = trimmed;
    } else if (!trimmed) {
      setDraftLabel(favorite.label);
    }

    if (playerDirtyRef.current && draftPlayerId !== favorite.player_id) {
      patch.player_id = draftPlayerId;
      if (!draftIsSonosPlayer) {
        if (favorite.speaker_ids.length > 0) {
          patch.speaker_ids = [];
        }
        if (hasSonosInitialVolumes(favorite.initial_volumes)) {
          patch.initial_volumes = initialVolumesWithoutSonos(favorite.initial_volumes);
        }
      }
    }

    if (draftIsSonosPlayer && playTargetDirtyRef.current) {
      const nextVolumes = buildCommitVolumes(
        draftSpeakerIds,
        draftSonosVolumes,
        favorite.initial_volumes,
        draftSetVolumesOnPlay,
      );
      const speakersChanged = !speakerIdsEqual(draftSpeakerIds, favorite.speaker_ids);
      const volumesChanged = !volumesEqual(nextVolumes, favorite.initial_volumes);
      const volumesEnabledChanged =
        draftSetVolumesOnPlay !== hasSonosInitialVolumes(favorite.initial_volumes);
      if (speakersChanged || volumesChanged || volumesEnabledChanged) {
        patch.speaker_ids = draftSpeakerIds;
        patch.initial_volumes = nextVolumes;
      }
    }

    if (Object.keys(patch).length === 0) return;

    savingRef.current = true;
    try {
      await onPatch(favorite.id, patch);
      playerDirtyRef.current = false;
      playTargetDirtyRef.current = false;
    } catch (error) {
      setDraftLabel(favorite.label);
      setDraftPlayerId(favorite.player_id);
      setDraftSpeakerIds(favorite.speaker_ids);
      setDraftSonosVolumes(sonosVolumesFromFavorite(favorite, speakers));
      setDraftSetVolumesOnPlay(hasSonosInitialVolumes(favorite.initial_volumes));
      playerDirtyRef.current = false;
      playTargetDirtyRef.current = false;
      onToast(error instanceof Error ? error.message : String(error));
    } finally {
      savingRef.current = false;
    }
  };

  const savePlayerDraft = (playerId: number) => {
    const nextPlayer = players.find((player) => player.id === playerId);
    const nextIsSonosPlayer = outputKindForPlayer(nextPlayer) !== "pioneer";

    if (playerId !== favorite.player_id) {
      playerDirtyRef.current = true;
    }
    setDraftPlayerId(playerId);

    if (!nextIsSonosPlayer) {
      setDraftSpeakerIds([]);
      setDraftSonosVolumes({});
      setDraftSetVolumesOnPlay(false);
    }
  };

  const savePlayTargetDraft = (
    speakerIds: string[],
    sonosVolumes: Record<string, number>,
    setVolumesOnPlay: boolean,
  ) => {
    const nextVolumes = buildCommitVolumes(speakerIds, sonosVolumes, favorite.initial_volumes, setVolumesOnPlay);
    const speakersChanged = !speakerIdsEqual(speakerIds, favorite.speaker_ids);
    const volumesChanged = !volumesEqual(nextVolumes, favorite.initial_volumes);
    const volumesEnabledChanged = setVolumesOnPlay !== hasSonosInitialVolumes(favorite.initial_volumes);
    if (speakersChanged || volumesChanged || volumesEnabledChanged) {
      playTargetDirtyRef.current = true;
    }
    setDraftSpeakerIds(speakerIds);
    setDraftSonosVolumes(sonosVolumes);
    setDraftSetVolumesOnPlay(setVolumesOnPlay);
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
      {editMode ? (
        <button
          type="button"
          className="favoriteEditPlayTargetBtn"
          aria-label={`Edit Plexamp player for ${displayLabel}`}
          onClick={() => setPlayerDialogOpen(true)}
        >
          {draftPlayerName}
        </button>
      ) : (
        <span className="favoriteMeta">{playerNameForId(players, favorite.player_id)}</span>
      )}
      {editMode && draftIsSonosPlayer ? (
        <button
          type="button"
          className="favoriteEditPlayTargetBtn"
          aria-label={`Edit speakers for ${displayLabel}`}
          onClick={() => setPlayTargetDialogOpen(true)}
        >
          {draftPlayTarget}
        </button>
      ) : (
        <span className="favoriteMeta">{editMode ? draftPlayTarget : playTarget}</span>
      )}
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
    <div
      className={`favorite${reorder?.dragging ? " favorite--dragging" : ""}${reorder?.dropTarget ? " favorite--dropTarget" : ""}`}
      onDragOver={reorder?.enabled ? reorder.onDragOver : undefined}
      onDrop={reorder?.enabled ? reorder.onDrop : undefined}
    >
      {editMode && reorder?.enabled ? (
        <button
          type="button"
          className="favoriteDragHandle"
          draggable
          aria-label={`Reorder ${displayLabel}`}
          onDragStart={reorder.onDragStart}
          onDragEnd={reorder.onDragEnd}
        >
          <IconGrip />
        </button>
      ) : null}
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
      {showWebhookLink && !editMode ? (
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
      <SpeedDialPlayerDialog
        open={playerDialogOpen}
        favoriteLabel={displayLabel}
        players={players}
        playerId={draftPlayerId}
        onClose={() => setPlayerDialogOpen(false)}
        onSave={savePlayerDraft}
      />
      {draftIsSonosPlayer ? (
        <SpeedDialPlayTargetDialog
          open={playTargetDialogOpen}
          favoriteLabel={displayLabel}
          speakers={speakers}
          speakerIds={draftSpeakerIds}
          sonosVolumes={draftSonosVolumes}
          setVolumesOnPlay={draftSetVolumesOnPlay}
          onClose={() => setPlayTargetDialogOpen(false)}
          onSave={savePlayTargetDraft}
        />
      ) : null}
    </div>
  );
}
