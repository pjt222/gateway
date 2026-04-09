import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getBandColor } from "./utils";

function bandIdx(f) { return f <= 4 ? 0 : f <= 8 ? 1 : f <= 13 ? 2 : f <= 30 ? 3 : 4; }

export default function ThreeVisualizer({ layers, currentDiffs, isPlaying, noiseLevel, size = 360, onToggleZen }) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const layersRef = useRef(layers);
  const diffsRef = useRef(currentDiffs);
  const playingRef = useRef(isPlaying);
  const noiseRef = useRef(noiseLevel);
  const startRef = useRef(performance.now() / 1000);

  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { diffsRef.current = currentDiffs; }, [currentDiffs]);
  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { noiseRef.current = noiseLevel; }, [noiseLevel]);
  useEffect(() => { if (isPlaying) startRef.current = performance.now() / 1000; }, [isPlaying]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000004, 0.9);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.borderRadius = "12px";

    /* Lighting — warm teal ambient + point light */
    scene.add(new THREE.AmbientLight(0x1a1a2e, 0.8));
    const pointLight = new THREE.PointLight(0x21908C, 2, 30);
    pointLight.position.set(2, 3, 5);
    scene.add(pointLight);
    const rimLight = new THREE.PointLight(0x3B528B, 1, 20);
    rimLight.position.set(-3, -2, 3);
    scene.add(rimLight);

    /* Noise particles — scattered points pulsing with pink noise */
    const PARTICLE_COUNT = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const phases = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3 + Math.random() * 2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xD3436E, size: 0.04, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* Center dot */
    const dotGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x21908C, transparent: true, opacity: 0.6 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    scene.add(dot);

    const state = { scene, camera, renderer, knots: [], particles, particlePhases: phases, dot, animId: null };
    stateRef.current = state;

    const animate = () => {
      const now = performance.now() / 1000;
      const t = playingRef.current ? now - startRef.current : now;
      const lrs = layersRef.current;
      const dfs = diffsRef.current;
      const playing = playingRef.current;

      /* Manage torus knots — add/remove as layers change */
      while (state.knots.length > lrs.length) {
        const k = state.knots.pop();
        scene.remove(k); k.geometry.dispose(); k.material.dispose();
      }

      lrs.forEach((layer, i) => {
        const df = (dfs && dfs[i]) || layer.f_diff_start;
        /* N from carrier/beat ratio, mapped to visual range via log scale */
        const rawN = Math.max(2, Math.round(layer.f_base / Math.max(df, 0.3)));
        const N = Math.max(2, Math.min(10, Math.round(Math.log2(rawN) * 2)));
        const q = bandIdx(df) + 1;
        const color = new THREE.Color(getBandColor(df));

        let knot = state.knots[i];
        /* Recreate geometry only when knot parameters change */
        if (!knot || knot.userData.N !== N || knot.userData.q !== q) {
          if (knot) { scene.remove(knot); knot.geometry.dispose(); knot.material.dispose(); }
          const geo = new THREE.TorusKnotGeometry(1.2, 0.06, 200, 12, N, q);
          const mat = new THREE.MeshPhongMaterial({
            color, transparent: true, opacity: 0.6,
            emissive: color, emissiveIntensity: 0.1,
            shininess: 80, side: THREE.DoubleSide
          });
          knot = new THREE.Mesh(geo, mat);
          knot.userData = { N, q };
          scene.add(knot);
          state.knots[i] = knot;
        }

        /* Animate rotation — golden angle separation between layers */
        const layerPhase = i * 2.399; /* golden angle in radians */
        knot.rotation.x = t * 0.08 + layerPhase;
        knot.rotation.y = t * 0.12 + layerPhase * 0.618;
        knot.rotation.z = t * 0.03;

        /* Beat envelope pulsation */
        if (playing) {
          const envelope = Math.cos(Math.PI * df * t);
          const scale = 0.5 + 0.3 * layer.amp + 0.15 * envelope * layer.amp;
          knot.scale.setScalar(scale);
          knot.material.emissiveIntensity = 0.05 + 0.3 * (0.5 + 0.5 * envelope) * layer.amp;
          knot.material.opacity = 0.3 + 0.5 * layer.amp;
        } else {
          knot.scale.setScalar(0.4 + 0.15 * layer.amp);
          knot.material.emissiveIntensity = 0.05;
          knot.material.opacity = 0.25;
        }

        knot.material.color.copy(color);
        knot.material.emissive.copy(color);
      });

      /* Noise particles — pulse opacity with noise level */
      const noiseAmp = noiseRef.current;
      particleMat.opacity = playing ? noiseAmp * 0.6 : noiseAmp * 0.15;
      particles.rotation.y = t * 0.01;
      particles.rotation.x = t * 0.005;
      /* Subtle per-particle twinkle via vertex displacement */
      const posArr = particleGeo.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const base = 3 + (((i * 2654435761) >>> 0) % 1000) / 500;
        const twinkle = playing ? 1 + 0.15 * Math.sin(t * 1.5 + phases[i]) * noiseAmp : 1;
        const r = base * twinkle;
        const theta2 = ((i * 2246822519) >>> 0) % 10000 / 10000 * Math.PI * 2 + t * 0.005;
        const phi2 = Math.acos(2 * (((i * 3266489917) >>> 0) % 10000 / 10000) - 1);
        posArr[i * 3] = r * Math.sin(phi2) * Math.cos(theta2);
        posArr[i * 3 + 1] = r * Math.sin(phi2) * Math.sin(theta2);
        posArr[i * 3 + 2] = r * Math.cos(phi2);
      }
      particleGeo.attributes.position.needsUpdate = true;

      /* Center dot pulse */
      const dotPulse = playing ? 1 + 0.3 * Math.sin(t * Math.PI * 0.5) : 1;
      dot.scale.setScalar(dotPulse);
      dotMat.opacity = playing ? 0.6 : 0.2;

      /* Camera — gentle orbit */
      camera.position.x = 1.5 * Math.sin(t * 0.04);
      camera.position.y = 0.8 * Math.sin(t * 0.025);
      camera.position.z = 5.5 + 0.5 * Math.sin(t * 0.02);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      state.animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(state.animId);
      state.knots.forEach(k => { scene.remove(k); k.geometry.dispose(); k.material.dispose(); });
      state.knots = [];
      particleGeo.dispose(); particleMat.dispose();
      dotGeo.dispose(); dotMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [size]);

  return (
    <div style={{ position: "relative", margin: "0 auto" }}>
      <div ref={mountRef} style={{
        width: size, height: size, borderRadius: 12, overflow: "hidden",
        border: "1px solid rgba(59,82,139,0.15)"
      }} />
      <button onClick={onToggleZen} aria-label="Zen mode" title="Zen mode"
        style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,4,0.5)",
          border: "1px solid rgba(59,82,139,0.2)", borderRadius: 6, padding: "5px 7px",
          cursor: "pointer", color: "rgba(33,144,140,0.5)", lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
        </svg>
      </button>
    </div>
  );
}
