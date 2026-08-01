// 모멘텀 재설계 시뮬레이션: 현행 vs 대안 공식 분포 비교(비파괴, 진단 전용).
import fs from "fs";
import path from "path";
import { computeThemeBarometer } from "./barometer_core.mjs";

const ROOT = process.cwd();
const DATA_ROOT = fs.existsSync(path.join(ROOT, "import_MT", "data", "theme"))
  ? path.join(ROOT, "import_MT", "data") : path.join(ROOT, "data");
const THEME_DIR = path.join(DATA_ROOT, "theme");
const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
const themes = files.map((f)=>{try{return JSON.parse(fs.readFileSync(path.join(THEME_DIR,f),"utf8"));}catch{return null;}}).filter(Boolean);

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const RETSAT={ "7D":9,"1M":16.7,"YTD":30,"1Y":50 };

// 후보 스코어 함수(입력: 상위바스켓 수익률 pct, retSat)
const F = {
  current:   (r,s)=> clamp(500 + r*(500/s), 0, 1000),
  anchorx2:  (r,s)=> clamp(500 + r*(500/(s*2.2)), 0, 1000),        // 앵커 상향(선형)
  tanh:      (r,s)=> clamp(500 + 500*Math.tanh(r/(s*1.6)), 0, 1000), // 로지스틱(무한포화 없음)
  tanh_wide: (r,s)=> clamp(500 + 500*Math.tanh(r/(s*2.2)), 0, 1000),
};

function stats(arr){const s=[...arr].sort((a,b)=>a-b);const n=s.length;const q=p=>s[Math.min(n-1,Math.floor(p*n))];
  return {n,min:s[0],p10:q(.1),p25:q(.25),med:q(.5),p75:q(.75),p90:q(.9),max:s[n-1],mean:Math.round(arr.reduce((a,b)=>a+b,0)/n)};}

for (const p of ["7D","1M","YTD","1Y"]){
  const raw=[];
  for (const d of themes){ const r=computeThemeBarometer({nodes:d.nodes,edges:d.edges,period:p}); if(r.ok) raw.push(r.momentumTopPct); }
  console.log(`\n===== ${p} (n=${raw.length}, retSat=${RETSAT[p]}) =====`);
  console.log(`상위바스켓 수익률 pct 분포:`, JSON.stringify(stats(raw)));
  for (const [name,fn] of Object.entries(F)){
    const sc=raw.map(r=>fn(r,RETSAT[p]));
    const sat=sc.filter(x=>x>=1000).length, ge900=sc.filter(x=>x>=900).length;
    const st=stats(sc);
    console.log(`  ${name.padEnd(10)} med=${st.med} mean=${st.mean} [p10=${st.p10} p90=${st.p90}] =1000:${(sat/sc.length*100).toFixed(1)}% >=900:${(ge900/sc.length*100).toFixed(1)}%`);
  }
}
