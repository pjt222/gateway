import { BANDS } from "./constants";

// Band lookups derive from the single BANDS source (constants.js) by beat-frequency
// upper bound, so colors/names can never drift from BAND_RANGE / BAND_LABELS.
const bandFor = (f) => BANDS.find((b) => f <= b.range[1]) ?? BANDS[BANDS.length - 1];
export function getBandColor(f) { return bandFor(f).color; }
// Derive the short name from the structured key (e.g. "delta" -> "Delta") rather
// than parsing the display string, so band naming can't break on a label change.
export function getBandName(f) { const k = bandFor(f).key; return k.charAt(0).toUpperCase() + k.slice(1); }
// Subscribe to a media query with a legacy fallback. Safari < 14 (and some test
// environments) only implement MediaQueryList.addListener/removeListener, so the
// modern addEventListener("change") path would throw there. Returns an unsubscribe.
export function watchMedia(query, onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(query);
  const handler = () => onChange(mq.matches);
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener("change", handler);
    else if (mq.removeListener) mq.removeListener(handler);
  };
}

export function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
export function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`; }
