/** Preset venue types for discovery filters & shop settings */
export type VenueCategoryPreset = {
  slug: string;
  name: string;
  color: string;
};

export const VENUE_CATEGORY_PRESETS: VenueCategoryPreset[] = [
  { slug: "gaming-center", name: "Gaming center", color: "#22d3ee" },
  { slug: "gaming-lounge", name: "Gaming lounge", color: "#38bdf8" },
  { slug: "esports-cafe", name: "Esports café", color: "#818cf8" },
  { slug: "billiard-hall", name: "Billiard hall", color: "#34d399" },
  { slug: "bowling", name: "Bowling", color: "#a78bfa" },
  { slug: "arcade", name: "Arcade", color: "#f472b6" },
  { slug: "club", name: "Club", color: "#e879f9" },
  { slug: "night-club", name: "Night club", color: "#c084fc" },
  { slug: "lounge", name: "Lounge", color: "#fbbf24" },
  { slug: "bar", name: "Bar", color: "#fb923c" },
  { slug: "restaurant", name: "Restaurant", color: "#f87171" },
  { slug: "cafe", name: "Café", color: "#fcd34d" },
  { slug: "pub", name: "Pub", color: "#f59e0b" },
  { slug: "sports-bar", name: "Sports bar", color: "#4ade80" },
  { slug: "karaoke", name: "Karaoke", color: "#f472b6" },
  { slug: "cinema", name: "Cinema & entertainment", color: "#60a5fa" },
  { slug: "family-entertainment", name: "Family entertainment", color: "#2dd4bf" },
  { slug: "vr-experience", name: "VR experience", color: "#a855f7" },
];

const presetBySlug = new Map(
  VENUE_CATEGORY_PRESETS.map((p) => [p.slug, p] as const),
);

export function venueCategoryPreset(slug: string) {
  return presetBySlug.get(slug);
}

export function isKnownVenueCategorySlug(slug: string) {
  return presetBySlug.has(slug);
}

export function slugifyVenueCategory(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
