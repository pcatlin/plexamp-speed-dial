import { API_BASE, MediaItem } from "./api";

export type SuggestionRail = {
  label: string;
  items: MediaItem[];
};

export type SuggestionFamily = "album" | "artist" | "track";

export function mediaSuggestionRailsForFamily(
  family: SuggestionFamily,
  suggestions: {
    recently_played: MediaItem[];
    most_played: MediaItem[];
    recently_added: MediaItem[];
    random: MediaItem[];
  } | null,
): SuggestionRail[] {
  const recentlyPlayed = suggestions?.recently_played ?? [];
  const mostPlayed = suggestions?.most_played ?? [];
  const recentlyAdded = suggestions?.recently_added ?? [];
  const random = suggestions?.random ?? [];

  if (family === "album") {
    return [
      { label: "Recently played", items: recentlyPlayed },
      { label: "Most played", items: mostPlayed },
      { label: "Recently added", items: recentlyAdded },
      { label: "Random", items: random },
    ];
  }

  return [
    { label: "Recently played", items: recentlyPlayed },
    { label: "Newly added", items: recentlyAdded },
    { label: "Most played", items: mostPlayed },
    { label: "Random", items: random },
  ];
}

type RailProps = {
  label: string;
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (item: MediaItem) => void;
};

function MediaSuggestionRail({ label, items, selectedId, onSelect }: RailProps) {
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
  rails: SuggestionRail[];
  selectedId: string | null;
  onSelect: (item: MediaItem) => void;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
};

export function MediaSuggestionRails({
  rails,
  selectedId,
  onSelect,
  loading,
  loadingMessage = "Loading suggestions…",
  emptyMessage = "No suggestions from Plex yet.",
}: Props) {
  if (loading) {
    return <p className="hint subtle">{loadingMessage}</p>;
  }

  const hasAny = rails.some((rail) => rail.items.length > 0);
  if (!hasAny) {
    return <p className="hint subtle">{emptyMessage}</p>;
  }

  return (
    <div className="albumSuggestionRails">
      {rails.map((rail) => (
        <MediaSuggestionRail
          key={rail.label}
          label={rail.label}
          items={rail.items}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
