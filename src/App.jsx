import { useState, useEffect } from "react";
import { PRESETS, PHASE_TEMPLATES, BAND_LABELS } from "./constants";
import { useAudioEngine } from "./useAudioEngine";
import FractalBeatCanvas from "./FractalBeatCanvas";
import ThreeVisualizer from "./ThreeVisualizer";
import { PhaseBar, TimerDisplay, LayerRow } from "./components";

const sLabel = { fontSize:11,color:"#35b0ab",textTransform:"uppercase",
  letterSpacing:"0.08em",display:"block",marginBottom:2,fontFamily:"'JetBrains Mono',monospace" };
const sVal = { fontSize:12,color:"#c8bee6",fontFamily:"'JetBrains Mono',monospace",display:"block",marginTop:1 };
const sSlider = { width:"100%",height:3,appearance:"auto",accentColor:"#3B528B",cursor:"pointer" };

export default function GatewaySession() {
  const [preset, setPreset] = useState("Focus 10");
  const [layers, setLayers] = useState(PRESETS["Focus 10"].layers.map(l=>({...l})));
  const [noiseLevel, setNoiseLevel] = useState(PRESETS["Focus 10"].noise);
  const [globalVol, setGlobalVol] = useState(75);
  const [duration, setDuration] = useState(15);
  const [phaseName, setPhaseName] = useState("Classic Gateway");
  const [zenMode, setZenMode] = useState(false);
  const [desktop, setDesktop] = useState(() => window.innerHeight >= 768 && window.innerWidth >= 768);
  useEffect(() => {
    const mq = window.matchMedia('(min-height: 768px) and (min-width: 768px)');
    const h = (e) => setDesktop(e.matches);
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
    <div style={{ ...(desktop?{height:"100vh",overflow:"hidden"}:{minHeight:"100vh"}),
      background:"linear-gradient(165deg,#000004 0%,#0B0924 40%,#140E36 100%)",
      color:"#e2e0f0",fontFamily:"'Instrument Sans','DM Sans',system-ui,sans-serif",
      padding:"32px 20px",display:"flex",justifyContent:"center" }}>
      <main style={{ width:"100%",maxWidth:desktop?1200:560,...(desktop?{display:"flex",flexDirection:"column"}:{}) }}>

        {/* Header */}
        <div style={{ marginBottom:desktop?10:24,textAlign:"center" }}>
          <h1 style={{ fontSize:15,fontWeight:400,letterSpacing:"0.35em",textTransform:"uppercase",
            color:"#35b0ab",margin:0 }}>Gateway Session</h1>
          <p style={{ fontSize:11,color:"rgba(53,176,171,0.85)",marginTop:6,
            fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.05em" }}>
            Binaural &middot; Isochronal &middot; Phase Scripting &middot; Stereo Headphones Required</p>
        </div>

        {/* ── Cockpit: Timer|Canvas|Controls on desktop ── */}
        {desktop ? (
          <div style={{display:"flex",gap:20,alignItems:"center",justifyContent:"center"}}>
            {/* Left — Timer + Volume (φ-symmetric: 310px max) */}
            <div style={{flex:"1 1 0",maxWidth:310,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <TimerDisplay elapsed={elapsed} duration={totalSec}/>
              <div style={{width:140,background:"rgba(11,9,36,0.5)",border:"1px solid rgba(59,82,139,0.1)",
                borderRadius:10,padding:"8px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(33,144,140,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      {globalVol > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                      {globalVol > 40 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}
                    </svg>
                    <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:"#5DC863",fontWeight:500}}>Vol</span>
                  </div>
                  <span style={sVal}>{globalVol}%</span>
                </div>
                <input type="range" min={0} max={100} step={1} value={globalVol}
                  aria-label="Master volume"
                  onChange={e=>setGlobalVol(+e.target.value)} style={{...sSlider,marginTop:4}}/>
              </div>
            </div>

            {/* Center — 3D Visualizer */}
            <div style={{flex:"0 0 auto"}}>
              <ThreeVisualizer layers={layers} currentDiffs={currentDiffs}
                isPlaying={isPlaying} noiseLevel={noiseLevel} size={360}
                onToggleZen={()=>setZenMode(z=>!z)} />
            </div>

            {/* Right — Controls + Presets (φ-symmetric: 310px max) */}
            <div style={{flex:"1 1 0",maxWidth:310,display:"flex",flexDirection:"column",gap:10,minWidth:0}}>
              <button onClick={isPlaying?stopSession:startSession} aria-label={isPlaying?"Stop session":"Begin session"} style={{
                background:isPlaying?"rgba(239,68,68,0.15)":"rgba(59,82,139,0.15)",
                border:`1px solid ${isPlaying?"rgba(239,68,68,0.3)":"rgba(59,82,139,0.3)"}`,
                color:isPlaying?"#fca5a5":"#5DC863",borderRadius:10,padding:"10px 28px",fontSize:13,
                fontFamily:"'JetBrains Mono',monospace",fontWeight:500,cursor:"pointer",
                letterSpacing:"0.1em",textTransform:"uppercase",transition:"all 0.3s",alignSelf:"flex-start" }}>
                {isPlaying?"◼ Stop":"▶ Begin"}</button>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <label htmlFor="dur-sel" style={{...sLabel,marginBottom:0}}>Duration</label>
                  <select id="dur-sel" value={duration} onChange={e=>setDuration(+e.target.value)} disabled={isPlaying}
                    style={{background:"rgba(11,9,36,0.8)",border:"1px solid rgba(59,82,139,0.15)",
                      color:"#5DC863",borderRadius:6,padding:"8px 10px",fontSize:12,minHeight:36,
                      fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}>
                    {[5,10,15,20,30,45,60].map(m=><option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <label htmlFor="phase-sel" style={{...sLabel,marginBottom:0}}>Phases</label>
                  <select id="phase-sel" value={phaseName} onChange={e=>setPhaseName(e.target.value)} disabled={isPlaying}
                    style={{background:"rgba(11,9,36,0.8)",border:"1px solid rgba(59,82,139,0.15)",
                      color:"#5DC863",borderRadius:6,padding:"8px 10px",fontSize:12,minHeight:36,
                      fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}>
                    {Object.keys(PHASE_TEMPLATES).map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Object.keys(PRESETS).map(name=>(
                  <button key={name} onClick={()=>loadPreset(name)} disabled={isPlaying}
                    aria-pressed={preset===name} style={{
                    background:preset===name?"rgba(59,82,139,0.2)":"rgba(11,9,36,0.5)",
                    border:`1px solid ${preset===name?"rgba(59,82,139,0.4)":"rgba(59,82,139,0.1)"}`,
                    color:preset===name?"#5DC863":"rgba(200,190,230,0.9)",borderRadius:8,padding:"6px 12px",
                    fontSize:11,fontFamily:"'JetBrains Mono',monospace",minHeight:32,
                    cursor:isPlaying?"not-allowed":"pointer",transition:"all 0.2s",
                    opacity:isPlaying?0.5:1 }}>{name}</button>
                ))}
              </div>
              {preset && <p style={{fontSize:11,color:"#35b0ab",fontStyle:"italic",margin:0}}>
                {PRESETS[preset]?.description}</p>}
            </div>
          </div>
        ) : (
          <FractalBeatCanvas analyserRef={analyserRef} noiseAnalyserRef={noiseAnalyserRef}
            isPlaying={isPlaying} currentDiffs={currentDiffs} layers={layers} elapsed={elapsed}
            zenMode={zenMode} onToggleZen={()=>setZenMode(z=>!z)} />
        )}

        {/* Zen mode overlay — 2D fullscreen canvas (desktop uses Three.js normally, zen uses 2D) */}
        {desktop && zenMode && (
          <FractalBeatCanvas analyserRef={analyserRef} noiseAnalyserRef={noiseAnalyserRef}
            isPlaying={isPlaying} currentDiffs={currentDiffs} layers={layers} elapsed={elapsed}
            zenMode={true} onToggleZen={()=>setZenMode(false)} />
        )}

        {/* PhaseBar — full width on desktop, below canvas on mobile */}
        <PhaseBar phases={phases} elapsed={elapsed} totalDuration={totalSec}/>

        {/* Mobile: Timer + Controls */}
        {!desktop && (
          <div style={{marginTop:16,display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
            <TimerDisplay elapsed={elapsed} duration={totalSec}/>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
              <button onClick={isPlaying?stopSession:startSession} aria-label={isPlaying?"Stop session":"Begin session"} style={{
                background:isPlaying?"rgba(239,68,68,0.15)":"rgba(59,82,139,0.15)",
                border:`1px solid ${isPlaying?"rgba(239,68,68,0.3)":"rgba(59,82,139,0.3)"}`,
                color:isPlaying?"#fca5a5":"#5DC863",borderRadius:10,padding:"10px 28px",fontSize:13,
                fontFamily:"'JetBrains Mono',monospace",fontWeight:500,cursor:"pointer",
                letterSpacing:"0.1em",textTransform:"uppercase",transition:"all 0.3s" }}>
                {isPlaying?"◼ Stop":"▶ Begin"}</button>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <label htmlFor="dur-sel-m" style={{...sLabel,marginBottom:0}}>Duration</label>
                <select id="dur-sel-m" value={duration} onChange={e=>setDuration(+e.target.value)} disabled={isPlaying}
                  style={{background:"rgba(11,9,36,0.8)",border:"1px solid rgba(59,82,139,0.15)",
                    color:"#5DC863",borderRadius:6,padding:"10px 10px",fontSize:12,minHeight:44,
                    fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}>
                  {[5,10,15,20,30,45,60].map(m=><option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <label htmlFor="phase-sel-m" style={{...sLabel,marginBottom:0}}>Phases</label>
                <select id="phase-sel-m" value={phaseName} onChange={e=>setPhaseName(e.target.value)} disabled={isPlaying}
                  style={{background:"rgba(11,9,36,0.8)",border:"1px solid rgba(59,82,139,0.15)",
                    color:"#5DC863",borderRadius:6,padding:"10px 10px",fontSize:12,minHeight:44,
                    fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}>
                  {Object.keys(PHASE_TEMPLATES).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Volume + Presets stacked on mobile ── */}
        {!desktop && <>
          <div style={{ marginTop:20,background:"rgba(11,9,36,0.5)",border:"1px solid rgba(59,82,139,0.1)",
            borderRadius:10,padding:"10px 14px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(33,144,140,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div style={{ marginTop:20 }}>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center" }}>
              {Object.keys(PRESETS).map(name=>(
                <button key={name} onClick={()=>loadPreset(name)} disabled={isPlaying}
                  aria-pressed={preset===name} style={{
                  background:preset===name?"rgba(59,82,139,0.2)":"rgba(11,9,36,0.5)",
                  border:`1px solid ${preset===name?"rgba(59,82,139,0.4)":"rgba(59,82,139,0.1)"}`,
                  color:preset===name?"#5DC863":"rgba(200,190,230,0.9)",borderRadius:8,padding:"10px 16px",
                  fontSize:11,fontFamily:"'JetBrains Mono',monospace",minHeight:44,
                  cursor:isPlaying?"not-allowed":"pointer",transition:"all 0.2s",
                  opacity:isPlaying?0.5:1 }}>{name}</button>
              ))}
            </div>
            {preset && <p style={{ textAlign:"center",fontSize:11,color:"#35b0ab",
              marginTop:6,fontStyle:"italic" }}>{PRESETS[preset]?.description}</p>}
          </div>
        </>}

        {/* Band Legend */}
        <div style={{ display:"flex",justifyContent:desktop?"flex-start":"center",gap:12,marginTop:desktop?8:16,flexWrap:"wrap" }}>
          {BAND_LABELS.map(b=>(
            <div key={b.name} style={{ display:"flex",alignItems:"center",gap:4 }}>
              <div aria-hidden="true" style={{ width:6,height:6,borderRadius:"50%",background:b.color }}/>
              <span style={{ fontSize:10,color:"rgba(200,190,230,0.75)",fontFamily:"'JetBrains Mono',monospace" }}>
                {b.name} {b.range}</span>
            </div>
          ))}
          <span style={{ fontSize:10,color:"rgba(200,190,230,0.8)",fontFamily:"'JetBrains Mono',monospace" }}>
            BIN = binaural &middot; ISO = isochronal</span>
        </div>

        {/* Layers + Pink Noise grid */}
        <div style={{ marginTop:desktop?8:20,display:"flex",flexDirection:"column",gap:8,
          ...(desktop?{flex:1,minHeight:0}:{}) }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:11,color:"#35b0ab",textTransform:"uppercase",
              letterSpacing:"0.1em",fontFamily:"'JetBrains Mono',monospace" }}>
              Entrainment Layers ({layers.length})</span>
            <button onClick={addLayer} disabled={layers.length>=6||isPlaying} style={{
              background:"transparent",border:"1px solid rgba(59,82,139,0.2)",
              color:"#35b0ab",borderRadius:6,padding:desktop?"4px 10px":"8px 14px",fontSize:11,
              minHeight:desktop?32:44,
              cursor:layers.length>=6||isPlaying?"not-allowed":"pointer",
              fontFamily:"'JetBrains Mono',monospace",
              opacity:layers.length>=6||isPlaying?0.3:1 }}>+ Add</button>
          </div>
          <div className={desktop?"controls-scroll":undefined} style={desktop
            ?{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,flex:1,minHeight:0,overflowY:"auto",alignContent:"start"}
            :{display:"flex",flexDirection:"column",gap:8}}>
            {layers.map((l,i)=>(
              <div key={i}>
                <LayerRow layer={l} index={i} onChange={u=>updateLayer(i,u)}
                  onRemove={()=>removeLayer(i)} isPlaying={isPlaying} currentDiff={currentDiffs[i]}
                  compact={desktop}/>
              </div>
            ))}
            {/* Pink Noise — inline in grid on desktop */}
            {desktop && (
              <div style={{ background:"rgba(11,9,36,0.7)",
                border:"1px solid rgba(59,82,139,0.1)",borderRadius:10,padding:"8px 10px",
                display:"flex",flexDirection:"column",justifyContent:"center" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <div style={{ width:8,height:8,borderRadius:"50%",background:"rgba(211,67,110,0.6)",
                      boxShadow:isPlaying?"0 0 8px rgba(211,67,110,0.3)":"none" }}/>
                    <span style={{ fontSize:12,fontFamily:"'JetBrains Mono',monospace",color:"#d4d0ec",fontWeight:500 }}>
                      Pink Noise</span>
                  </div>
                  <span style={sVal}>{Math.round(noiseLevel*100)}%</span>
                </div>
                <input type="range" min={0} max={50} step={1} value={Math.round(noiseLevel*100)}
                  aria-label="Pink noise level, maximum 50 percent"
                  onChange={e=>setNoiseLevel(+e.target.value/100)} style={{...sSlider,marginTop:6}}/>
              </div>
            )}
          </div>
        </div>

        {/* Pink Noise — separate on mobile */}
        {!desktop && (
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
              aria-label="Pink noise level, maximum 50 percent"
              onChange={e=>setNoiseLevel(+e.target.value/100)} style={{...sSlider,marginTop:8}}/>
          </div>
        )}

        <p style={{ textAlign:"center",fontSize:10,color:"rgba(53,176,171,0.65)",marginTop:desktop?8:28,
          fontFamily:"'JetBrains Mono',monospace" }}>
          Web Audio API &middot; Phase-modulated frequency ramping &middot; All parameters live-adjustable</p>
        <div role="status" aria-live="polite" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}>
          {isPlaying ? "Session started" : elapsed > 0 ? "Session stopped" : ""}
        </div>
      </main>
    </div>
  );
}
