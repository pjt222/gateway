# Gateway Session — Binaural Beat Meditation Engine

Interactive real-time binaural beat meditation tool inspired by the Monroe Institute's Gateway Experience. Cross-platform app built with React, Tone.js (Web Audio API), and Capacitor (iOS/Android/web).

**[Live Demo →](https://pjt222.github.io/gateway/)**

## Features

### Audio Engine
- **Binaural Beats**: Stereo oscillator pairs (L/R hard-panned) generating perceptual beat frequencies via interaural frequency difference
- **Isochronal Pulses**: Alternative entrainment mode using LFO amplitude modulation on a mono carrier — works without headphones, stronger entrainment at higher frequencies (β/γ)
- **Pink Noise**: Native `Tone.Noise("pink")` generator with adjustable level
- **Frequency Ramping**: Per-layer `f_diff_start → f_diff_end` interpolated smoothly over session duration via `requestAnimationFrame` loop
- **Fade Envelopes**: 4-second cosine fade-in/out on master gain to prevent click artifacts
- **Live Parameter Updates**: All parameters (carrier, beat diff, volume, noise, global volume) adjustable during playback via `rampTo()` — no audio glitches

### Session Phases
Three phase script templates that modulate beat progression, amplitude, and noise over the session arc:

| Script | Phases |
|---|---|
| **Classic Gateway** | Relaxation → Transition → Target State → Return |
| **Deep Dive** | Settling → Descent → Abyss → Ascent |
| **Steady State** | Single continuous phase |

Each phase defines:
- `beatMul` — modifies frequency ramp position (0 = target freq, 1 = normal, >1 = overshoot toward start)
- `ampMul` — amplitude scaling factor
- `noiseAdd` — additive noise level offset

### Presets (Monroe Focus Levels)
- **Focus 10** — Mind Awake, Body Asleep (Delta ground + Alpha→Theta ramp + Gamma clarity)
- **Focus 12** — Expanded Awareness (Delta anchor + Theta drift + Beta spark [isochronal])
- **Focus 15** — No Time / Deep Exploration (Sub-Delta + Deep Theta + Gamma web [isochronal])
- **Focus 21** — Bridge State / Other Systems (4-layer stack with Infra-Delta to High Gamma)
- **Custom** — User-configurable

### UI
- **Fractal Beat Visualizer**: Circular concentric rings per layer, pulsating at the mathematically correct beat envelope `cos(π·Δf·t)`, with 3-octave fractal harmonics tied to carrier/beat ratio
- Circular timer with SVG progress ring
- Phase progress bar with named segments
- Viridis color scheme (δ/θ/α/β/γ brainwave band mapping)
- Per-layer controls: Carrier (L), Actual (R), volume, beat Δf, BIN/ISO toggle
- Preset layers band-capped to target brainwave ranges; Custom layers have full adaptive range
- Global master volume control
- Up to 6 simultaneous entrainment layers
- Editable layer labels

## Architecture

```
src/
├── constants.js            Data: PRESETS, PHASE_TEMPLATES, BAND_RANGE, BAND_LABELS
├── utils.js                Pure functions: getBandColor, getBandName, lerp, fmt
├── FractalBeatCanvas.jsx   Circular fractal beat envelope visualizer (canvas 2D)
├── components.jsx          PhaseBar, TimerDisplay, LayerRow
├── useAudioEngine.js       Custom hook: Tone.js audio graph, ramp loop, session control
└── App.jsx                 Coordinator: state management, presets, layout
```

### Audio Graph (Tone.js)

```
Layer (BIN):  OscL ──→ GainL ──→ PanL(-1) ──┐
              OscR ──→ GainR ──→ PanR(+1) ──┤
                                              │
Layer (ISO):  Osc ──→ LFO·Gain ──→ Gain ───┤
                                              │
Noise:        Pink ──→ NoiseGain ───────────┤
                                              ▼
                                         MasterGain ──→ GlobalGain ──→ Destination
                                              │
                                    Waveform Analyser
```

## Setup

### Prerequisites
- Node.js ≥ 18
- npm or pnpm

### Quick Start
```bash
git clone https://github.com/pjt222/gateway.git
cd gateway
npm install
npm run dev
```

### Mobile (Capacitor)
```bash
npm run cap:android    # Build + open in Android Studio
npm run cap:ios        # Build + open in Xcode
```

### Usage
1. Open in browser (stereo headphones recommended for binaural mode)
2. Select a preset or configure layers manually
3. Choose session duration and phase script
4. Press **▶ Begin**
5. Adjust parameters in real-time during playback

## Development Roadmap

### Near-term
- [ ] Guided voice cue system (text-to-speech or audio file triggers at phase transitions)
- [ ] Custom phase editor UI (drag to resize phase segments, edit modifiers)
- [ ] Session presets save/load (localStorage or JSON export)
- [ ] Breathing pacer overlay (visual breath guide synced to session phases)
- [ ] EQ/filter on pink noise (bandpass to shape spectral content)

### Medium-term
- [ ] Multi-session sequences (e.g., Focus 10 → 12 → 15 progression)
- [ ] WAV/WebM export (OfflineAudioContext rendering)
- [ ] Spatial audio mode (WebAudio HRTF panner for 3D sound positioning)
- [ ] Heart rate variability (HRV) integration via Web Bluetooth
- [ ] Dark/light theme toggle

### Exploratory
- [ ] Strudel/Tidal Cycles integration for live-coded session design
- [ ] WebMIDI output for external synth control
- [ ] Shared sessions via WebRTC (synchronized group meditation)
- [ ] EEG feedback loop (Muse headband integration)

## Technical Notes

### Phase Frequency Modulation
The ramp loop runs at display refresh rate (~60fps) and uses `lerp()` to interpolate each layer's beat frequency between `f_diff_start` and `f_diff_end` based on global session progress. Phase scripts apply a secondary modifier (`beatMul`) that blends toward start or end frequency, creating the characteristic Gateway "deepening and return" arc.

### Isochronal vs Binaural
- **Binaural**: Two slightly different frequencies in L/R ears → brain perceives beat at the difference frequency. Requires headphones. Most effective in δ/θ range.
- **Isochronal**: Single carrier amplitude-modulated by an LFO at the target frequency. Works with speakers. Sharper entrainment signal, preferred for β/γ.

### Audio Safety
- Master output peak-limited to 0.9 (-0.9 dB)
- 4-second fade envelopes prevent transient clicks
- All frequency changes use `rampTo()` for glitch-free transitions
- Global volume defaults to 75%

## License
MIT

## Credits
Inspired by Robert Monroe's Hemi-Sync® technology and the Gateway Experience program.
Built with [React](https://react.dev/), [Tone.js](https://tonejs.github.io/), [Vite](https://vite.dev/), and [Capacitor](https://capacitorjs.com/). Color scheme from the [viridis](https://cran.r-project.org/package=viridis) R package.
