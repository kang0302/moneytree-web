// 모멘텀 점수 분포 진단: 전 테마, 기간별 momentumScore 히스토그램 + 포화(=1000) 비율.
import fs from "fs";
import path from "path";
import { computeThemeBarometer } from "./barometer_core.mjs";

const ROOT = process.cwd();
const DATA_ROOT = fs.existsSync(path.join(ROOT, "import_MT", "data", "theme"))
  ? path.join(ROOT, "import_MT", "data") : path.join(ROOT, "data");
const THEME_DIR = path.join(DATA_ROOT, "theme");
const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));

const PERIODS = ["5D","1M","YTD","1Y"];
const themes = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(THEME_DIR,f),"utf8")); } catch { return null; } }).filter(Boolean);

function stats(arr) {
  const s = [...arr].sort((a,b)=>a-b); const n=s.length;
  const q=(p)=>s[Math.min(n-1,Math.floor(p*n))];
  const mean=arr.reduce((a,b)=>a+b,0)/n;
  return { n, min:s[0], p10:q(0.1), p25:q(0.25), median:q(0.5), p75:q(0.75), p90:q(0.9), max:s[n-1], mean:Math.round(mean) };
}
function hist(arr, edges){ // count per bucket
  const c = new Array(edges.length-1).fill(0);
  for (const v of arr) for (let i=0;i<edges.length-1;i++){ if (v>=edges[i] && (v<edges[i+1] || (i===edges.length-2 && v<=edges[i+1]))){ c[i]++; break; } }
  return c;
}
const buckets=[0,100,200,300,400,500,600,700,800,900,1000,1001];

for (const p of PERIODS){
  const mom=[], ov=[], hl=[];
  for (const d of themes){
    const r=computeThemeBarometer({nodes:d.nodes,edges:d.edges,period:p});
    if(!r.ok) continue;
    mom.push(r.momentumScore); ov.push(r.overallScore); hl.push(r.healthScore);
  }
  if(!mom.length){ console.log(`\n=== ${p}: no data ===`); continue; }
  const sat=mom.filter(x=>x>=1000).length;
  const ge900=mom.filter(x=>x>=900).length;
  console.log(`\n=== ${p} (n=${mom.length}) ===`);
  console.log("momentum   :", JSON.stringify(stats(mom)));
  console.log(`  =1000 포화: ${sat} (${(sat/mom.length*100).toFixed(1)}%) | >=900: ${ge900} (${(ge900/mom.length*100).toFixed(1)}%)`);
  console.log("  hist[0,100,...,1000,>1000]:", hist(mom,buckets).join(","));
  console.log("health     :", JSON.stringify(stats(hl)));
  console.log("overall    :", JSON.stringify(stats(ov)));
}
