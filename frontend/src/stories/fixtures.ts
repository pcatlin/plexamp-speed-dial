import type { Amp, Player, Speaker, SpeedDial } from "../api";

export const mockSpeakers: Speaker[] = [
  { id: "s-kitchen", name: "Kitchen", ip: "192.168.1.20", volume: 22, playing: false },
  { id: "s-bath", name: "Bathroom", ip: "192.168.1.21", volume: 18, playing: false },
  { id: "s-den", name: "Den", ip: "192.168.1.22", volume: 30, playing: true },
];

export const mockAmps: Amp[] = [
  { id: 1, name: "Living room AVR", host: "192.168.1.50", port: 60128, input_code: "02" },
  { id: 2, name: "Office AVR", host: "192.168.1.51", port: 60128, input_code: "10" },
];

export const mockPlayers: Player[] = [
  {
    id: 1,
    name: "Kitchen Plexamp",
    host: "kitchen.local",
    port: 32500,
    is_active: true,
    audio_output: { kind: "sonos", config: { speaker_id: "s-kitchen" } },
  },
  {
    id: 2,
    name: "Caldera",
    host: "caldera.local",
    port: 32500,
    is_active: true,
    audio_output: { kind: "pioneer", config: { amp_id: 1 } },
  },
  {
    id: 3,
    name: "Office",
    host: "office.local",
    port: 32500,
    is_active: true,
    audio_output: { kind: "none", config: {} },
  },
];

export const mockFavorite: SpeedDial = {
  id: 10,
  label: "Morning Mix",
  media_type: "playlist",
  media_id: "playlist-1",
  player_id: 1,
  speaker_ids: ["s-kitchen", "s-bath"],
  preset_id: null,
  has_cover_art: false,
  description: "Kitchen Plexamp · Kitchen (22%), Bathroom (18%)",
  initial_volumes: { sonos: { "s-kitchen": 22, "s-bath": 18 } },
  artist_radio: null,
  shuffle: null,
};
