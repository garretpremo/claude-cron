import { browser } from "$app/environment";

export type ThemeScheme = "light" | "dark";

export type ThemePreset = {
  name: string;
  color: string;
  blurb: string;
};

export const PRESETS: readonly ThemePreset[] = [
  { name: "Indigo", color: "#4A90D9", blurb: "Calm, default-friendly blue." },
  { name: "Sage", color: "#7CA982", blurb: "Muted herbal green." },
  { name: "Crimson", color: "#D9534F", blurb: "Warm, attention-grabbing red." },
  { name: "Sunset", color: "#F4A261", blurb: "Soft amber-orange." },
  { name: "Plum", color: "#8E44AD", blurb: "Rich, regal purple." },
  { name: "Slate", color: "#546E7A", blurb: "Cool blue-gray, professional." },
  { name: "Citrus", color: "#E9C46A", blurb: "Bright yellow with a kick." },
  { name: "Teal", color: "#26A69A", blurb: "Vivid sea-green." },
];

const STORAGE_KEY_LEGACY = "app-theme";
const STORAGE_KEY_COLOR = "claude-cron:theme";
const STORAGE_KEY_SCHEME = "claude-cron:scheme";

const DEFAULT_COLOR = "#4A90D9"; // Indigo
const DEFAULT_SCHEME: ThemeScheme = "dark";

type Persisted = { color: string; scheme: ThemeScheme };

function hydrate(): Persisted {
  if (!browser) return { color: DEFAULT_COLOR, scheme: DEFAULT_SCHEME };
  try {
    const rawColor = localStorage.getItem(STORAGE_KEY_COLOR);
    const rawScheme = localStorage.getItem(STORAGE_KEY_SCHEME);
    if (rawColor || rawScheme) {
      return {
        color: rawColor ?? DEFAULT_COLOR,
        scheme: rawScheme === "light" ? "light" : "dark",
      };
    }
    // Fallback: legacy template key (single JSON blob)
    const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<Persisted>;
      return {
        color: typeof parsed.color === "string" ? parsed.color : DEFAULT_COLOR,
        scheme: parsed.scheme === "light" ? "light" : DEFAULT_SCHEME,
      };
    }
    return { color: DEFAULT_COLOR, scheme: DEFAULT_SCHEME };
  } catch {
    return { color: DEFAULT_COLOR, scheme: DEFAULT_SCHEME };
  }
}

const initial = hydrate();

export const themeState = $state({
  color: initial.color,
  scheme: initial.scheme,
});

function persist() {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY_COLOR, themeState.color);
    localStorage.setItem(STORAGE_KEY_SCHEME, themeState.scheme);
  } catch {
    // quota / private mode — fail silently
  }
}

export function setPreset(preset: ThemePreset) {
  themeState.color = preset.color;
  persist();
}

export function setScheme(scheme: ThemeScheme) {
  themeState.scheme = scheme;
  persist();
}

export function isActivePreset(preset: ThemePreset): boolean {
  return themeState.color.toLowerCase() === preset.color.toLowerCase();
}
