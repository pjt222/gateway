import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import { VIRIDIS_GLSL } from "./cymaticField.glsl";
import { watchMedia } from "./utils";

// Drifting Chladni sand: GPGPU particles wander the unit disc and (once physics
// lands in the next commit) settle onto the standing-wave nodal lines. This
// commit is the plumbing only — a position texture of random disc points sampled
// by a THREE.Points cloud, an identity compute pass exercising the ping-pong, and
// the orbit/zen/resize/control-cluster shell shared with the 3D nodal viz.

// Particle budget scales with the device: a coarse pointer (phone/tablet WebView)
// is the perf floor, so it gets a smaller compute texture than a desktop GPU.
function pickTextureSize() {
  const coarse =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
  return coarse ? { w: 96, h: 64 } : { w: 128, h: 128 }; // 6,144 vs 16,384 grains
}

// Fill an RGBA float texture with random points uniformly inside the unit disc.
// Channels: (x, y) = disc position in [-1,1]², (z, w) = velocity, seeded to 0.
function seedDiscPositions(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.sqrt(Math.random()); // sqrt → uniform area density
    const th = Math.random() * Math.PI * 2;
    data[i] = r * Math.cos(th);
    data[i + 1] = r * Math.sin(th);
    data[i + 2] = 0;
    data[i + 3] = 0;
  }
}

// Identity ping-pong: hold positions still until the physics pass replaces this.
const COMPUTE_IDENTITY = /* glsl */`
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  gl_FragColor = texture2D(texturePosition, uv);
}
`;

const POINTS_VERTEX = /* glsl */`
uniform sampler2D uPosTex;
uniform float uSize;
uniform float uDpr;
attribute vec2 aRef;
varying vec3 vColor;
${VIRIDIS_GLSL}
void main() {
  vec4 s = texture2D(uPosTex, aRef);
  vec2 p = s.xy;
  // Disc lies flat in the world XZ plane (Y is up); grains rest on the "plate".
  vec3 world = vec3(p.x, 0.0, p.y);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uDpr / max(0.1, -mv.z);
  vColor = viridis(clamp(length(p), 0.0, 1.0));
}
`;

const POINTS_FRAGMENT = /* glsl */`
precision highp float;
varying vec3 vColor;
void main() {
  // Round, soft-edged grain.
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a, a);
}
`;

const VIZ_TOGGLE_BTN = {
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

const ZEN_BTN = {
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

// Shells | Sand segmented picker, shared verbatim with CymaticsCanvas3D.
function ModePicker({ mode, onSet }) {
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
      <button onClick={() => onSet?.("shells")} aria-pressed={mode === "shells"}
        title="Nodal shells" style={seg(mode === "shells")}>Shells</button>
      <button onClick={() => onSet?.("particles")} aria-pressed={mode === "particles"}
        title="Drifting sand" style={seg(mode === "particles")}>Sand</button>
    </div>
  );
}

export default function CymaticsParticles3D({
  isPlaying, zenMode, onToggleZen, onToggle3D, viz3DMode, onSet3DMode,
}) {
  const containerRef = useRef(null);
  const zenDialogRef = useRef(null);
  const reducedMotionRef = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => watchMedia("(prefers-reduced-motion: reduce)", (m) => { reducedMotionRef.current = m; }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureSize = () => {
      if (zenMode) return { w: window.innerWidth, h: window.innerHeight };
      const s = Math.round(container.clientWidth || 0) || 300;
      return { w: s, h: s };
    };
    const initial = measureSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(dpr);
    renderer.setSize(initial.w, initial.h);
    renderer.setClearColor(0x000004, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, initial.w / initial.h, 0.1, 50);

    // ── GPGPU particle state ──────────────────────────────────────────────
    const { w: TEX_W, h: TEX_H } = pickTextureSize();
    const COUNT = TEX_W * TEX_H;
    const gpu = new GPUComputationRenderer(TEX_W, TEX_H, renderer);
    gpu.setDataType(THREE.HalfFloatType); // safest float-target type on mobile WebViews

    const pos0 = gpu.createTexture();
    seedDiscPositions(pos0.image.data);
    const posVar = gpu.addVariable("texturePosition", COMPUTE_IDENTITY, pos0);
    gpu.setVariableDependencies(posVar, [posVar]);

    const initError = gpu.init();
    let gpuOk = true;
    if (initError !== null) {
      // No float render-target support (older mobile WebView): bail gracefully
      // rather than throwing — the disc stays black and the shell mode remains.
      console.error("[CymaticsParticles3D] GPGPU init failed:", initError);
      gpuOk = false;
    }

    // ── Point cloud sampling the position texture ─────────────────────────
    const geometry = new THREE.BufferGeometry();
    const dummyPos = new Float32Array(COUNT * 3);
    const refs = new Float32Array(COUNT * 2);
    for (let j = 0; j < COUNT; j++) {
      refs[j * 2] = ((j % TEX_W) + 0.5) / TEX_W;
      refs[j * 2 + 1] = (Math.floor(j / TEX_W) + 0.5) / TEX_H;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(dummyPos, 3));
    geometry.setAttribute("aRef", new THREE.BufferAttribute(refs, 2));
    geometry.setDrawRange(0, COUNT);

    const pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosTex: { value: null },
        uSize: { value: 7.0 },
        uDpr: { value: dpr },
      },
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    points.frustumCulled = false;
    if (gpuOk) scene.add(points);

    let cameraAngle = Math.PI * 0.25;
    let lastFrameTime = performance.now() / 1000;
    let rafId;

    const animate = () => {
      const nowSeconds = performance.now() / 1000;
      const dt = Math.min(0.05, nowSeconds - lastFrameTime);
      lastFrameTime = nowSeconds;
      const reduced = reducedMotionRef.current;

      // Calm auto-orbit (~3 deg/s) over the plate; frozen under reduced-motion.
      if (!reduced) cameraAngle += dt * 0.05;
      const cameraRadius = 3.6;
      const cameraHeight = 2.6;
      camera.position.set(
        Math.cos(cameraAngle) * cameraRadius,
        cameraHeight,
        Math.sin(cameraAngle) * cameraRadius,
      );
      camera.lookAt(0, 0, 0);

      if (gpuOk) {
        gpu.compute();
        pointsMaterial.uniforms.uPosTex.value = gpu.getCurrentRenderTarget(posVar).texture;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const { w, h } = measureSize();
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    let resizeObserver = null;
    let windowResizeBound = false;
    if (!zenMode && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", handleResize);
      windowResizeBound = true;
    }

    // Pause the GPGPU loop while the tab/app is hidden — a compute + draw pass
    // every frame is wasted battery in the background (mobile WebView).
    const handleVisibility = () => {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
      } else {
        lastFrameTime = performance.now() / 1000;
        rafId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (windowResizeBound) window.removeEventListener("resize", handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      geometry.dispose();
      pointsMaterial.dispose();
      gpu.dispose();
      renderer.dispose();
      const dom = renderer.domElement;
      if (dom.parentNode) dom.parentNode.removeChild(dom);
    };
  }, [zenMode]);

  useEffect(() => {
    if (!zenMode) return;
    const handleKey = (e) => { if (e.key === "Escape") onToggleZen?.(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zenMode, onToggleZen]);

  useEffect(() => { if (zenMode) zenDialogRef.current?.focus(); }, [zenMode]);

  if (zenMode) {
    return (
      <div ref={zenDialogRef} role="dialog" aria-modal="true"
        aria-label="Zen 3D drifting-sand visualizer — press Escape to exit" tabIndex={-1}
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000004" }}
        onDoubleClick={onToggleZen}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        <div style={{
          position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)",
          fontSize: 10, color: "rgba(33,144,140,0.7)", fontFamily: "'JetBrains Mono',monospace",
          pointerEvents: "none", letterSpacing: "0.08em",
        }}>
          ESC or double-click to exit
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", margin: "0 auto", width: "100%", maxWidth: 560 }}>
      <div ref={containerRef} aria-label="3D drifting-sand cymatic visualizer — activate for zen mode"
        className={isPlaying ? "gw-live" : undefined}
        onClick={onToggleZen}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " " || e.key === "Spacebar") && !e.repeat) { e.preventDefault(); onToggleZen?.(); } }}
        title="Click for zen mode"
        style={{
          width: "100%", aspectRatio: "1", borderRadius: 12, overflow: "hidden",
          border: "1px solid var(--border-2)", background: "#000004", cursor: "pointer",
        }} />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 10 }}>
        <ModePicker mode={viz3DMode} onSet={onSet3DMode} />
        <button onClick={onToggle3D} aria-label="Switch to 2D view"
          title="Switch to 2D" style={VIZ_TOGGLE_BTN}>2D</button>
        <button onClick={onToggleZen} aria-label="Zen mode" title="Zen mode" style={ZEN_BTN}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
