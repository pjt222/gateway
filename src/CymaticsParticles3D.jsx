import { useEffect, useRef } from "react";
import * as THREE from "three";
import * as Tone from "tone";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import {
  BESSEL_ZEROS, J_TABLE, BESSEL_N_MAX, BESSEL_X_MAX, BESSEL_TABLE_SIZE,
} from "./bessel";
import { VIRIDIS_GLSL, FIELD_UNIFORMS, FIELD_FUNCS } from "./cymaticField.glsl";
import { ModePicker, VIZ_TOGGLE_BTN, ZEN_BTN } from "./VizControls";
import { watchMedia } from "./utils";

const BAND_TO_N = { delta: 1, theta: 2, alpha: 3, beta: 4, gamma: 5 };

// Settle speed knob (driven by the "Settle" UI slider via the sandSpeed prop).
// uK (drift) and uDamp (settling) are derived from one number S so they scale
// together and the damping ratio stays constant — i.e. faster settle without
// overshoot/flicker. Settle time ≈ 2500ms / S (S=1 ≈ 2.5s calm sand, S=2.5 ≈ 1s,
// S=10 ≈ 250ms; above SAND_SPEED_MAX it hits the 60fps frame floor and gets noisy).
const SAND_SPEED_DEFAULT = 2.5;
const SAND_SPEED_MIN = 1;
const SAND_SPEED_MAX = 12;
const BASE_K = 0.28;          // drift strength at S=1
const BASE_DAMP = 0.9;        // per-(1/60)s velocity retention at S=1
const BASE_JITTER = 0.14;     // hop magnitude (fixed; spreads grains along the node)
const BASE_NODE_WIDTH = 0.12; // |u| glow band at S=1 (widens with S so fast/thin lines stay lit)
const clampSpeed = (s) => Math.max(SAND_SPEED_MIN, Math.min(SAND_SPEED_MAX, s || SAND_SPEED_DEFAULT));

// Angular mode n (number of nodal diameters) and radial mode m (nodal circles),
// mapped from the layer's band and carrier — identical to the nodal-shell viz so
// the two 3D modes describe the same standing-wave field.
function pickAngularMode(layer, layerIndex) {
  if (layer.band && BAND_TO_N[layer.band] !== undefined) return BAND_TO_N[layer.band];
  return (layerIndex % 6) + 1;
}
function pickRadialMode(carrierFrequency) {
  const m = 1 + Math.floor((carrierFrequency - 70) / 130);
  return Math.min(4, Math.max(1, m));
}

// J_n(x) lookup as a RedFormat float texture (rows = n, cols = x), sampled by
// besselLookup() in the shaders. Same packing as CymaticsCanvas3D.
function buildBesselTexture() {
  const width = BESSEL_TABLE_SIZE + 1;
  const height = BESSEL_N_MAX + 1;
  const data = new Float32Array(width * height);
  for (let n = 0; n <= BESSEL_N_MAX; n++) {
    const tbl = J_TABLE[n];
    for (let i = 0; i < width; i++) data[n * width + i] = tbl[i];
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

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

// Sand physics: each grain drifts down the gradient of the field energy E = u²
// toward the nodal lines (where u → 0), with a beat-modulated jitter that lets it
// hop along the nodes and escape shallow minima, plus damping so it settles.
// Channels: (xy) = disc position in [-1,1]², (zw) = velocity.
const COMPUTE_PHYSICS = /* glsl */`
precision highp float;
${FIELD_UNIFORMS}
uniform float uDt;
uniform float uTime;
uniform float uK;        // drift strength toward nodes
uniform float uJitter;   // random hop magnitude
uniform float uDamp;     // velocity retention per 1/60s (< 1 settles); rate-corrected below
uniform float uBeatPulse;// vibration intensity from the binaural beat envelope
${FIELD_FUNCS}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 s = texture2D(texturePosition, uv);
  vec2 pos = s.xy;
  vec2 vel = s.zw;

  // ∇(u²) by central differences — reuses cymaticField() verbatim, no analytic J_n'.
  float e = 0.006;
  float uxp = cymaticField(pos + vec2(e, 0.0));
  float uxm = cymaticField(pos - vec2(e, 0.0));
  float uyp = cymaticField(pos + vec2(0.0, e));
  float uym = cymaticField(pos - vec2(0.0, e));
  vec2 gradE = vec2(uxp * uxp - uxm * uxm, uyp * uyp - uym * uym) / (2.0 * e);

  vec2 acc = -uK * gradE;                       // descend energy → collect on nodes
  vec2 jit = vec2(
    hash(uv * 91.7 + uTime * 1.13),
    hash(uv * 57.3 - uTime * 0.97)
  ) * 2.0 - 1.0;
  acc += jit * uJitter * uBeatPulse;            // beat felt as agitation, not a flash

  vel += acc * uDt;
  vel *= pow(uDamp, uDt * 60.0); // frame-rate-independent: same decay/sec at 30 or 60fps
  // Cap speed so the explicit Euler step stays stable under strong drift (snappy
  // settle settings): without this, a high uK can diverge and NaN the HalfFloat texture.
  float sp = length(vel);
  if (sp > 4.0) vel *= 4.0 / sp;
  pos += vel * uDt;

  // Respawn any grain that blew up (NaN) or left the unit square at a random disc
  // point — self-heals the field instantly if a setting briefly went unstable.
  if (!(pos.x >= -1.0 && pos.x <= 1.0 && pos.y >= -1.0 && pos.y <= 1.0)) {
    float ang = hash(uv * 17.3 + uTime) * 6.2831853;
    float rad = sqrt(hash(uv * 53.9 - uTime));
    pos = vec2(cos(ang), sin(ang)) * rad;
    vel = vec2(0.0);
  }

  // The clamped plate's rim (r = 1) is itself a nodal line; keep grains on the disc.
  float rr = length(pos);
  if (rr > 0.995) { pos = pos / rr * 0.995; vel *= -0.25; }

  gl_FragColor = vec4(pos, vel);
}
`;

const POINTS_VERTEX = /* glsl */`
uniform sampler2D uPosTex;
uniform float uSize;
uniform float uDpr;
uniform float uNodeWidth;
${FIELD_UNIFORMS}
attribute vec2 aRef;
varying float vGlow;
${FIELD_FUNCS}
void main() {
  vec4 s = texture2D(uPosTex, aRef);
  vec2 p = s.xy;
  // Disc lies flat in the world XZ plane (Y is up); grains rest on the "plate".
  vec3 world = vec3(p.x, 0.0, p.y);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  // Grains settled on a nodal line (|u| → 0) glow brightest and swell slightly;
  // grains still drifting through the antinodes stay small and dim.
  float glow = 1.0 - smoothstep(0.0, uNodeWidth, abs(cymaticField(p)));
  vGlow = glow;
  // Floor at ~1px so grains never fall below a pixel and get culled — that was
  // making the small (non-zen) canvas drop to "a few dots" at some sizes.
  gl_PointSize = max(1.0, uSize * (0.45 + 0.85 * glow) * uDpr / max(0.1, -mv.z));
}
`;

const POINTS_FRAGMENT = /* glsl */`
precision highp float;
varying float vGlow;
${VIRIDIS_GLSL}
void main() {
  // Round, soft-edged grain.
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  // Nodal grains glow bright viridis; drifting grains stay dim and cool. Additive
  // blending then traces the nodal lines as luminous curves over the dark plate.
  vec3 col = viridis(0.30 + 0.65 * vGlow);
  gl_FragColor = vec4(col * a * (0.30 + vGlow), a);
}
`;

export default function CymaticsParticles3D({
  fftAnalyserRef, isPlaying, currentDiffs, layers, zenMode, onToggleZen, onToggle3D,
  viz3DMode, onSet3DMode, sandSpeed = SAND_SPEED_DEFAULT, onSandSpeed,
}) {
  const containerRef = useRef(null);
  const zenDialogRef = useRef(null);
  const layersRef = useRef(layers);
  const diffsRef = useRef(currentDiffs);
  const isPlayingRef = useRef(isPlaying);
  const playStartRef = useRef(null);
  const sandSpeedRef = useRef(sandSpeed);
  useEffect(() => { sandSpeedRef.current = sandSpeed; }, [sandSpeed]);
  const reducedMotionRef = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { diffsRef.current = currentDiffs; }, [currentDiffs]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    playStartRef.current = isPlaying ? performance.now() / 1000 : null;
  }, [isPlaying]);
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

    // antialias off: grains are soft round sprites (smoothstep + discard), so MSAA
    // over the fullscreen-zen surface buys nothing visually but costs real fill rate.
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(dpr);
    renderer.setSize(initial.w, initial.h);
    renderer.setClearColor(0x000004, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, initial.w / initial.h, 0.1, 50);

    // ── Standing-wave field, shared with the compute shader ───────────────
    const besselTex = buildBesselTexture();
    const sharedLayerN = new Float32Array(6);
    const sharedLayerAlpha = new Float32Array(6);
    const sharedLayerAmp = new Float32Array(6);
    const sharedLayerPhase = Array.from({ length: 6 }, () => new THREE.Vector2(1, 0));
    const sharedLayerCount = { value: 0 };
    const sharedFieldNorm = { value: 1.0 };

    // ── GPGPU particle state ──────────────────────────────────────────────
    const { w: TEX_W, h: TEX_H } = pickTextureSize();
    const COUNT = TEX_W * TEX_H;
    const gpu = new GPUComputationRenderer(TEX_W, TEX_H, renderer);
    gpu.setDataType(THREE.HalfFloatType); // safest float-target type on mobile WebViews

    const pos0 = gpu.createTexture();
    seedDiscPositions(pos0.image.data);
    const posVar = gpu.addVariable("texturePosition", COMPUTE_PHYSICS, pos0);
    gpu.setVariableDependencies(posVar, [posVar]);

    const computeUniforms = posVar.material.uniforms;
    computeUniforms.besselTex = { value: besselTex };
    computeUniforms.besselTexW = { value: BESSEL_TABLE_SIZE + 1 };
    computeUniforms.besselNRows = { value: BESSEL_N_MAX + 1 };
    computeUniforms.besselXMax = { value: BESSEL_X_MAX };
    computeUniforms.layerN = { value: sharedLayerN };
    computeUniforms.layerAlpha = { value: sharedLayerAlpha };
    computeUniforms.layerAmp = { value: sharedLayerAmp };
    computeUniforms.layerPhase = { value: sharedLayerPhase };
    computeUniforms.layerCount = sharedLayerCount;
    computeUniforms.fieldNorm = sharedFieldNorm;
    computeUniforms.uDt = { value: 1 / 60 };
    computeUniforms.uTime = { value: 0 };
    computeUniforms.uK = { value: BASE_K * SAND_SPEED_DEFAULT * SAND_SPEED_DEFAULT };
    computeUniforms.uJitter = { value: BASE_JITTER };
    computeUniforms.uDamp = { value: Math.pow(BASE_DAMP, SAND_SPEED_DEFAULT) };
    computeUniforms.uBeatPulse = { value: 0.4 };

    const initError = gpu.init();
    if (initError !== null) {
      // No float render-target support (older mobile WebView): hand back to the
      // nodal-shell viz (which needs no GPGPU) instead of orbiting an empty black
      // disc and draining battery on the weakest device. Tear down what we built.
      console.error("[CymaticsParticles3D] GPGPU init failed:", initError);
      besselTex.dispose();
      gpu.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
      const failDom = renderer.domElement;
      if (failDom.parentNode) failDom.parentNode.removeChild(failDom);
      onSet3DMode?.("shells");
      return undefined;
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
        uSize: { value: 9.0 },
        uDpr: { value: dpr },
        uNodeWidth: { value: 0.12 }, // |u| band counted as "on the node"
        // Field uniforms shared by reference with the compute pass, so the points
        // colour from exactly the same field the physics drove this frame.
        besselTex: { value: besselTex },
        besselTexW: { value: BESSEL_TABLE_SIZE + 1 },
        besselNRows: { value: BESSEL_N_MAX + 1 },
        besselXMax: { value: BESSEL_X_MAX },
        layerN: { value: sharedLayerN },
        layerAlpha: { value: sharedLayerAlpha },
        layerAmp: { value: sharedLayerAmp },
        layerPhase: { value: sharedLayerPhase },
        layerCount: sharedLayerCount,
        fieldNorm: sharedFieldNorm,
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
    scene.add(points);

    let cameraAngle = Math.PI * 0.25;
    let lastFrameTime = performance.now() / 1000;
    let rafId = 0;
    let stopped = false;

    const animate = () => {
      rafId = 0; // the queued frame has fired; cleared so startLoop sees no live frame
      if (stopped) return;
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

      {
        // ── Feed the standing-wave field (stable spatial nodes) + beat pulse ──
        const playing = isPlayingRef.current && playStartRef.current !== null;
        const tSeconds = playing ? nowSeconds - playStartRef.current : nowSeconds;
        const sessionLayers = layersRef.current;
        const beatFrequencies = diffsRef.current;
        const layerCount = Math.min(6, sessionLayers.length);

        let fftBins = null;
        let sampleRate = 48000;
        if (fftAnalyserRef?.current && playing) {
          try {
            fftBins = fftAnalyserRef.current.getValue();
            sampleRate = Tone.getContext().sampleRate || 48000;
          } catch { fftBins = null; }
        }

        let ampSum = 0;
        let pulseAccum = 0;
        for (let l = 0; l < layerCount; l++) {
          const layer = sessionLayers[l];
          const angularN = pickAngularMode(layer, l);
          const radialM = pickRadialMode(layer.f_base);
          const alpha = BESSEL_ZEROS[angularN][radialM - 1];
          const beatHz = (beatFrequencies && beatFrequencies[l]) || layer.f_diff_start;

          let energy;
          if (fftBins) {
            const binWidth = sampleRate / (fftBins.length * 2);
            const binIndex = Math.round(layer.f_base / binWidth);
            if (binIndex >= 0 && binIndex < fftBins.length) {
              const dB = fftBins[binIndex];
              const linear = isFinite(dB) ? Math.pow(10, dB / 20) : 0;
              energy = Math.min(1, linear * 6);
            } else {
              energy = 0.3;
            }
          } else {
            energy = 0.35; // constant idle energy → nodes hold still (no breathing)
          }

          // Stable amplitude: the fast beat envelope is deliberately NOT baked in
          // here, so the nodal geometry stays put and grains can settle on it.
          const baseAmp = layer.amp * (0.4 + energy);
          // Slow golden-ratio phase rotation morphs the nodes gently — half the
          // shell's rate so the sand has time to pile; frozen under reduced-motion.
          const phasePhi = reduced ? 0 : 2 * Math.PI * l * 0.618 * tSeconds / 120;

          sharedLayerN[l] = angularN;
          sharedLayerAlpha[l] = alpha;
          sharedLayerAmp[l] = baseAmp;
          sharedLayerPhase[l].set(Math.cos(phasePhi), Math.sin(phasePhi));
          ampSum += Math.abs(baseAmp);
          pulseAccum += Math.abs(Math.cos(2 * Math.PI * beatHz * 0.25 * tSeconds));
        }
        for (let l = layerCount; l < 6; l++) {
          sharedLayerN[l] = 0; sharedLayerAlpha[l] = 0; sharedLayerAmp[l] = 0;
          sharedLayerPhase[l].set(1, 0);
        }
        sharedLayerCount.value = layerCount;
        sharedFieldNorm.value = 1 / Math.max(0.5, ampSum);

        computeUniforms.uTime.value = nowSeconds;
        computeUniforms.uDt.value = dt;
        // Settle speed: drift and damping scale together (constant damping ratio →
        // snappier without overshoot). Faster settling concentrates grains on a thinner
        // node curve, so widen the glow band with S to keep the line visible/dense.
        // Read live so window.__sandSpeed tunes it on the fly.
        const S = clampSpeed(sandSpeedRef.current);
        computeUniforms.uK.value = BASE_K * S * S;
        computeUniforms.uDamp.value = Math.pow(BASE_DAMP, S);
        pointsMaterial.uniforms.uNodeWidth.value = BASE_NODE_WIDTH * Math.pow(S, 0.5);
        // Beat envelope drives jitter only (agitation), never the spatial field —
        // so a beat is felt as the sand stirring, not the whole disc flashing.
        // Under reduced-motion the jitter is killed entirely (pulse 0): with the
        // field frozen, grains drift onto the nodes once and then hold still,
        // matching the sibling visualizers' static pose instead of churning forever.
        computeUniforms.uBeatPulse.value = reduced
          ? 0.0
          : (playing ? 0.3 + 0.7 * (pulseAccum / Math.max(1, layerCount)) : 0.35);
        posVar.material.uniformsNeedUpdate = true;
        pointsMaterial.uniformsNeedUpdate = true;

        gpu.compute();
        pointsMaterial.uniforms.uPosTex.value = gpu.getCurrentRenderTarget(posVar).texture;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    // Single owner of the rAF loop: cancel any queued frame, then re-arm only if
    // visible. Idempotent, so a doubled/stale 'visible' event (or mounting while
    // already hidden) can never leave two self-scheduling loops running at once —
    // which would double gpu.compute() and orphan a loop past dispose().
    const startLoop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (!document.hidden && !stopped) {
        lastFrameTime = performance.now() / 1000;
        rafId = requestAnimationFrame(animate);
      }
    };
    startLoop();

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
    // every frame is wasted battery in the background (mobile WebView). startLoop
    // both pauses (when hidden) and resumes (when visible) idempotently.
    const handleVisibility = () => { startLoop(); };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (windowResizeBound) window.removeEventListener("resize", handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      geometry.dispose();
      pointsMaterial.dispose();
      besselTex.dispose();
      gpu.dispose();
      // forceContextLoss before dispose so the GL context is released deterministically
      // — repeated zen toggles each build a fresh context and browsers cap them (~16).
      renderer.forceContextLoss();
      renderer.dispose();
      const dom = renderer.domElement;
      if (dom.parentNode) dom.parentNode.removeChild(dom);
    };
  }, [zenMode, fftAnalyserRef, onSet3DMode]);

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

  const settleMs = Math.round(2500 / clampSpeed(sandSpeed));
  const settleLabel = settleMs >= 1000 ? `${(settleMs / 1000).toFixed(1)}s` : `${settleMs}ms`;

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
      {/* Settle-speed control: how fast the grains chase the nodal lines after a
          field change. Overlaid bottom-center; a sibling of the canvas so it never
          triggers the canvas's click-to-zen. */}
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 8, zIndex: 10,
        background: "rgba(11,9,36,0.82)", border: "1px solid var(--border-2)",
        borderRadius: 8, padding: "5px 10px",
      }}>
        <label htmlFor="sand-settle" style={{ fontSize: 9, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--teal-label)", fontFamily: "'JetBrains Mono',monospace" }}>
          Settle</label>
        <input id="sand-settle" type="range" min={SAND_SPEED_MIN} max={SAND_SPEED_MAX} step={0.1}
          value={sandSpeed} aria-label="Sand settle speed"
          onChange={(e) => onSandSpeed?.(+e.target.value)}
          style={{ width: 88, accentColor: "var(--slider)", cursor: "pointer" }} />
        <span style={{ fontSize: 9, color: "var(--accent)", fontFamily: "'JetBrains Mono',monospace",
          minWidth: 36, textAlign: "right" }}>{settleLabel}</span>
      </div>
    </div>
  );
}
