export type ArtistOrderMode = "shuffle" | "album_order" | "popular_order" | "popular_tracks_order";

export const ARTIST_ORDER_OPTIONS: Array<{ id: ArtistOrderMode; label: string; hint: string }> = [
  { id: "shuffle", label: "Shuffle", hint: "Random track order." },
  {
    id: "album_order",
    label: "Album order",
    hint: "Album release year, then album title, disc, and track number (up to 100 tracks).",
  },
  {
    id: "popular_order",
    label: "User ratings",
    hint: "Highest user star ratings first; ties play in random order (up to 100 tracks).",
  },
  {
    id: "popular_tracks_order",
    label: "Plex popular tracks",
    hint: "Same order as Plex's Popular Tracks on the artist page (Last.fm listen counts, up to 100).",
  },
];

export function parseArtistOrderMode(value: unknown, shuffleArtist?: boolean): ArtistOrderMode {
  if (value === "external_ratings_order") {
    return "popular_tracks_order";
  }
  if (
    value === "shuffle" ||
    value === "album_order" ||
    value === "popular_order" ||
    value === "popular_tracks_order"
  ) {
    return value;
  }
  if (shuffleArtist === true) return "shuffle";
  return "album_order";
}

export function artistOrderModeUsesShuffle(mode: ArtistOrderMode): boolean {
  return mode === "shuffle";
}

export function artistOrderModeDisabledWithRadio(mode: ArtistOrderMode): boolean {
  return mode !== "shuffle";
}
