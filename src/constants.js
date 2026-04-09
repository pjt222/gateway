export const PHASE_TEMPLATES = {
  "Classic Gateway": [
    { name: "Relaxation", pct: 0.2, beatMul: 1.0, ampMul: 0.7, noiseAdd: 0.05 },
    { name: "Transition", pct: 0.15, beatMul: 0.7, ampMul: 0.85, noiseAdd: 0.0 },
    { name: "Target State", pct: 0.45, beatMul: 0.0, ampMul: 1.0, noiseAdd: -0.03 },
    { name: "Return", pct: 0.2, beatMul: 1.5, ampMul: 0.6, noiseAdd: 0.02 },
  ],
  "Deep Dive": [
    { name: "Settling", pct: 0.25, beatMul: 1.0, ampMul: 0.6, noiseAdd: 0.08 },
    { name: "Descent", pct: 0.35, beatMul: 0.3, ampMul: 0.9, noiseAdd: 0.0 },
    { name: "Abyss", pct: 0.25, beatMul: 0.0, ampMul: 1.0, noiseAdd: -0.05 },
    { name: "Ascent", pct: 0.15, beatMul: 2.0, ampMul: 0.5, noiseAdd: 0.03 },
  ],
  "Steady State": [
    { name: "Full Session", pct: 1.0, beatMul: 0.0, ampMul: 1.0, noiseAdd: 0.0 },
  ],
};

// Brainwave band ranges for beat frequency (Hz)
export const BAND_RANGE = { delta: [0.3, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30], gamma: [30, 100] };

export const PRESETS = {
  "Focus 10": {
    description: "Mind Awake, Body Asleep",
    layers: [
      { label: "Delta Ground", f_base: 100, f_diff_start: 3.0, f_diff_end: 1.5, amp: 0.45, mode: "binaural", band: "delta" },
      { label: "Alpha→Theta", f_base: 200, f_diff_start: 12.0, f_diff_end: 5.0, amp: 0.3, mode: "binaural", band: "alpha" },
      { label: "Gamma Clarity", f_base: 400, f_diff_start: 40.0, f_diff_end: 40.0, amp: 0.08, mode: "binaural", band: "gamma" },
    ],
    noise: 0.15, phases: "Classic Gateway",
  },
  "Focus 12": {
    description: "Expanded Awareness",
    layers: [
      { label: "Delta Anchor", f_base: 100, f_diff_start: 2.5, f_diff_end: 1.0, amp: 0.4, mode: "binaural", band: "delta" },
      { label: "Theta Drift", f_base: 200, f_diff_start: 7.0, f_diff_end: 4.5, amp: 0.35, mode: "binaural", band: "theta" },
      { label: "Beta Spark", f_base: 300, f_diff_start: 18.0, f_diff_end: 18.0, amp: 0.12, mode: "isochronal", band: "beta" },
    ],
    noise: 0.18, phases: "Classic Gateway",
  },
  "Focus 15": {
    description: "No Time — Deep Exploration",
    layers: [
      { label: "Sub-Delta", f_base: 80, f_diff_start: 1.5, f_diff_end: 0.5, amp: 0.5, mode: "binaural", band: "delta" },
      { label: "Deep Theta", f_base: 150, f_diff_start: 6.0, f_diff_end: 3.5, amp: 0.35, mode: "binaural", band: "theta" },
      { label: "Gamma Web", f_base: 420, f_diff_start: 42.0, f_diff_end: 42.0, amp: 0.06, mode: "isochronal", band: "gamma" },
    ],
    noise: 0.22, phases: "Deep Dive",
  },
  "Focus 21": {
    description: "Bridge State — Other Systems",
    layers: [
      { label: "Infra-Delta", f_base: 70, f_diff_start: 1.0, f_diff_end: 0.3, amp: 0.5, mode: "binaural", band: "delta" },
      { label: "Theta Cascade", f_base: 130, f_diff_start: 5.0, f_diff_end: 3.0, amp: 0.3, mode: "binaural", band: "theta" },
      { label: "High Gamma", f_base: 500, f_diff_start: 48.0, f_diff_end: 48.0, amp: 0.05, mode: "isochronal", band: "gamma" },
      { label: "Beta Bridge", f_base: 250, f_diff_start: 14.0, f_diff_end: 14.0, amp: 0.1, mode: "binaural", band: "beta" },
    ],
    noise: 0.25, phases: "Deep Dive",
  },
  Custom: {
    description: "Your own configuration",
    layers: [
      { label: "Layer 1", f_base: 100, f_diff_start: 8.0, f_diff_end: 4.0, amp: 0.4, mode: "binaural" },
      { label: "Layer 2", f_base: 200, f_diff_start: 10.0, f_diff_end: 10.0, amp: 0.3, mode: "binaural" },
    ],
    noise: 0.15, phases: "Steady State",
  },
};

export const FADE_TIME = 4;

export const BAND_LABELS = [
  { name: "δ Delta", range: "0.5–4 Hz", color: "#7B2F8C" },
  { name: "θ Theta", range: "4–8 Hz", color: "#4F6DB5" },
  { name: "α Alpha", range: "8–13 Hz", color: "#21908C" },
  { name: "β Beta", range: "13–30 Hz", color: "#5DC863" },
  { name: "γ Gamma", range: "30–100 Hz", color: "#FDE725" },
];
