import { useState, useEffect } from "react";
import { PRESETS, PHASE_TEMPLATES, BAND_LABELS } from "./constants";
import { useAudioEngine } from "./useAudioEngine";
import FractalBeatCanvas from "./FractalBeatCanvas";
import { PhaseBar, TimerDisplay, LayerRow } from "./components";

const sLabel = { fontSize:11,color:"rgba(33,144,140,0.8)",textTransform:"uppercase",
  letterSpacing:"0.08em",display:"block",marginBottom:2,fontFamily:"'JetBrains Mono',monospace" };
const sVal = { fontSize:12,color:"rgba(200,190,230,0.85)",fontFamily:"'JetBrains Mono',monospace",display:"block",marginTop:1 };
const sSlider = { width:"100%",height:3,appearance:"auto",accentColor:"#3B528B",cursor:"pointer" };

export default function GatewaySession() {
  const [preset, setPreset] = useState("Focus 10");
  const [layers, setLayers] = useState(PRESETS["Focus 10"].layers.map(l=>({...l})));
  const [noiseLevel, setNoiseLevel] = useState(PRESETS["Focus 10"].noise);
  const [globalVol, setGlobalVol] = useState(75);
  const [duration, setDuration] = useState(15);
  const [phaseName, setPhaseName] = useState("Classic Gateway");
  const [zenMode, setZenMode] = useState(false);
  const [tallVp, setTallVp] = useState(() => window.innerHeight >= 768);
  useEffect(() => {
    const mq = window.matchMedia('(min-height: 768px)');
    const h = (e) => setTallVp(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const { isPlaying, elapsed, currentDiffs, analyserRef, noiseAnalyserRef, startSession, stopSession } =
    useAudioEngine({ layers, noiseLevel, globalVol, duration, phaseName });

  const phases = PHASE_TEMPLATES[phaseName] || PHASE_TEMPLATES["Steady State"];
  const totalSec = duration * 60;

  const loadPreset = (name) => {
    setPreset(name); const p = PRESETS[name];
    setLayers(p.layers.map(l=>({...l}))); setNoiseLevel(p.noise);
    if (p.phases) setPhaseName(p.phases);
  };
  const updateLayer = (i,u) => setLayers(prev=>prev.map((l,j)=>j===i?u:l));
  const removeLayer = (i) => { if(layers.length>1) setLayers(prev=>prev.filter((_,j)=>j!==i)); };
  const addLayer = () => { if(layers.length>=6) return; setLayers(prev=>[...prev,
    {label:`Layer ${prev.length+1}`,f_base:200,f_diff_start:6.0,f_diff_end:6.0,amp:0.2,mode:"binaural"}]); };

  return (
    <div style={{ ...(tallVp?{height:"100vh",overflow:"hidden"}:{minHeight:"100vh"}),
      background:"linear-gradient(165deg,#000004 0%,#0B0924 40%,#140E36 100%)",
      color:"#e2e0f0",fontFamily:"'Instrument Sans','DM Sans',system-ui,sans-serif",
      padding:"32px 20px",display:"flex",justifyContent:"center" }}>
      <div style={{ width:"100%",maxWidth:560,...(tallVp?{display:"flex",flexDirection:"column"}:{}) }}>

        {/* Header */}
        <div style={{ marginBottom:24,textAlign:"center" }}>
          <h1 style={{ fontSize:15,fontWeight:300,letterSpacing:"0.35em",textTransform:"uppercase",
            color:"rgba(33,144,140,0.7)",margin:0 }}>Gateway Session</h1>
          <p style={{ fontSize:11,color:"rgba(33,144,140,0.7)",marginTop:6,
            fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.05em" }}>
            Binaural &middot; Isochronal &middot; Phase Scripting &middot; Stereo Headphones Required</p>
        </div>

        <FractalBeatCanvas analyserRef={analyserRef} noiseAnalyserRef={noiseAnalyserRef}
          isPlaying={isPlaying} currentDiffs={currentDiffs} layers={layers} elapsed={elapsed}
          zenMode={zenMode} onToggleZen={()=>setZenMode(z=>!z)} />
        <PhaseBar phases={phases} elapsed={elapsed} totalDuration={totalSec}/>

        <div className="controls-scroll" style={tallVp?{flex:1,minHeight:0,overflowY:"auto"}:undefined}>

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
              {isPlaying?"◼ Stop":"▶ Begin"}</button>
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
    </div>
  );
}
