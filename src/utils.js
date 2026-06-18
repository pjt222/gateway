import { BANDS } from "./constants";

// Band lookups derive from the single BANDS source (constants.js) by beat-frequency
// upper bound, so colors/names can never drift from BAND_RANGE / BAND_LABELS.
const bandFor = (f) => BANDS.find((b) => f <= b.range[1]) ?? BANDS[BANDS.length - 1];
export function getBandColor(f) { return bandFor(f).color; }
export function getBandName(f) { return bandFor(f).name.split(" ")[1]; }
export function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
export function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`; }
