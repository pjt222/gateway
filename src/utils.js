export function getBandColor(f) { return f <= 4 ? "#7B2F8C" : f <= 8 ? "#4F6DB5" : f <= 13 ? "#21908C" : f <= 30 ? "#5DC863" : "#FDE725"; }
export function getBandName(f) { return f <= 4 ? "Delta" : f <= 8 ? "Theta" : f <= 13 ? "Alpha" : f <= 30 ? "Beta" : "Gamma"; }
export function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
export function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`; }
