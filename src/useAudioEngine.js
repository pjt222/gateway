import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { PHASE_TEMPLATES, FADE_TIME } from "./constants";
import { lerp } from "./utils";

export function useAudioEngine({ layers, noiseLevel, globalVol, duration, phaseName }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentDiffs, setCurrentDiffs] = useState([]);

  const oscRefs = useRef([]); const noiseRef = useRef(null); const noiseGainRef = useRef(null);
  const masterGainRef = useRef(null); const globalGainRef = useRef(null);
  const analyserRef = useRef(null); const timerRef = useRef(null);
  const startTimeRef = useRef(null); const rampRef = useRef(null);
  const layersSnap = useRef(layers); const noiseLevelSnap = useRef(noiseLevel);
  useEffect(()=>{layersSnap.current=layers;},[layers]);
  useEffect(()=>{noiseLevelSnap.current=noiseLevel;},[noiseLevel]);

  const phases = PHASE_TEMPLATES[phaseName] || PHASE_TEMPLATES["Steady State"];

  const getPhaseParams = useCallback((t) => {
    const p = Math.min(t / (duration*60), 1); let cum = 0;
    for (const ph of phases) {
      if (p < cum + ph.pct || ph === phases[phases.length-1]) {
        return { ...ph, localT: Math.max(0,Math.min(1,(p-cum)/ph.pct)), globalT: p };
      }
      cum += ph.pct;
    }
    return { ...phases[phases.length-1], localT:1, globalT:1 };
  }, [phases, duration]);

  const disposeAll = useCallback(() => {
    oscRefs.current.forEach(p => {
      try{p.left?.stop();p.right?.stop();}catch(e){}
      try{p.left?.dispose();p.right?.dispose();p.gainL?.dispose();p.gainR?.dispose();p.panL?.dispose();p.panR?.dispose();}catch(e){}
      try{p.lfo?.stop();p.lfo?.dispose();p.lfoGain?.dispose();}catch(e){}
    });
    oscRefs.current = [];
    try{noiseRef.current?.stop();noiseRef.current?.dispose();}catch(e){}
    try{noiseGainRef.current?.dispose();}catch(e){}
    try{masterGainRef.current?.dispose();}catch(e){}
    try{globalGainRef.current?.dispose();}catch(e){}
    try{analyserRef.current?.dispose();}catch(e){}
  }, []);

  const buildAudio = useCallback(async () => {
    await Tone.start(); disposeAll();
    const gGain = new Tone.Gain(globalVol/100).toDestination();
    globalGainRef.current = gGain;
    const master = new Tone.Gain(0).connect(gGain);
    masterGainRef.current = master;
    const analyser = new Tone.Waveform(1024); master.connect(analyser); analyserRef.current = analyser;

    const pairs = layers.map(l => {
      if (l.mode === "isochronal") {
        const gn = new Tone.Gain(l.amp).connect(master);
        const lfoGain = new Tone.Gain(1).connect(gn);
        const osc = new Tone.Oscillator(l.f_base,"sine").connect(lfoGain);
        const lfo = new Tone.LFO(l.f_diff_start,0,1).connect(lfoGain.gain);
        lfo.start(); osc.start();
        return { left:osc,right:null,gainL:gn,gainR:null,panL:null,panR:null,lfo,lfoGain };
      } else {
        const pL = new Tone.Panner(-1).connect(master);
        const pR = new Tone.Panner(1).connect(master);
        const gL = new Tone.Gain(l.amp).connect(pL);
        const gR = new Tone.Gain(l.amp).connect(pR);
        const left = new Tone.Oscillator(l.f_base,"sine").connect(gL);
        const right = new Tone.Oscillator(l.f_base+l.f_diff_start,"sine").connect(gR);
        left.start(); right.start();
        return { left,right,gainL:gL,gainR:gR,panL:pL,panR:pR,lfo:null,lfoGain:null };
      }
    });
    oscRefs.current = pairs;

    const nG = new Tone.Gain(noiseLevel).connect(master);
    const noise = new Tone.Noise("pink").connect(nG); noise.start();
    noiseRef.current = noise; noiseGainRef.current = nG;
    master.gain.rampTo(0.9, FADE_TIME);
  }, [layers, noiseLevel, globalVol, disposeAll]);

  const startRampLoop = useCallback(() => {
    if (rampRef.current) cancelAnimationFrame(rampRef.current);
    const tick = () => {
      if (!startTimeRef.current) return;
      const t = (Date.now() - startTimeRef.current) / 1000;
      const gP = Math.min(t / (duration*60), 1);
      const pp = getPhaseParams(t);
      const snap = layersSnap.current;
      const diffs = [];
      oscRefs.current.forEach((pair, i) => {
        if (!snap[i]) return;
        const l = snap[i];
        let cd = lerp(l.f_diff_start, l.f_diff_end, gP);
        if (pp.beatMul !== undefined && pp.beatMul !== 1.0) {
          const pd = lerp(l.f_diff_end, l.f_diff_start, pp.beatMul);
          cd = lerp(cd, pd, 0.3);
        }
        cd = Math.max(0.3, cd); diffs.push(cd);
        const am = pp.ampMul ?? 1.0;
        if (l.mode === "isochronal") {
          if (pair.lfo) pair.lfo.frequency.rampTo(cd, 1.0);
          if (pair.gainL) pair.gainL.gain.rampTo(l.amp*am, 0.5);
        } else {
          if (pair.left) pair.left.frequency.rampTo(l.f_base, 0.5);
          if (pair.right) pair.right.frequency.rampTo(l.f_base+cd, 0.5);
          if (pair.gainL) pair.gainL.gain.rampTo(l.amp*am, 0.5);
          if (pair.gainR) pair.gainR.gain.rampTo(l.amp*am, 0.5);
        }
      });
      if (noiseGainRef.current) {
        const nm = Math.max(0, noiseLevelSnap.current + (pp.noiseAdd ?? 0));
        noiseGainRef.current.gain.rampTo(nm, 1.0);
      }
      setCurrentDiffs(diffs);
      rampRef.current = requestAnimationFrame(tick);
    };
    rampRef.current = requestAnimationFrame(tick);
  }, [duration, getPhaseParams]);

  const stopSession = useCallback(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.rampTo(0, FADE_TIME);
      setTimeout(()=>disposeAll(), FADE_TIME*1000+200);
    }
    clearInterval(timerRef.current);
    if (rampRef.current) cancelAnimationFrame(rampRef.current);
    setIsPlaying(false);
  }, [disposeAll]);

  const startSession = useCallback(async () => {
    await buildAudio();
    setElapsed(0); setCurrentDiffs(layers.map(l=>l.f_diff_start));
    startTimeRef.current = Date.now(); setIsPlaying(true);
    timerRef.current = setInterval(()=>{
      const s=(Date.now()-startTimeRef.current)/1000; setElapsed(s);
      if (s >= duration*60) stopSession();
    }, 250);
    startRampLoop();
  }, [buildAudio, duration, layers, startRampLoop, stopSession]);

  useEffect(()=>{
    if (globalGainRef.current) globalGainRef.current.gain.rampTo(globalVol/100, 0.15);
  },[globalVol]);

  useEffect(()=>()=>{
    clearInterval(timerRef.current); if(rampRef.current) cancelAnimationFrame(rampRef.current); disposeAll();
  },[disposeAll]);

  // Handle mobile app lifecycle (Capacitor)
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail.isActive && isPlaying) {
        if (rampRef.current) cancelAnimationFrame(rampRef.current);
      } else if (e.detail.isActive && isPlaying) {
        startRampLoop();
      }
    };
    window.addEventListener('capacitor-app-state', handler);
    return () => window.removeEventListener('capacitor-app-state', handler);
  }, [isPlaying, startRampLoop]);

  return { isPlaying, elapsed, currentDiffs, analyserRef, startSession, stopSession };
}
