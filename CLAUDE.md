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

The app lives in `src/App.jsx` (~540 lines) — a single React component (`GatewaySession`) containing all state, audio logic, and UI sub-components.

### Audio Graph (Tone.js)

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

### Key Data Structures

- **`PRESETS`** — Monroe Focus Level configurations (10/12/15/21), each defining layers, noise level, and phase script.
- **`PHASE_TEMPLATES`** — Three session arc scripts ("Classic Gateway", "Deep Dive", "Steady State"). Each phase defines `beatMul`, `ampMul`, `noiseAdd` modifiers.
- **`layers[]`** state — Up to 6 simultaneous entrainment layers, each with carrier frequency, beat diff start/end, amplitude, and BIN/ISO mode.

### Ramp Loop

A `requestAnimationFrame` loop (~60fps) interpolates each layer's beat frequency between `f_diff_start` and `f_diff_end` based on session progress, then applies phase modifiers. All frequency changes use Tone.js `rampTo()` for glitch-free transitions. The rAF loop pauses when the app is backgrounded on mobile (Capacitor lifecycle).

### Sub-Components (all inline in App.jsx)

| Component | Purpose |
|---|---|
| `WaveCanvas` | Real-time FFT waveform visualization on canvas |
| `TimerDisplay` | SVG circular progress ring with countdown |
| `PhaseBar` | Horizontal phase progress with color segments |
| `LayerRow` | Per-layer parameter editor (carrier, volume, beat diff, mode toggle) |

### Color Scheme

All colors derived from the viridis palette (R `viridis` package). Regenerate with `Rscript scripts/viridis-palette.R`.

- Band colors: viridis(5) — `#440154` (delta) through `#FDE725` (gamma)
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
