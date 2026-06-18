// Shared inline-style objects, previously duplicated byte-for-byte in App.jsx and
// components.jsx. Values reference the design tokens defined in index.css :root.

export const sLabel = {
  fontSize: "var(--text-data)",
  color: "var(--teal-label)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 2,
  fontFamily: "'JetBrains Mono',monospace",
};

export const sVal = {
  fontSize: "var(--text-val)",
  color: "var(--text-2)",
  fontFamily: "'JetBrains Mono',monospace",
  display: "block",
  marginTop: 1,
};

export const sSlider = {
  width: "100%",
  height: 5,
  appearance: "auto",
  accentColor: "var(--slider)",
  cursor: "pointer",
};
