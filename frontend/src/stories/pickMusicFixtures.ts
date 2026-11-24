import type { MediaItem } from "../api";
import type { SuggestionRail } from "../MediaSuggestionRails";

const COVER_COLORS = ["#1f2937", "#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be123c"];

export function mockCoverArt(label: string, color = COVER_COLORS[0]): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
        <rect width="160" height="160" fill="${color}"/>
        <text x="80" y="88" text-anchor="middle" fill="#fff" font-size="18" font-family="system-ui">${label}</text>
      </svg>`,
    )
  );
}

export const mockTracks: MediaItem[] = [
  { id: "t1", title: "Everything In Its Right Place", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t2", title: "Kid A", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t3", title: "The National Anthem", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t4", title: "How to Disappear Completely", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t5", title: "Treefingers", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t6", title: "Optimistic", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t7", title: "In Limbo", subtitle: "Radiohead · Kid A", type: "track" },
  { id: "t8", title: "Idioteque", subtitle: "Radiohead · Kid A", type: "track" },
];

export const mockPlaylist: MediaItem = {
  id: "playlist-1",
  title: "Morning Mix",
  subtitle: "24 tracks",
  type: "playlist",
};

function album(id: string, title: string, subtitle: string): MediaItem {
  return { id, title, subtitle, type: "album" };
}

export const mockSuggestionRails: SuggestionRail[] = [
  {
    label: "Recently played",
    items: [
      album("a1", "In Rainbows", "Radiohead"),
      album("a2", "OK Computer", "Radiohead"),
      album("a3", "The Bends", "Radiohead"),
      album("a4", "Amnesiac", "Radiohead"),
      album("a13", "Kid A", "Radiohead"),
      album("a14", "Hail to the Thief", "Radiohead"),
      album("a15", "A Moon Shaped Pool", "Radiohead"),
      album("a16", "The King of Limbs", "Radiohead"),
      album("a17", "Pablo Honey", "Radiohead"),
    ],
  },
  {
    label: "Most played",
    items: [
      album("a5", "Kid A", "Radiohead"),
      album("a6", "A Moon Shaped Pool", "Radiohead"),
      album("a7", "Hail to the Thief", "Radiohead"),
      album("a18", "In Rainbows", "Radiohead"),
      album("a19", "OK Computer", "Radiohead"),
      album("a20", "Amnesiac", "Radiohead"),
      album("a21", "The Bends", "Radiohead"),
      album("a22", "I Might Be Wrong", "Radiohead"),
    ],
  },
  {
    label: "Recently added",
    items: [
      album("a8", "Pablo Honey", "Radiohead"),
      album("a9", "The King of Limbs", "Radiohead"),
      album("a23", "COM LAG", "Radiohead"),
      album("a24", "TKOL RMX 1234567", "Radiohead"),
      album("a25", "In Rainbows", "Radiohead"),
      album("a26", "Kid A", "Radiohead"),
      album("a27", "OK Computer", "Radiohead"),
    ],
  },
  {
    label: "Random",
    items: [
      album("a10", "TKOL RMX 1234567", "Radiohead"),
      album("a11", "I Might Be Wrong", "Radiohead"),
      album("a12", "COM LAG", "Radiohead"),
      album("a28", "Amnesiac", "Radiohead"),
      album("a29", "The Bends", "Radiohead"),
      album("a30", "Hail to the Thief", "Radiohead"),
      album("a31", "A Moon Shaped Pool", "Radiohead"),
      album("a32", "Pablo Honey", "Radiohead"),
    ],
  },
];

export function suggestionArtSrc(item: MediaItem): string {
  const index = Number.parseInt(item.id.replace(/\D/g, ""), 10) || 0;
  return mockCoverArt(item.title.slice(0, 1), COVER_COLORS[index % COVER_COLORS.length]);
}
