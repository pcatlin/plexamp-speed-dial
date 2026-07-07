import { API_BASE, MediaItem } from "./api";

type RailProps = {
  label: string;
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (item: MediaItem) => void;
};

function AlbumSuggestionRail({ label, items, selectedId, onSelect }: RailProps) {
  if (items.length === 0) return null;

  return (
    <section className="albumSuggestionSection" aria-label={label}>
      <h4 className="albumSuggestionHeading">{label}</h4>
      <div className="albumSuggestionRail" role="list">
        {items.map((item) => {
          const selected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className={`albumSuggestionCard${selected ? " isSelected" : ""}`}
              aria-pressed={selected}
              title={item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
              onClick={() => onSelect(item)}
            >
              <img
                className="albumSuggestionCover"
                src={`${API_BASE}/media/art/${item.id}`}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span className="albumSuggestionTitle">{item.title}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type Props = {
  recentlyPlayed: MediaItem[];
  mostPlayed: MediaItem[];
  recentlyAdded: MediaItem[];
  random: MediaItem[];
  selectedId: string | null;
  onSelect: (item: MediaItem) => void;
  loading?: boolean;
};

export function AlbumSuggestionRails({
  recentlyPlayed,
  mostPlayed,
  recentlyAdded,
  random,
  selectedId,
  onSelect,
  loading,
}: Props) {
  if (loading) {
    return <p className="hint subtle">Loading album suggestions…</p>;
  }

  const hasAny =
    recentlyPlayed.length > 0 ||
    mostPlayed.length > 0 ||
    recentlyAdded.length > 0 ||
    random.length > 0;
  if (!hasAny) {
    return <p className="hint subtle">No album suggestions from Plex yet.</p>;
  }

  return (
    <div className="albumSuggestionRails">
      <AlbumSuggestionRail label="Recently played" items={recentlyPlayed} selectedId={selectedId} onSelect={onSelect} />
      <AlbumSuggestionRail label="Most played" items={mostPlayed} selectedId={selectedId} onSelect={onSelect} />
      <AlbumSuggestionRail label="Recently added" items={recentlyAdded} selectedId={selectedId} onSelect={onSelect} />
      <AlbumSuggestionRail label="Random" items={random} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
