import { getBandColor, getBandName, fmt } from "./utils";
import { BAND_RANGE } from "./constants";

// ─── Phase Progress Bar ───
export function PhaseBar({ phases, elapsed, totalDuration }) {
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
              <span style={{ position: "relative", zIndex: 1, display: "block", textAlign: "center",
                lineHeight: "28px", fontSize: 9, letterSpacing: "0.06em",
                fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase",
                color: active ? "#e2e0f0" : "rgba(53,176,171,0.7)", fontWeight: active ? 600 : 400,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 2px" }}>
                {p.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timer Ring ───
export function TimerDisplay({ elapsed, duration }) {
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
      <text x="65" y="82" textAnchor="middle" fill="#35b0ab"
        fontSize="10" fontFamily="'JetBrains Mono',monospace">/ {fmt(duration)}</text>
    </svg>
  );
}

// ─── Styles ───
const sLabel = { fontSize:11,color:"#35b0ab",textTransform:"uppercase",
  letterSpacing:"0.08em",display:"block",marginBottom:2,fontFamily:"'JetBrains Mono',monospace" };
const sVal = { fontSize:12,color:"#c8bee6",fontFamily:"'JetBrains Mono',monospace",display:"block",marginTop:1 };
const sSlider = { width:"100%",height:3,appearance:"auto",accentColor:"#3B528B",cursor:"pointer" };

// ─── Layer Row ───
export function LayerRow({ layer, index, onChange, onRemove, isPlaying, currentDiff, compact }) {
  const dd = currentDiff ?? layer.f_diff_start;
  const bc = getBandColor(dd), bn = getBandName(dd);
  const hasRamp = Math.abs(layer.f_diff_start - layer.f_diff_end) > 0.1;
  const iso = layer.mode === "isochronal";
  // Band-capped ranges: preset layers have layer.band, custom layers don't
  const range = layer.band ? BAND_RANGE[layer.band] : null;
  const dfMin = range ? range[0] : 0.3;
  const dfMax = range ? range[1] : 100;
  const actualMin = layer.f_base + dfMin;
  const actualMax = range ? layer.f_base + dfMax : 660;
  const gGap = compact ? 6 : 10;
  return (
    <div style={{ background:"rgba(11,9,36,0.7)",border:`1px solid ${bc}22`,borderRadius:10,
      padding:compact?"8px 10px":"12px 14px",display:"flex",flexDirection:"column",gap:compact?4:8 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:bc,
            boxShadow:isPlaying?`0 0 8px ${bc}`:"none" }}/>
          <input type="text" value={layer.label} maxLength={40} onChange={(e)=>onChange({...layer,label:e.target.value})}
            style={{ background:"transparent",border:"none",borderBottom:"1px solid rgba(59,82,139,0.2)",color:"#d4d0ec",fontSize:compact?12:13,
              fontFamily:"'JetBrains Mono',monospace",fontWeight:500,width:compact?100:140 }}/>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:compact?4:6 }}>
          <button onClick={()=>onChange({...layer,mode:iso?"binaural":"isochronal"})}
            role="switch" aria-checked={iso} aria-label="Isochronal mode" style={{
            fontSize:10,padding:compact?"2px 8px":"4px 10px",borderRadius:5,cursor:"pointer",minHeight:compact?28:32,
            fontFamily:"'JetBrains Mono',monospace",border:"1px solid",
            background:iso?"rgba(211,67,110,0.12)":"rgba(68,1,84,0.12)",
            borderColor:iso?"rgba(211,67,110,0.3)":"rgba(68,1,84,0.2)",
            color:iso?"#F8765C":"#7AD5D6" }}>{iso?"ISO":"BIN"}</button>
          <span style={{ fontSize:compact?9:10,color:bc,background:`${bc}15`,padding:"2px 6px",borderRadius:6,
            fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap" }}>{bn} · {dd.toFixed(1)} Hz{range ? ` [${range[0]}–${range[1]}]` : ""}</span>
          <button onClick={onRemove} aria-label={`Remove ${layer.label}`} style={{ background:"transparent",border:"none",
            color:"rgba(200,180,220,0.5)",cursor:"pointer",fontSize:compact?16:18,padding:compact?"4px 6px":"8px 10px",
            lineHeight:1,minWidth:compact?32:44,minHeight:compact?32:44,
            display:"flex",alignItems:"center",justifyContent:"center" }}>&times;</button>
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:gGap }}>
        <div><span style={sLabel}>Carrier (L)</span>
          <input type="range" min={0} max={600} step={1} value={layer.f_base}
            aria-label={`${layer.label} carrier frequency`}
            onChange={(e)=>onChange({...layer,f_base:+e.target.value})} style={sSlider}/>
          <span style={sVal}>{layer.f_base} Hz</span></div>
        <div><span style={sLabel}>Actual (R)</span>
          <input type="range" min={actualMin} max={actualMax} step={0.1} value={layer.f_base + dd}
            aria-label={`${layer.label} actual right-ear frequency`}
            onChange={(e)=>{
              const actual = +e.target.value;
              const newDiff = Math.max(dfMin, Math.min(dfMax, actual - layer.f_base));
              onChange({...layer, f_diff_start: newDiff, f_diff_end: hasRamp ? layer.f_diff_end : newDiff});
            }} style={sSlider}/>
          <span style={sVal}>{(layer.f_base + dd).toFixed(1)} Hz</span></div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:gGap }}>
        <div><span style={sLabel}>Volume</span>
          <input type="range" min={0} max={100} step={1} value={Math.round(layer.amp*100)}
            aria-label={`${layer.label} volume`}
            onChange={(e)=>onChange({...layer,amp:+e.target.value/100})} style={sSlider}/>
          <span style={sVal}>{Math.round(layer.amp*100)}%</span></div>
        <div><span style={sLabel}>Beat Δf {hasRamp ? "Start" : ""}</span>
          <input type="range" min={dfMin} max={dfMax} step={0.1} value={layer.f_diff_start}
            aria-label={`${layer.label} beat frequency start`}
            onChange={(e)=>onChange({...layer,f_diff_start:+e.target.value})} style={sSlider}/>
          <span style={sVal}>{layer.f_diff_start.toFixed(1)} Hz</span></div>
      </div>
      {hasRamp && <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:gGap }}>
        <div/>
        <div><span style={sLabel}>Beat Δf End <span style={{color:"#21908C"}}>↘</span></span>
          <input type="range" min={dfMin} max={dfMax} step={0.1} value={layer.f_diff_end}
            aria-label={`${layer.label} beat frequency end`}
            onChange={(e)=>onChange({...layer,f_diff_end:+e.target.value})} style={sSlider}/>
          <span style={sVal}>{layer.f_diff_end.toFixed(1)} Hz</span></div>
      </div>}
    </div>
  );
}
