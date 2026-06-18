import { BANDS } from "./constants";

// Band lookups derive from the single BANDS source (constants.js) by beat-frequency
// upper bound, so colors/names can never drift from BAND_RANGE / BAND_LABELS.
const bandFor = (f) => BANDS.find((b) => f <= b.range[1]) ?? BANDS[BANDS.length - 1];
export function getBandColor(f) { return bandFor(f).color; }
// Derive the short name from the structured key (e.g. "delta" -> "Delta") rather
// than parsing the display string, so band naming can't break on a label change.
export function getBandName(f) { const k = bandFor(f).key; return k.charAt(0).toUpperCase() + k.slice(1); }
export function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
export function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`; }
