import { useEffect, useRef } from "react";
import { getBandColor } from "./utils";

const VIZ_SEGMENTS = 180;
const VIZ_COS = new Float32Array(VIZ_SEGMENTS);
const VIZ_SIN = new Float32Array(VIZ_SEGMENTS);
for (let j = 0; j < VIZ_SEGMENTS; j++) {
  const th = j * 2 * Math.PI / VIZ_SEGMENTS;
  VIZ_COS[j] = Math.cos(th);
  VIZ_SIN[j] = Math.sin(th);
}

export default function FractalBeatCanvas({ analyserRef, isPlaying, currentDiffs, layers, elapsed }) {
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
    canvas.width = 300 * dpr;
    canvas.height = 300 * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const SIZE = 300;
    const S = SIZE / 2;
    const cx = S;
    const cy = S;

    const draw = () => {
      const lrs = layersRef.current;
      const dfs = diffsRef.current;
      const N = lrs.length;
      const playing = isPlaying && playStartRef.current !== null;
      const t = playing
        ? performance.now() / 1000 - playStartRef.current
        : performance.now() / 1000;

      const mInner = S * 0.18;
      const mOuter = S * 0.1;
      const usable = S - mInner - mOuter;
      const band = N > 0 ? usable / N : usable;

      // fade-trail clear
      ctx.fillStyle = "rgba(0,0,4,0.15)";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.translate(cx, cy);

      // idle rotation
      const idleRot = playing ? 0 : t * 0.02;

      // per-layer rings
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

        // glow pass
        ctx.lineWidth = 5;
        ctx.strokeStyle = color;
        ctx.globalAlpha = playing ? 0.12 : 0.04;
        ctx.stroke();
        // core pass
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = playing ? 0.85 : 0.25;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // outer waveform ring
      if (analyserRef.current && playing) {
        const data = analyserRef.current.getValue();
        const rOuter = S - mOuter * 0.5;
        const wAmp = mOuter * 0.8;
        ctx.beginPath();
        for (let j = 0; j < data.length; j++) {
          const theta = (j / data.length) * 2 * Math.PI;
          const r = rOuter + data[j] * wAmp;
          const x = r * Math.cos(theta);
          const y = r * Math.sin(theta);
          j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(59,82,139,0.35)";
        ctx.stroke();
      }

      // center dot
      const dotR = 3 + (playing ? 1.5 * Math.sin(0.5 * Math.PI * t) : 0);
      ctx.beginPath();
      ctx.arc(0, 0, dotR, 0, 2 * Math.PI);
      ctx.fillStyle = playing ? "rgba(33,144,140,0.6)" : "rgba(33,144,140,0.2)";
      ctx.fill();

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyserRef, isPlaying]);

  return <canvas ref={canvasRef} width={300} height={300} aria-label="Fractal beat frequency visualizer"
    style={{ width:"100%",maxWidth:300,aspectRatio:"1",borderRadius:12,
      background:"rgba(0,0,4,0.8)",border:"1px solid rgba(59,82,139,0.15)",
      display:"block",margin:"0 auto" }} />;
}
