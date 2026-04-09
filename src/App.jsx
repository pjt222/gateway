import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";

const PHASE_TEMPLATES = {
  "Classic Gateway": [
    { name: "Relaxation", pct: 0.2, beatMul: 1.0, ampMul: 0.7, noiseAdd: 0.05 },
    { name: "Transition", pct: 0.15, beatMul: 0.7, ampMul: 0.85, noiseAdd: 0.0 },
    { name: "Target State", pct: 0.45, beatMul: 0.0, ampMul: 1.0, noiseAdd: -0.03 },
    { name: "Return", pct: 0.2, beatMul: 1.5, ampMul: 0.6, noiseAdd: 0.02 },
  ],
  "Deep Dive": [
    { name: "Settling", pct: 0.25, beatMul: 1.0, ampMul: 0.6, noiseAdd: 0.08 },
    { name: "Descent", pct: 0.35, beatMul: 0.3, ampMul: 0.9, noiseAdd: 0.0 },
    { name: "Abyss", pct: 0.25, beatMul: 0.0, ampMul: 1.0, noiseAdd: -0.05 },
    { name: "Ascent", pct: 0.15, beatMul: 2.0, ampMul: 0.5, noiseAdd: 0.03 },
  ],
  "Steady State": [
    { name: "Full Session", pct: 1.0, beatMul: 0.0, ampMul: 1.0, noiseAdd: 0.0 },
  ],
};

const PRESETS = {
  "Focus 10": {
    description: "Mind Awake, Body Asleep",
    layers: [
      { label: "Delta Ground", f_base: 100, f_diff_start: 3.0, f_diff_end: 1.5, amp: 0.45, mode: "binaural" },
      { label: "Alpha\u2192Theta", f_base: 200, f_diff_start: 12.0, f_diff_end: 5.0, amp: 0.3, mode: "binaural" },
      { label: "Gamma Clarity", f_base: 400, f_diff_start: 40.0, f_diff_end: 40.0, amp: 0.08, mode: "binaural" },
    ],
    noise: 0.15, phases: "Classic Gateway",
  },
  "Focus 12": {
    description: "Expanded Awareness",
    layers: [
      { label: "Delta Anchor", f_base: 100, f_diff_start: 2.5, f_diff_end: 1.0, amp: 0.4, mode: "binaural" },
      { label: "Theta Drift", f_base: 200, f_diff_start: 7.0, f_diff_end: 4.5, amp: 0.35, mode: "binaural" },
      { label: "Beta Spark", f_base: 300, f_diff_start: 18.0, f_diff_end: 18.0, amp: 0.12, mode: "isochronal" },
    ],
    noise: 0.18, phases: "Classic Gateway",
  },
  "Focus 15": {
    description: "No Time \u2014 Deep Exploration",
    layers: [
      { label: "Sub-Delta", f_base: 80, f_diff_start: 1.5, f_diff_end: 0.5, amp: 0.5, mode: "binaural" },
      { label: "Deep Theta", f_base: 150, f_diff_start: 6.0, f_diff_end: 3.5, amp: 0.35, mode: "binaural" },
      { label: "Gamma Web", f_base: 420, f_diff_start: 42.0, f_diff_end: 42.0, amp: 0.06, mode: "isochronal" },
    ],
    noise: 0.22, phases: "Deep Dive",
  },
  "Focus 21": {
    description: "Bridge State \u2014 Other Systems",
    layers: [
      { label: "Infra-Delta", f_base: 70, f_diff_start: 1.0, f_diff_end: 0.3, amp: 0.5, mode: "binaural" },
      { label: "Theta Cascade", f_base: 130, f_diff_start: 5.0, f_diff_end: 3.0, amp: 0.3, mode: "binaural" },
      { label: "High Gamma", f_base: 500, f_diff_start: 48.0, f_diff_end: 48.0, amp: 0.05, mode: "isochronal" },
      { label: "Beta Bridge", f_base: 250, f_diff_start: 14.0, f_diff_end: 14.0, amp: 0.1, mode: "binaural" },
    ],
    noise: 0.25, phases: "Deep Dive",
  },
  Custom: {
    description: "Your own configuration",
    layers: [
      { label: "Layer 1", f_base: 100, f_diff_start: 8.0, f_diff_end: 4.0, amp: 0.4, mode: "binaural" },
      { label: "Layer 2", f_base: 200, f_diff_start: 10.0, f_diff_end: 10.0, amp: 0.3, mode: "binaural" },
    ],
    noise: 0.15, phases: "Steady State",
  },
};

const FADE_TIME = 4;
const BAND_LABELS = [
  { name: "\u03b4 Delta", range: "0.5\u20134 Hz", color: "#7B2F8C" },
  { name: "\u03b8 Theta", range: "4\u20138 Hz", color: "#4F6DB5" },
  { name: "\u03b1 Alpha", range: "8\u201313 Hz", color: "#21908C" },
  { name: "\u03b2 Beta", range: "13\u201330 Hz", color: "#5DC863" },
  { name: "\u03b3 Gamma", range: "30\u2013100 Hz", color: "#FDE725" },
];

function getBandColor(f) { return f <= 4 ? "#7B2F8C" : f <= 8 ? "#4F6DB5" : f <= 13 ? "#21908C" : f <= 30 ? "#5DC863" : "#FDE725"; }
function getBandName(f) { return f <= 4 ? "Delta" : f <= 8 ? "Theta" : f <= 13 ? "Alpha" : f <= 30 ? "Beta" : "Gamma"; }
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`; }

// ─── Phase Progress Bar ───
function PhaseBar({ phases, elapsed, totalDuration }) {
  if (!phases || phases.length <= 1) return null;
  const progress = totalDuration > 0 ? Math.min(elapsed / totalDuration, 1) : 0;
  let cumPct = 0;
  const colors = ["rgba(68,1,84,0.5)","rgba(59,82,139,0.5)","rgba(33,144,140,0.5)","rgba(93,200,99,0.5)"];
  return (
    <div style={{ marginTop: 10 }}>
      <div role="progressbar" aria-label="Session phase progress" aria-valuenow={Math.round(progress*100)} aria-valuemin={0} aria-valuemax={100}
        style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 28,
        background: "rgba(0,0,4,0.6)", border: "1px solid rgba(59,82,139,0.1)" }}>
        {phases.map((p, i) => {
          const start = cumPct; cumPct += p.pct;
          const active = progress >= start && progress < cumPct;
          const localP = active ? (progress - start) / p.pct : progress >= cumPct ? 1 : 0;
          return (
            <div key={i} style={{ width: `${p.pct*100}%`, position: "relative",
              borderRight: i < phases.length-1 ? "1px solid rgba(0,0,4,0.8)" : "none", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: colors[i%colors.length],
                width: `${localP*100}%`, transition: "width 0.5s linear" }} />
              <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center",
                justifyContent: "center", height: "100%", fontSize: 9, letterSpacing: "0.06em",
                fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase",
                color: active ? "#e2e0f0" : "rgba(33,144,140,0.6)", fontWeight: active ? 600 : 400 }}>
                {p.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Waveform Canvas ───
function WaveCanvas({ analyserRef, isPlaying }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); const W = canvas.width; const H = canvas.height;
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,4,0.25)"; ctx.fillRect(0,0,W,H);
      if (analyserRef.current && isPlaying) {
        const data = analyserRef.current.getValue(); const len = data.length;
        ctx.beginPath(); ctx.strokeStyle = "rgba(59,82,139,0.6)"; ctx.lineWidth = 1.5;
        for (let i=0;i<len;i++){const x=(i/len)*W,y=H/2+data[i]*H*0.45;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
        ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = "rgba(68,1,84,0.35)"; ctx.lineWidth = 1;
        for (let i=0;i<len;i++){const x=(i/len)*W,y=H/2+data[i]*H*0.35;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.strokeStyle="rgba(59,82,139,0.15)"; ctx.lineWidth=1;
        ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(animRef.current);
  }, [analyserRef, isPlaying]);
  return <canvas ref={canvasRef} width={600} height={120} style={{ width:"100%",height:120,borderRadius:8,
    background:"rgba(0,0,4,0.8)",border:"1px solid rgba(59,82,139,0.15)" }} />;
}

// ─── Timer Ring ───
function TimerDisplay({ elapsed, duration }) {
  const C = 2*Math.PI*52; const progress = duration>0?Math.min(elapsed/duration,1):0;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label={`Session timer: ${fmt(elapsed)} of ${fmt(duration)}`}>
      <circle cx="65" cy="65" r="52" fill="none" stroke="rgba(59,82,139,0.1)" strokeWidth="3"/>
      <circle cx="65" cy="65" r="52" fill="none" stroke="url(#tG)" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-progress)}
        transform="rotate(-90 65 65)" style={{transition:"stroke-dashoffset 1s linear"}}/>
      <defs><linearGradient id="tG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3B528B"/><stop offset="100%" stopColor="#440154"/>
      </linearGradient></defs>
      <text x="65" y="62" textAnchor="middle" dominantBaseline="middle" fill="#e2e0f0"
        fontSize="20" fontFamily="'JetBrains Mono','SF Mono',monospace" fontWeight="300">{fmt(elapsed)}</text>
      <text x="65" y="82" textAnchor="middle" fill="rgba(33,144,140,0.75)"
        fontSize="10" fontFamily="'JetBrains Mono',monospace">/ {fmt(duration)}</text>
    </svg>
  );
}

// ─── Styles ───
const sLabel = { fontSize:11,color:"rgba(33,144,140,0.8)",textTransform:"uppercase",
  letterSpacing:"0.08em",display:"block",marginBottom:2,fontFamily:"'JetBrains Mono',monospace" };
const sVal = { fontSize:12,color:"rgba(200,190,230,0.85)",fontFamily:"'JetBrains Mono',monospace",display:"block",marginTop:1 };
const sSlider = { width:"100%",height:3,appearance:"auto",accentColor:"#3B528B",cursor:"pointer" };

// ─── Layer Row ───
function LayerRow({ layer, index, onChange, onRemove, isPlaying, currentDiff }) {
  const dd = currentDiff ?? layer.f_diff_start;
  const bc = getBandColor(dd), bn = getBandName(dd);
  const hasRamp = Math.abs(layer.f_diff_start - layer.f_diff_end) > 0.1;
  const iso = layer.mode === "isochronal";
  return (
    <div style={{ background:"rgba(11,9,36,0.7)",border:`1px solid ${bc}22`,borderRadius:10,padding:"12px 14px",
      display:"flex",flexDirection:"column",gap:8 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:bc,
            boxShadow:isPlaying?`0 0 8px ${bc}`:"none" }}/>
          <input type="text" value={layer.label} onChange={(e)=>onChange({...layer,label:e.target.value})}
            style={{ background:"transparent",border:"none",color:"#d4d0ec",fontSize:13,
              fontFamily:"'JetBrains Mono',monospace",fontWeight:500,width:140,outline:"none" }}/>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
          <button onClick={()=>onChange({...layer,mode:iso?"binaural":"isochronal"})}
            aria-pressed={iso} aria-label={`Mode: ${iso?"isochronal":"binaural"}`} style={{
            fontSize:10,padding:"4px 10px",borderRadius:5,cursor:"pointer",minHeight:32,
            fontFamily:"'JetBrains Mono',monospace",border:"1px solid",
            background:iso?"rgba(211,67,110,0.12)":"rgba(68,1,84,0.12)",
            borderColor:iso?"rgba(211,67,110,0.3)":"rgba(68,1,84,0.2)",
            color:iso?"#F8765C":"#7AD5D6" }}>{iso?"ISO":"BIN"}</button>
          <span style={{ fontSize:10,color:bc,background:`${bc}15`,padding:"2px 8px",borderRadius:6,
            fontFamily:"'JetBrains Mono',monospace" }}>{bn} · {dd.toFixed(1)} Hz</span>
          <button onClick={onRemove} aria-label={`Remove ${layer.label}`} style={{ background:"transparent",border:"none",
            color:"rgba(200,180,220,0.5)",cursor:"pointer",fontSize:18,padding:"8px 10px",lineHeight:1,minWidth:44,minHeight:44,
            display:"flex",alignItems:"center",justifyContent:"center" }}>&times;</button>
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
        <div><label style={sLabel}>Carrier</label>
          <input type="range" min={40} max={600} step={1} value={layer.f_base}
            aria-label={`${layer.label} carrier frequency`}
            onChange={(e)=>onChange({...layer,f_base:+e.target.value})} style={sSlider}/>
          <span style={sVal}>{layer.f_base} Hz</span></div>
        <div><label style={sLabel}>Volume</label>
          <input type="range" min={0} max={100} step={1} value={Math.round(layer.amp*100)}
            aria-label={`${layer.label} volume`}
            onChange={(e)=>onChange({...layer,amp:+e.target.value/100})} style={sSlider}/>
          <span style={sVal}>{Math.round(layer.amp*100)}%</span></div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
        <div><label style={sLabel}>Beat \u0394f Start</label>
          <input type="range" min={0.3} max={60} step={0.1} value={layer.f_diff_start}
            aria-label={`${layer.label} beat frequency start`}
            onChange={(e)=>onChange({...layer,f_diff_start:+e.target.value})} style={sSlider}/>
          <span style={sVal}>{layer.f_diff_start.toFixed(1)} Hz</span></div>
        <div><label style={sLabel}>Beat \u0394f End {hasRamp && <span style={{color:"#21908C"}}>\u2198</span>}</label>
          <input type="range" min={0.3} max={60} step={0.1} value={layer.f_diff_end}
            aria-label={`${layer.label} beat frequency end`}
            onChange={(e)=>onChange({...layer,f_diff_end:+e.target.value})} style={sSlider}/>
          <span style={sVal}>{layer.f_diff_end.toFixed(1)} Hz</span></div>
      </div>
    </div>
  );
}

// ─── Main ───
export default function GatewaySession() {
  const [preset, setPreset] = useState("Focus 10");
  const [layers, setLayers] = useState(PRESETS["Focus 10"].layers.map(l=>({...l})));
  const [noiseLevel, setNoiseLevel] = useState(PRESETS["Focus 10"].noise);
  const [globalVol, setGlobalVol] = useState(75);
  const [duration, setDuration] = useState(15);
  const [phaseName, setPhaseName] = useState("Classic Gateway");
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
  const totalSec = duration * 60;

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

  const loadPreset = (name) => {
    setPreset(name); const p = PRESETS[name];
    setLayers(p.layers.map(l=>({...l}))); setNoiseLevel(p.noise);
    if (p.phases) setPhaseName(p.phases);
  };
  const updateLayer = (i,u) => setLayers(prev=>prev.map((l,j)=>j===i?u:l));
  const removeLayer = (i) => { if(layers.length>1) setLayers(prev=>prev.filter((_,j)=>j!==i)); };
  const addLayer = () => { if(layers.length>=6) return; setLayers(prev=>[...prev,
    {label:`Layer ${prev.length+1}`,f_base:200,f_diff_start:6.0,f_diff_end:6.0,amp:0.2,mode:"binaural"}]); };

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

  return (
    <div style={{ minHeight:"100vh",background:"linear-gradient(165deg,#000004 0%,#0B0924 40%,#140E36 100%)",
      color:"#e2e0f0",fontFamily:"'Instrument Sans','DM Sans',system-ui,sans-serif",
      padding:"32px 20px",display:"flex",justifyContent:"center" }}>
      <div style={{ width:"100%",maxWidth:560 }}>

        {/* Header */}
        <div style={{ marginBottom:24,textAlign:"center" }}>
          <h1 style={{ fontSize:15,fontWeight:300,letterSpacing:"0.35em",textTransform:"uppercase",
            color:"rgba(33,144,140,0.7)",margin:0 }}>Gateway Session</h1>
          <p style={{ fontSize:11,color:"rgba(33,144,140,0.7)",marginTop:6,
            fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.05em" }}>
            Binaural &middot; Isochronal &middot; Phase Scripting &middot; Stereo Headphones Required</p>
        </div>

        <WaveCanvas analyserRef={analyserRef} isPlaying={isPlaying}/>
        <PhaseBar phases={phases} elapsed={elapsed} totalDuration={totalSec}/>

        {/* Timer + Controls */}
        <div style={{ marginTop:16,display:"flex",flexDirection:"column",alignItems:"center",gap:14 }}>
          <TimerDisplay elapsed={elapsed} duration={totalSec}/>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"center" }}>
            <button onClick={isPlaying?stopSession:startSession} style={{
              background:isPlaying?"rgba(239,68,68,0.15)":"rgba(59,82,139,0.15)",
              border:`1px solid ${isPlaying?"rgba(239,68,68,0.3)":"rgba(59,82,139,0.3)"}`,
              color:isPlaying?"#fca5a5":"#5DC863",borderRadius:10,padding:"10px 28px",fontSize:13,
              fontFamily:"'JetBrains Mono',monospace",fontWeight:500,cursor:"pointer",
              letterSpacing:"0.1em",textTransform:"uppercase",transition:"all 0.3s" }}>
              {isPlaying?"\u25FC Stop":"\u25B6 Begin"}</button>
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <label style={{...sLabel,marginBottom:0}}>Duration</label>
              <select value={duration} onChange={e=>setDuration(+e.target.value)} disabled={isPlaying}
                style={{ background:"rgba(11,9,36,0.8)",border:"1px solid rgba(59,82,139,0.15)",
                  color:"#5DC863",borderRadius:6,padding:"10px 10px",fontSize:12,minHeight:44,
                  fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>
                {[5,10,15,20,30,45,60].map(m=><option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <label style={{...sLabel,marginBottom:0}}>Phases</label>
              <select value={phaseName} onChange={e=>setPhaseName(e.target.value)} disabled={isPlaying}
                style={{ background:"rgba(11,9,36,0.8)",border:"1px solid rgba(59,82,139,0.15)",
                  color:"#5DC863",borderRadius:6,padding:"10px 10px",fontSize:12,minHeight:44,
                  fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>
                {Object.keys(PHASE_TEMPLATES).map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Global Volume */}
        <div style={{ marginTop:20,background:"rgba(11,9,36,0.5)",border:"1px solid rgba(59,82,139,0.1)",
          borderRadius:10,padding:"10px 14px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(33,144,140,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {globalVol > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                {globalVol > 40 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}
              </svg>
              <span style={{ fontSize:12,fontFamily:"'JetBrains Mono',monospace",color:"#5DC863",fontWeight:500 }}>
                Master Volume</span>
            </div>
            <span style={sVal}>{globalVol}%</span>
          </div>
          <input type="range" min={0} max={100} step={1} value={globalVol}
            aria-label="Master volume"
            onChange={e=>setGlobalVol(+e.target.value)} style={{...sSlider,marginTop:6}}/>
        </div>

        {/* Presets */}
        <div style={{ marginTop:20 }}>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center" }}>
            {Object.keys(PRESETS).map(name=>(
              <button key={name} onClick={()=>loadPreset(name)} disabled={isPlaying}
                aria-pressed={preset===name} style={{
                background:preset===name?"rgba(59,82,139,0.2)":"rgba(11,9,36,0.5)",
                border:`1px solid ${preset===name?"rgba(59,82,139,0.4)":"rgba(59,82,139,0.1)"}`,
                color:preset===name?"#5DC863":"rgba(200,190,230,0.7)",borderRadius:8,padding:"10px 16px",
                fontSize:11,fontFamily:"'JetBrains Mono',monospace",minHeight:44,
                cursor:isPlaying?"not-allowed":"pointer",transition:"all 0.2s",
                opacity:isPlaying?0.5:1 }}>{name}</button>
            ))}
          </div>
          {preset && <p style={{ textAlign:"center",fontSize:11,color:"rgba(33,144,140,0.7)",
            marginTop:6,fontStyle:"italic" }}>{PRESETS[preset]?.description}</p>}
        </div>

        {/* Band Legend */}
        <div style={{ display:"flex",justifyContent:"center",gap:12,marginTop:16,flexWrap:"wrap" }}>
          {BAND_LABELS.map(b=>(
            <div key={b.name} style={{ display:"flex",alignItems:"center",gap:4 }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:b.color }}/>
              <span style={{ fontSize:10,color:"rgba(200,190,230,0.75)",fontFamily:"'JetBrains Mono',monospace" }}>
                {b.name} {b.range}</span>
            </div>
          ))}
          <span style={{ fontSize:10,color:"rgba(200,190,230,0.65)",fontFamily:"'JetBrains Mono',monospace" }}>
            BIN = binaural &middot; ISO = isochronal</span>
        </div>

        {/* Layers */}
        <div style={{ marginTop:20,display:"flex",flexDirection:"column",gap:8 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:11,color:"rgba(33,144,140,0.8)",textTransform:"uppercase",
              letterSpacing:"0.1em",fontFamily:"'JetBrains Mono',monospace" }}>
              Entrainment Layers ({layers.length})</span>
            <button onClick={addLayer} disabled={layers.length>=6||isPlaying} style={{
              background:"transparent",border:"1px solid rgba(59,82,139,0.2)",
              color:"rgba(33,144,140,0.8)",borderRadius:6,padding:"8px 14px",fontSize:11,minHeight:44,
              cursor:layers.length>=6||isPlaying?"not-allowed":"pointer",
              fontFamily:"'JetBrains Mono',monospace",
              opacity:layers.length>=6||isPlaying?0.3:1 }}>+ Add</button>
          </div>
          {layers.map((l,i)=>(
            <LayerRow key={i} layer={l} index={i} onChange={u=>updateLayer(i,u)}
              onRemove={()=>removeLayer(i)} isPlaying={isPlaying} currentDiff={currentDiffs[i]}/>
          ))}
        </div>

        {/* Pink Noise */}
        <div style={{ marginTop:12,background:"rgba(11,9,36,0.7)",border:"1px solid rgba(59,82,139,0.1)",
          borderRadius:10,padding:"12px 14px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:"rgba(211,67,110,0.6)",
                boxShadow:isPlaying?"0 0 8px rgba(211,67,110,0.3)":"none" }}/>
              <span style={{ fontSize:13,fontFamily:"'JetBrains Mono',monospace",color:"#d4d0ec",fontWeight:500 }}>
                Pink Noise</span>
            </div>
            <span style={sVal}>{Math.round(noiseLevel*100)}%</span>
          </div>
          <input type="range" min={0} max={50} step={1} value={Math.round(noiseLevel*100)}
            aria-label="Pink noise level"
            onChange={e=>setNoiseLevel(+e.target.value/100)} style={{...sSlider,marginTop:8}}/>
        </div>

        <p style={{ textAlign:"center",fontSize:10,color:"rgba(33,144,140,0.5)",marginTop:28,
          fontFamily:"'JetBrains Mono',monospace" }}>
          Web Audio API &middot; Phase-modulated frequency ramping &middot; All parameters live-adjustable</p>
      </div>
    </div>
  );
}
