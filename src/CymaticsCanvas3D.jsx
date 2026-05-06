import { useEffect, useRef } from "react";
import * as THREE from "three";
import * as Tone from "tone";
import {
  BESSEL_ZEROS, J_TABLE, BESSEL_N_MAX, BESSEL_X_MAX, BESSEL_TABLE_SIZE,
} from "./bessel";

const SHELL_COUNT = 5;
const SHELL_LEVELS = [0.18, 0.32, 0.46, 0.60, 0.74];
const SHELL_HEIGHTS = [0.0, 0.22, 0.45, 0.68, 0.92];
const SHELL_ALPHAS = [0.55, 0.48, 0.42, 0.36, 0.30];
const PLANE_SEGMENTS = 180;
const BAND_TO_N = { delta: 1, theta: 2, alpha: 3, beta: 4, gamma: 5 };

function pickAngularMode(layer, layerIndex) {
  if (layer.band && BAND_TO_N[layer.band] !== undefined) return BAND_TO_N[layer.band];
  return (layerIndex % 6) + 1;
}

function pickRadialMode(carrierFrequency) {
  const m = 1 + Math.floor((carrierFrequency - 70) / 130);
  return Math.min(4, Math.max(1, m));
}

function buildBesselTexture() {
  const width = BESSEL_TABLE_SIZE + 1;
  const height = BESSEL_N_MAX + 1;
  const data = new Float32Array(width * height);
  for (let n = 0; n <= BESSEL_N_MAX; n++) {
    const tbl = J_TABLE[n];
    for (let i = 0; i < width; i++) {
      data[n * width + i] = tbl[i];
    }
  }
  const tex = new THREE.DataTexture(
    data, width, height, THREE.RedFormat, THREE.FloatType,
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

const VERTEX_SHADER = /* glsl */`
varying vec2 vPolar;
uniform float shellZ;
void main() {
  float r = length(position.xy);
  float th = atan(position.y, position.x);
  vPolar = vec2(r, th);
  vec3 p = vec3(position.x, position.y, shellZ);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */`
precision highp float;
varying vec2 vPolar;

uniform sampler2D besselTex;
uniform float besselTexW;
uniform float besselNRows;
uniform float besselXMax;
uniform float layerN[6];
uniform float layerAlpha[6];
uniform float layerAmp[6];
uniform vec2  layerPhase[6];
uniform int   layerCount;
uniform float shellLevel;
uniform float fieldNorm;
uniform float shellAlpha;

vec3 viridis(float t) {
  const vec3 c0 = vec3(0.267, 0.005, 0.329);
  const vec3 c1 = vec3(0.230, 0.322, 0.546);
  const vec3 c2 = vec3(0.128, 0.567, 0.551);
  const vec3 c3 = vec3(0.365, 0.785, 0.388);
  const vec3 c4 = vec3(0.993, 0.906, 0.144);
  if (t < 0.25) return mix(c0, c1, t * 4.0);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
  return mix(c3, c4, (t - 0.75) * 4.0);
}

float besselLookup(float n, float x) {
  float xn = x / besselXMax;
  if (xn > 0.999) return 0.0;
  float pix = xn * (besselTexW - 1.0);
  float xi = floor(pix);
  float xf = pix - xi;
  float vCoord = (n + 0.5) / besselNRows;
  float u0 = (xi + 0.5) / besselTexW;
  float u1 = (xi + 1.5) / besselTexW;
  float b0 = texture2D(besselTex, vec2(u0, vCoord)).r;
  float b1 = texture2D(besselTex, vec2(u1, vCoord)).r;
  return b0 + xf * (b1 - b0);
}

void main() {
  float r = vPolar.x;
  if (r > 1.0) discard;
  float th = vPolar.y;
  float u = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= layerCount) break;
    float n = layerN[i];
    float alpha = layerAlpha[i];
    float bv = besselLookup(n, alpha * r);
    float ang = cos(n * th) * layerPhase[i].x - sin(n * th) * layerPhase[i].y;
    u += layerAmp[i] * bv * ang;
  }
  float bright = abs(u) * fieldNorm;
  if (bright < shellLevel) discard;
  bright = clamp(bright, 0.0, 1.0);
  bright = pow(bright, 0.7);
  vec3 col = viridis(bright);
  gl_FragColor = vec4(col, shellAlpha);
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

export default function CymaticsCanvas3D({
  fftAnalyserRef, isPlaying, currentDiffs, layers, zenMode, onToggleZen, onToggle3D,
}) {
  const containerRef = useRef(null);
  const layersRef = useRef(layers);
  const diffsRef = useRef(currentDiffs);
  const isPlayingRef = useRef(isPlaying);
  const playStartRef = useRef(null);

  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { diffsRef.current = currentDiffs; }, [currentDiffs]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) playStartRef.current = performance.now() / 1000;
    else playStartRef.current = null;
  }, [isPlaying]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialWidth = zenMode ? window.innerWidth : 300;
    const initialHeight = zenMode ? window.innerHeight : 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialWidth, initialHeight);
    renderer.setClearColor(0x000004, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, initialWidth / initialHeight, 0.1, 50);

    const besselTex = buildBesselTexture();
    const planeGeometry = new THREE.PlaneGeometry(2, 2, PLANE_SEGMENTS, PLANE_SEGMENTS);

    const sharedLayerN = new Float32Array(6);
    const sharedLayerAlpha = new Float32Array(6);
    const sharedLayerAmp = new Float32Array(6);
    const sharedLayerPhase = Array.from({ length: 6 }, () => new THREE.Vector2());
    const sharedLayerCount = { value: 0 };
    const sharedFieldNorm = { value: 1.0 };

    const shellMeshes = [];
    for (let i = 0; i < SHELL_COUNT; i++) {
      const uniforms = {
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
        shellLevel: { value: SHELL_LEVELS[i] },
        shellZ: { value: SHELL_HEIGHTS[i] },
        shellAlpha: { value: SHELL_ALPHAS[i] },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(planeGeometry, material);
      scene.add(mesh);
      shellMeshes.push(mesh);
    }

    let cameraAngle = Math.PI * 0.25;
    let lastFrameTime = performance.now() / 1000;
    let rafId;

    const animate = () => {
      const nowSeconds = performance.now() / 1000;
      const dt = nowSeconds - lastFrameTime;
      lastFrameTime = nowSeconds;

      // Slow auto-orbit, ~5 deg/s.
      cameraAngle += dt * 0.087;
      const cameraRadius = 3.4;
      const cameraHeight = 2.0;
      camera.position.set(
        Math.cos(cameraAngle) * cameraRadius,
        cameraHeight,
        Math.sin(cameraAngle) * cameraRadius,
      );
      camera.lookAt(0, 0.45, 0);

      const playing = isPlayingRef.current && playStartRef.current !== null;
      const tSeconds = playing ? nowSeconds - playStartRef.current : nowSeconds;
      const sessionLayers = layersRef.current;
      const beatFrequencies = diffsRef.current;
      const layerCount = Math.min(6, sessionLayers.length);

      // Live spectrum.
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

      let amplitudeSum = 0;
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
          energy = 0.25 + 0.2 * Math.sin(tSeconds * 0.4 + l * 0.7);
        }

        const slowEnvelope = Math.cos(2 * Math.PI * beatHz * 0.25 * tSeconds);
        const baseAmp = layer.amp * (0.4 + energy);
        const amp = playing ? baseAmp * slowEnvelope : baseAmp * 0.35 * Math.sin(tSeconds * 0.3 + l);
        const phasePhi = 2 * Math.PI * l * 0.618 * tSeconds / 60;

        sharedLayerN[l] = angularN;
        sharedLayerAlpha[l] = alpha;
        sharedLayerAmp[l] = amp;
        sharedLayerPhase[l].set(Math.cos(phasePhi), Math.sin(phasePhi));
        amplitudeSum += Math.abs(amp);
      }
      // Zero out unused slots.
      for (let l = layerCount; l < 6; l++) {
        sharedLayerN[l] = 0;
        sharedLayerAlpha[l] = 0;
        sharedLayerAmp[l] = 0;
        sharedLayerPhase[l].set(1, 0);
      }
      sharedLayerCount.value = layerCount;
      sharedFieldNorm.value = 1 / Math.max(0.5, amplitudeSum);

      // Mark uniforms dirty (Three.js array uniforms are written by reference,
      // but flagging avoids edge-case caching on some drivers).
      for (const mesh of shellMeshes) {
        mesh.material.uniformsNeedUpdate = true;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const newWidth = zenMode ? window.innerWidth : 300;
      const newHeight = zenMode ? window.innerHeight : 300;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
    };
    if (zenMode) window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      if (zenMode) window.removeEventListener("resize", handleResize);
      shellMeshes.forEach(m => m.material.dispose());
      planeGeometry.dispose();
      besselTex.dispose();
      renderer.dispose();
      const dom = renderer.domElement;
      if (dom.parentNode) dom.parentNode.removeChild(dom);
    };
  }, [zenMode, fftAnalyserRef]);

  useEffect(() => {
    if (!zenMode) return;
    const handleKey = (e) => { if (e.key === "Escape") onToggleZen?.(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zenMode, onToggleZen]);

  if (zenMode) {
    return (
      <div role="dialog" aria-modal="true"
        aria-label="Zen 3D cymatic visualizer — press Escape to exit" tabIndex={-1}
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000004" }}
        onDoubleClick={onToggleZen}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
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
      <div ref={containerRef} aria-label="3D cymatic standing-wave visualizer"
        style={{
          width: 300, height: 300, borderRadius: 12, overflow: "hidden",
          border: "1px solid rgba(59,82,139,0.15)", background: "#000004",
        }} />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 10 }}>
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
