// Shared control-cluster pieces for the 3D visualizers (nodal shells + drifting
// sand). React-only — no three.js/Tone import — so importing this into both lazy
// 3D chunks does NOT pull the heavy libs into either; it code-splits into its own
// tiny chunk. Keeping the Shells|Sand picker and button styles here (instead of a
// copy per file) means the "shells"/"particles" literals and the ARIA/keyboard
// wiring live in one place and can't drift between the two modes.

export const VIZ_TOGGLE_BTN = {
  background: "rgba(11,9,36,0.92)",
  border: "1px solid rgba(93,200,99,0.55)",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  color: "#5DC863",
  lineHeight: 1,
  fontWeight: 600,
  fontSize: 11,
  fontFamily: "'JetBrains Mono',monospace",
  letterSpacing: "0.08em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const ZEN_BTN = {
  background: "rgba(0,0,4,0.5)",
  border: "1px solid rgba(59,82,139,0.2)",
  borderRadius: 6,
  padding: "5px 7px",
  cursor: "pointer",
  color: "rgba(33,144,140,0.7)",
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// Shells | Sand segmented picker. `mode` / `onSet` use the same literals as
// App's viz3DMode state ('shells' | 'particles'). Real <button>s, so keyboard +
// screen-reader accessible by construction; aria-pressed marks the active mode.
export function ModePicker({ mode, onSet }) {
  const seg = (active) => ({
    background: active ? "rgba(93,200,99,0.22)" : "rgba(11,9,36,0.92)",
    border: "none",
    color: active ? "#5DC863" : "rgba(93,200,99,0.55)",
    padding: "6px 9px",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono',monospace",
    letterSpacing: "0.06em",
    cursor: "pointer",
    lineHeight: 1,
  });
  return (
    <div role="group" aria-label="3D visual mode"
      style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(93,200,99,0.45)" }}>
      <button type="button" onClick={() => onSet?.("shells")} aria-pressed={mode === "shells"}
        title="Nodal shells" style={seg(mode === "shells")}>Shells</button>
      <button type="button" onClick={() => onSet?.("particles")} aria-pressed={mode === "particles"}
        title="Drifting sand" style={seg(mode === "particles")}>Sand</button>
    </div>
  );
}
