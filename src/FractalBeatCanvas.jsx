import { useEffect, useRef } from "react";
import { getBandColor } from "./utils";

const VIZ_SEGMENTS = 180;

/* Pre-hashed stable noise pixel positions (Knuth multiplicative hash) */
const NOISE_PIXEL_MAX = 600;
const NOISE_PIXELS = [];
for (let i = 0; i < NOISE_PIXEL_MAX; i++) {
  const h1 = (((i + 1) * 2654435761) >>> 0);
  const h2 = (((i + 1) * 2246822519) >>> 0);
  const h3 = (((i + 1) * 3266489917) >>> 0);
  NOISE_PIXELS.push({
    x: (h1 % 10000) / 10000,
    y: (h2 % 10000) / 10000,
    phase: (h3 % 10000) / 10000 * Math.PI * 2,
  });
}

export default function FractalBeatCanvas({ analyserRef, noiseAnalyserRef, isPlaying, currentDiffs, layers, elapsed, zenMode, onToggleZen }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const diffsRef = useRef(currentDiffs);
  const layersRef = useRef(layers);
  const playStartRef = useRef(null);
  useEffect(() => { diffsRef.current = currentDiffs; }, [currentDiffs]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => {
    if (isPlaying) playStartRef.current = performance.now() / 1000;
    else playStartRef.current = null;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const getSize = () => zenMode
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 300, h: 300 };

    const applySize = () => {
      const { w, h } = getSize();
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return { w, h };
    };

    let { w, h } = applySize();

    const draw = () => {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const lrs = layersRef.current;
      const dfs = diffsRef.current;
      const N = lrs.length;
      const playing = isPlaying && playStartRef.current !== null;
      const t = playing
        ? performance.now() / 1000 - playStartRef.current
        : performance.now() / 1000;

      const SIZE = zenMode ? Math.min(w, h) * 0.8 : Math.min(w, h);
      const S = SIZE / 2;
      const cx = w / 2;
      const cy = h / 2;

      const mInner = S * 0.18;
      const mOuter = S * 0.1;
      const usable = S - mInner - mOuter;
      const band = N > 0 ? usable / N : usable;

      /* fade-trail clear */
      ctx.fillStyle = "rgba(0,0,4,0.15)";
      ctx.fillRect(0, 0, w, h);

      /* ── Pink noise pixel field ── */
      if (noiseAnalyserRef?.current && playing) {
        const noiseData = noiseAnalyserRef.current.getValue();
        const count = zenMode ? NOISE_PIXEL_MAX : 200;
        for (let p = 0; p < count; p++) {
          const val = Math.abs(noiseData[p % noiseData.length]);
          if (val < 0.005) continue;
          const np = NOISE_PIXELS[p];
          const flicker = 0.5 + 0.5 * Math.sin(t * 1.5 + np.phase);
          const alpha = Math.min(0.45, val * flicker * 2.5);
          ctx.fillStyle = `rgba(211,67,110,${alpha.toFixed(3)})`;
          ctx.fillRect(np.x * w, np.y * h, zenMode ? 2 : 1.5, zenMode ? 2 : 1.5);
        }
      } else {
        /* subtle idle ambient pixels */
        const count = zenMode ? 150 : 50;
        for (let p = 0; p < count; p++) {
          const np = NOISE_PIXELS[p];
          const flicker = 0.2 + 0.2 * Math.sin(t * 0.3 + np.phase);
          ctx.fillStyle = `rgba(211,67,110,${(flicker * 0.06).toFixed(3)})`;
          ctx.fillRect(np.x * w, np.y * h, 1, 1);
        }
      }

      ctx.save();
      ctx.translate(cx, cy);

      /* idle rotation */
      const idleRot = playing ? 0 : t * 0.02;

      /* ── Per-layer fractal rings ── */
      for (let i = 0; i < N; i++) {
        const layer = lrs[i];
        const df = (dfs && dfs[i]) || layer.f_diff_start;
        const color = getBandColor(df);
        const rBase = mInner + band * (i + 0.5);
        const aMax = band * 0.35 * layer.amp;
        const envelope = playing ? Math.cos(Math.PI * df * t) : 0;
        const rCenter = rBase + aMax * envelope;
        const hBase = Math.max(3, Math.min(64, Math.round(layer.f_base / Math.max(df, 0.3))));

        ctx.beginPath();
        for (let j = 0; j < VIZ_SEGMENTS; j++) {
          const theta = j * 2 * Math.PI / VIZ_SEGMENTS + idleRot;
          const cosJ = Math.cos(theta);
          const sinJ = Math.sin(theta);

          let fDisp = 0;
          for (let k = 1; k <= 3; k++) {
            const hk = Math.min(hBase * k, 64);
            const ampK = aMax / (1 << k);
            const phiK = 2 * Math.PI * df * k * 0.618 * t;
            fDisp += ampK * Math.sin(hk * theta + phiK);
          }
          const fractal = playing ? fDisp : fDisp * 0.05;
          const r = rCenter + fractal;
          const x = r * cosJ;
          const y = r * sinJ;
          j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();

        /* glow pass */
        ctx.lineWidth = zenMode ? 7 : 5;
        ctx.strokeStyle = color;
        ctx.globalAlpha = playing ? 0.12 : 0.04;
        ctx.stroke();
        /* core pass */
        ctx.lineWidth = zenMode ? 2 : 1.5;
        ctx.globalAlpha = playing ? 0.85 : 0.25;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      /* center dot */
      const dotR = (zenMode ? 5 : 3) + (playing ? 1.5 * Math.sin(0.5 * Math.PI * t) : 0);
      ctx.beginPath();
      ctx.arc(0, 0, dotR, 0, 2 * Math.PI);
      ctx.fillStyle = playing ? "rgba(33,144,140,0.6)" : "rgba(33,144,140,0.2)";
      ctx.fill();

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      const dims = applySize();
      w = dims.w;
      h = dims.h;
    };
    if (zenMode) window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      if (zenMode) window.removeEventListener("resize", handleResize);
    };
  }, [analyserRef, noiseAnalyserRef, isPlaying, zenMode]);

  /* Escape key exits zen mode */
  useEffect(() => {
    if (!zenMode) return;
    const handleKey = (e) => { if (e.key === "Escape") onToggleZen?.(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zenMode, onToggleZen]);

  if (zenMode) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:"#000004" }}
        onDoubleClick={onToggleZen}>
        <canvas ref={canvasRef} aria-label="Fractal beat visualizer (zen mode)"
          style={{ width:"100%", height:"100%", display:"block" }} />
        <div style={{ position:"absolute", bottom:16, left:"50%", transform:"translateX(-50%)",
          fontSize:10, color:"rgba(33,144,140,0.3)", fontFamily:"'JetBrains Mono',monospace",
          pointerEvents:"none", letterSpacing:"0.08em" }}>
          ESC or double-click to exit</div>
      </div>
    );
  }

  return (
    <div style={{ position:"relative", margin:"0 auto", maxWidth:300 }}>
      <canvas ref={canvasRef} width={300} height={300} aria-label="Fractal beat frequency visualizer"
        style={{ width:"100%", maxWidth:300, aspectRatio:"1", borderRadius:12,
          background:"rgba(0,0,4,0.8)", border:"1px solid rgba(59,82,139,0.15)",
          display:"block", margin:"0 auto", cursor:"pointer" }}
        onClick={onToggleZen} title="Click for zen mode" />
      <button onClick={onToggleZen} aria-label="Zen mode" title="Zen mode"
        style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,4,0.5)",
          border:"1px solid rgba(59,82,139,0.2)", borderRadius:6, padding:"5px 7px",
          cursor:"pointer", color:"rgba(33,144,140,0.5)", lineHeight:1,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
        </svg>
      </button>
    </div>
  );
}
