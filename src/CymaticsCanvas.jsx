import { useEffect, useMemo, useRef } from "react";
import * as Tone from "tone";
import {
  BESSEL_ZEROS, J_TABLE, BESSEL_N_MAX, BESSEL_TS, BESSEL_X_MAX,
} from "./bessel";

const GRID = 200;
const BAND_TO_N = { delta: 1, theta: 2, alpha: 3, beta: 4, gamma: 5 };

// Viridis-aligned palette stops (matches existing band colors in constants.js).
const VIRIDIS_STOPS = [
  [0.00, 0x00, 0x00, 0x04],
  [0.10, 0x44, 0x01, 0x54],
  [0.30, 0x3B, 0x52, 0x8B],
  [0.55, 0x21, 0x90, 0x8C],
  [0.78, 0x5D, 0xC8, 0x63],
  [1.00, 0xFD, 0xE7, 0x25],
];

function buildPalette() {
  const pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = VIRIDIS_STOPS[0];
    let s1 = VIRIDIS_STOPS[VIRIDIS_STOPS.length - 1];
    for (let k = 0; k < VIRIDIS_STOPS.length - 1; k++) {
      if (t >= VIRIDIS_STOPS[k][0] && t <= VIRIDIS_STOPS[k + 1][0]) {
        s0 = VIRIDIS_STOPS[k];
        s1 = VIRIDIS_STOPS[k + 1];
        break;
      }
    }
    const u = (t - s0[0]) / (s1[0] - s0[0] || 1);
    const r = Math.round(s0[1] + u * (s1[1] - s0[1]));
    const g = Math.round(s0[2] + u * (s1[2] - s0[2]));
    const b = Math.round(s0[3] + u * (s1[3] - s0[3]));
    // Little-endian RGBA: byte0=R byte1=G byte2=B byte3=A
    pal[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return pal;
}

function pickAngularMode(layer, layerIndex) {
  if (layer.band && BAND_TO_N[layer.band] !== undefined) return BAND_TO_N[layer.band];
  // Custom layer: spread across angular modes 1..6
  return ((layerIndex % 6) + 1);
}

function pickRadialMode(carrierFrequency) {
  // f_base ranges roughly 70–600; map to four radial modes
  const m = 1 + Math.floor((carrierFrequency - 70) / 130);
  return Math.min(4, Math.max(1, m));
}

export default function CymaticsCanvas({
  fftAnalyserRef, isPlaying, currentDiffs, layers, zenMode, onToggleZen, onToggle3D,
}) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const currentDiffsRef = useRef(currentDiffs);
  const layersRef = useRef(layers);
  const playStartTimeRef = useRef(null);
  const zenContainerRef = useRef(null);

  const palette = useMemo(() => buildPalette(), []);

  // Polar-coordinate grids and per-n trig tables, computed once for GRID×GRID.
  const polarTables = useMemo(() => {
    const radiusNormalized = new Float32Array(GRID * GRID);
    const insideDisc = new Uint8Array(GRID * GRID);
    const cosNTheta = [];
    const sinNTheta = [];
    for (let n = 0; n <= BESSEL_N_MAX; n++) {
      cosNTheta.push(new Float32Array(GRID * GRID));
      sinNTheta.push(new Float32Array(GRID * GRID));
    }
    const centerX = (GRID - 1) / 2;
    const centerY = (GRID - 1) / 2;
    const discRadius = Math.min(centerX, centerY) - 1;
    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        const idx = py * GRID + px;
        const dx = px - centerX;
        const dy = py - centerY;
        const r = Math.sqrt(dx * dx + dy * dy) / discRadius;
        radiusNormalized[idx] = r;
        insideDisc[idx] = r <= 1 ? 1 : 0;
        const theta = Math.atan2(dy, dx);
        for (let n = 0; n <= BESSEL_N_MAX; n++) {
          cosNTheta[n][idx] = Math.cos(n * theta);
          sinNTheta[n][idx] = Math.sin(n * theta);
        }
      }
    }
    return { radiusNormalized, insideDisc, cosNTheta, sinNTheta };
  }, []);

  useEffect(() => { currentDiffsRef.current = currentDiffs; }, [currentDiffs]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => {
    if (isPlaying) playStartTimeRef.current = performance.now() / 1000;
    else playStartTimeRef.current = null;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    const getCanvasSize = () => zenMode
      ? { displayWidth: window.innerWidth, displayHeight: window.innerHeight }
      : { displayWidth: 300, displayHeight: 300 };

    const applyCanvasSize = () => {
      const { displayWidth, displayHeight } = getCanvasSize();
      canvas.width = Math.round(displayWidth * devicePixelRatio);
      canvas.height = Math.round(displayHeight * devicePixelRatio);
      return { displayWidth, displayHeight };
    };

    let { displayWidth, displayHeight } = applyCanvasSize();

    const BESSEL_TABLE_SIZE_MINUS_1 = J_TABLE[0].length - 2;

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = GRID;
    offscreenCanvas.height = GRID;
    const offscreenContext = offscreenCanvas.getContext("2d");
    const offscreenImage = offscreenContext.createImageData(GRID, GRID);
    const offscreenPixels32 = new Uint32Array(offscreenImage.data.buffer);

    // Background pixel value (#000004 with alpha 255), packed RGBA little-endian.
    const backgroundPixel = (255 << 24) | (0 << 16) | (0 << 8) | 4;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const sessionLayers = layersRef.current;
      const beatFrequencies = currentDiffsRef.current;
      const layerCount = sessionLayers.length;
      const playing = isPlaying && playStartTimeRef.current !== null;
      const elapsedSeconds = playing
        ? performance.now() / 1000 - playStartTimeRef.current
        : performance.now() / 1000;

      // Per-layer parameters: angular mode n, wavenumber alpha, amplitude, phase trig.
      const layerAngularN = new Int32Array(layerCount);
      const layerAlpha = new Float32Array(layerCount);
      const layerAmplitude = new Float32Array(layerCount);
      const layerCosPhase = new Float32Array(layerCount);
      const layerSinPhase = new Float32Array(layerCount);

      // Pull the live spectrum once per frame and convert to linear energy near each carrier.
      let fftBins = null;
      let sampleRate = 48000;
      if (fftAnalyserRef?.current && playing) {
        try {
          fftBins = fftAnalyserRef.current.getValue();
          sampleRate = Tone.getContext().sampleRate || 48000;
        } catch {
          fftBins = null;
        }
      }

      for (let l = 0; l < layerCount; l++) {
        const layer = sessionLayers[l];
        const angularN = pickAngularMode(layer, l);
        const radialM = pickRadialMode(layer.f_base);
        const alpha = BESSEL_ZEROS[angularN][radialM - 1];
        const beatHz = (beatFrequencies && beatFrequencies[l]) || layer.f_diff_start;

        let energy;
        if (fftBins) {
          const binCount = fftBins.length;
          const binWidth = sampleRate / (binCount * 2);
          const binIndex = Math.round(layer.f_base / binWidth);
          if (binIndex >= 0 && binIndex < binCount) {
            const dB = fftBins[binIndex];
            const linear = isFinite(dB) ? Math.pow(10, dB / 20) : 0;
            energy = Math.min(1, linear * 6);
          } else {
            energy = 0.3;
          }
        } else {
          // Idle-state breathing so canvas never goes blank.
          energy = 0.25 + 0.2 * Math.sin(elapsedSeconds * 0.4 + l * 0.7);
        }

        // Slow visual envelope at beat frequency, scaled down to avoid strobing
        // at gamma rates (40+ Hz).
        const visualBeatScale = 0.25;
        const slowEnvelope = Math.cos(2 * Math.PI * beatHz * visualBeatScale * elapsedSeconds);
        const baseAmp = layer.amp * (0.4 + energy);
        const amplitude = playing ? baseAmp * slowEnvelope : baseAmp * 0.35 * Math.sin(elapsedSeconds * 0.3 + l);

        // Golden-ratio phase rotation prevents modes locking into a static rosette.
        const phasePhi = 2 * Math.PI * l * 0.618 * elapsedSeconds / 60;

        layerAngularN[l] = angularN;
        layerAlpha[l] = alpha;
        layerAmplitude[l] = amplitude;
        layerCosPhase[l] = Math.cos(phasePhi);
        layerSinPhase[l] = Math.sin(phasePhi);
      }

      const { radiusNormalized, insideDisc, cosNTheta, sinNTheta } = polarTables;

      // Sum of |amp| sets a normalization floor so the brightness never clips
      // when one preset has many strong layers, and never blows out when only one
      // weak layer is active.
      let amplitudeSum = 0;
      for (let l = 0; l < layerCount; l++) amplitudeSum += Math.abs(layerAmplitude[l]);
      const brightnessNorm = 1 / Math.max(0.5, amplitudeSum);

      // Inner pixel loop. Hot path — inlined Bessel lookup, no function calls.
      const totalPixels = GRID * GRID;
      for (let i = 0; i < totalPixels; i++) {
        if (!insideDisc[i]) {
          offscreenPixels32[i] = backgroundPixel;
          continue;
        }
        const r = radiusNormalized[i];
        let fieldSum = 0;
        for (let l = 0; l < layerCount; l++) {
          const n = layerAngularN[l];
          const xb = layerAlpha[l] * r * BESSEL_TS;
          let i0 = xb | 0;
          if (i0 < 0) i0 = 0;
          else if (i0 >= BESSEL_TABLE_SIZE_MINUS_1) i0 = BESSEL_TABLE_SIZE_MINUS_1;
          const frac = xb - i0;
          const tableForN = J_TABLE[n];
          const besselValue = tableForN[i0] + frac * (tableForN[i0 + 1] - tableForN[i0]);

          const angular = cosNTheta[n][i] * layerCosPhase[l] - sinNTheta[n][i] * layerSinPhase[l];
          fieldSum += layerAmplitude[l] * besselValue * angular;
        }
        let brightness = Math.abs(fieldSum) * brightnessNorm;
        if (brightness > 1) brightness = 1;
        // Mild gamma compression brings up subtle nodal structure.
        brightness = Math.pow(brightness, 0.7);
        const paletteIndex = (brightness * 255) | 0;
        offscreenPixels32[i] = palette[paletteIndex];
      }

      offscreenContext.putImageData(offscreenImage, 0, 0);

      ctx.fillStyle = "#000004";
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      const upscaledSize = zenMode
        ? Math.min(displayWidth, displayHeight) * 0.92
        : Math.min(displayWidth, displayHeight) * 0.96;
      const offsetX = (displayWidth - upscaledSize) / 2;
      const offsetY = (displayHeight - upscaledSize) / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(offscreenCanvas, offsetX, offsetY, upscaledSize, upscaledSize);

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      const dims = applyCanvasSize();
      displayWidth = dims.displayWidth;
      displayHeight = dims.displayHeight;
    };
    if (zenMode) window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      if (zenMode) window.removeEventListener("resize", handleResize);
    };
  }, [fftAnalyserRef, isPlaying, zenMode, polarTables, palette]);

  useEffect(() => {
    if (!zenMode) return;
    const handleKey = (e) => { if (e.key === "Escape") onToggleZen?.(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zenMode, onToggleZen]);

  useEffect(() => {
    if (zenMode && zenContainerRef.current) zenContainerRef.current.focus();
  }, [zenMode]);

  if (zenMode) {
    return (
      <div ref={zenContainerRef} role="dialog" aria-modal="true"
        aria-label="Zen mode visualizer — press Escape to exit" tabIndex={-1}
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000004" }}
        onDoubleClick={onToggleZen}>
        <canvas ref={canvasRef} aria-label="Cymatic standing-wave visualizer (zen mode)"
          style={{ width: "100%", height: "100%", display: "block" }} />
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          fontSize: 10, color: "rgba(33,144,140,0.3)", fontFamily: "'JetBrains Mono',monospace",
          pointerEvents: "none", letterSpacing: "0.08em",
        }}>
          ESC or double-click to exit
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", margin: "0 auto", maxWidth: 300 }}>
      <canvas ref={canvasRef} width={300} height={300}
        aria-label="Cymatic standing-wave visualizer"
        style={{
          width: "100%", maxWidth: 300, aspectRatio: "1", borderRadius: 12,
          background: "#000004", border: "1px solid rgba(59,82,139,0.15)",
          display: "block", margin: "0 auto",
        }}
        title="Click for zen mode" />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 10 }}>
        {onToggle3D && (
          <button onClick={onToggle3D} aria-label="Switch to 3D view" title="Switch to 3D"
            style={{
              background: "rgba(11,9,36,0.92)", border: "1px solid rgba(93,200,99,0.55)",
              borderRadius: 6, padding: "6px 10px", cursor: "pointer",
              color: "#5DC863", lineHeight: 1, fontWeight: 600,
              fontSize: 11, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>3D</button>
        )}
        <button onClick={onToggleZen} aria-label="Zen mode" title="Zen mode"
          style={{
            background: "rgba(0,0,4,0.5)", border: "1px solid rgba(59,82,139,0.2)",
            borderRadius: 6, padding: "5px 7px", cursor: "pointer",
            color: "rgba(33,144,140,0.5)", lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
