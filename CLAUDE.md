# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Binaural beat meditation engine inspired by the Monroe Institute's Gateway Experience. Cross-platform app built with React + Tone.js (Web Audio API) + Capacitor (iOS/Android/web).

## Commands

```bash
npm run dev          # Vite dev server at localhost:5173
npm run build        # Production build to dist/
npm run lint         # ESLint
npm run preview      # Preview production build locally
npm run cap:sync     # Sync web assets to native platforms
npm run cap:android  # Build + sync + open Android Studio
npm run cap:ios      # Build + sync + open Xcode
```

## Architecture

Modular React app split into 6 files under `src/`:

```
src/
├── constants.js          # PRESETS, PHASE_TEMPLATES, BAND_RANGE, BAND_LABELS, FADE_TIME
├── utils.js              # getBandColor, getBandName, lerp, fmt
├── FractalBeatCanvas.jsx # Circular fractal beat envelope visualizer (canvas 2D)
├── components.jsx        # PhaseBar, TimerDisplay, LayerRow
├── useAudioEngine.js     # Custom hook: Tone.js graph, ramp loop, session control
└── App.jsx               # Coordinator: state, presets, layout (imports all above)
```

### Audio Graph (Tone.js) — in `useAudioEngine.js`

```
Layer (BIN):  OscL -> GainL -> PanL(-1) ─┐
              OscR -> GainR -> PanR(+1) ─┤
Layer (ISO):  Osc -> LFO·Gain -> Gain ──┤
Noise:        Pink -> NoiseGain ─────────┤
                                         v
                                    MasterGain -> GlobalGain -> Destination
                                                      |
                                              Waveform Analyser
```

- **Binaural mode**: Two hard-panned oscillators at slightly different frequencies; the brain perceives a beat at the difference. Requires headphones.
- **Isochronal mode**: Single carrier with LFO amplitude modulation. Works with speakers.

### Key Data Structures — in `constants.js`

- **`PRESETS`** — Monroe Focus Level configurations (10/12/15/21), each defining layers with `band` constraints, noise level, and phase script.
- **`PHASE_TEMPLATES`** — Three session arc scripts ("Classic Gateway", "Deep Dive", "Steady State"). Each phase defines `beatMul`, `ampMul`, `noiseAdd` modifiers.
- **`BAND_RANGE`** — Brainwave frequency limits per band (delta 0.3–4, theta 4–8, alpha 8–13, beta 13–30, gamma 30–100 Hz). Preset layers are capped to their band; Custom layers use full range.

### Ramp Loop — in `useAudioEngine.js`

A `requestAnimationFrame` loop (~60fps) interpolates each layer's beat frequency between `f_diff_start` and `f_diff_end` based on session progress, then applies phase modifiers. All frequency changes use Tone.js `rampTo()` for glitch-free transitions. The rAF loop pauses when the app is backgrounded on mobile (Capacitor lifecycle).

### Visualizer — `FractalBeatCanvas.jsx`

Circular fractal visualization where each layer is a concentric ring pulsating at the mathematically correct beat envelope `cos(π·Δf·t)`. Three-octave fractal displacement with spatial frequency tied to the carrier/beat ratio. Outer ring shows raw Tone.js waveform in polar coords. DPR-aware canvas with precomputed trig tables.

### UI Components — `components.jsx`

| Component | Purpose |
|---|---|
| `PhaseBar` | Horizontal phase progress with color segments |
| `TimerDisplay` | SVG circular progress ring with countdown |
| `LayerRow` | Per-layer editor: Carrier (L), Actual (R), volume, beat Δf, mode toggle |

### Color Scheme

All colors derived from the viridis palette (R `viridis` package). Regenerate with `Rscript scripts/viridis-palette.R`.

- Band colors: viridis(5) — `#7B2F8C` (delta) through `#FDE725` (gamma), lightened for contrast
- UI accents: viridis blue `#3B528B`, teal `#21908C`
- ISO mode: magma accent `#D3436E` / `#F8765C`
- Backgrounds: inferno-dark `#000004` → `#140E36`

### Capacitor (Mobile)

- `src/capacitor-init.js` — StatusBar, SplashScreen, app lifecycle events, Android back button
- `capacitor.config.json` — App ID `com.pjt222.gateway`, plugins config
- Native platforms in `ios/` and `android/` (generated, committed)

### Audio Safety Constraints

- Master output peak-limited to 0.9 (-0.9 dB)
- 4-second cosine fade envelopes on start/stop
- Global volume defaults to 75%
