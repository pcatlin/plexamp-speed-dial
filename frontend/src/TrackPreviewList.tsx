import type { MediaItem } from "./api";

type Props = {
  tracks: MediaItem[];
  loading?: boolean;
};

/** Numbered track list under a picked playlist / album / artist. */
export function TrackPreviewList({ tracks, loading = false }: Props) {
  return (
    <div className="trackPreviewShell">
      <div className="fieldLabel">
        Tracks
        {!loading && tracks.length > 0 ? (
          <span className="trackPreviewCount"> (showing {tracks.length})</span>
        ) : null}
      </div>
      <div className="trackPreviewBody">
        {loading ? (
          <p className="hint subtle trackPreviewPlaceholder">Loading tracks…</p>
        ) : tracks.length > 0 ? (
          <ol className="trackPreviewList" aria-label="Tracks in this selection">
            {tracks.map((track, index) => (
              <li key={track.id} className="trackPreviewRow">
                <span className="trackPreviewIdx">{index + 1}</span>
                <span className="trackPreviewCell">
                  <span className="trackPreviewTitle">{track.title}</span>
                  {track.subtitle ? <span className="trackPreviewSub">{track.subtitle}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint subtle trackPreviewPlaceholder">No tracks returned for this item.</p>
        )}
      </div>
    </div>
  );
}
