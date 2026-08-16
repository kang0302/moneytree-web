# -*- coding: utf-8 -*-
import json, io, os, sys, math, bisect, re
from datetime import date
sys.stdout = io.TextIOWrapper(os.fdopen(os.dup(1), "wb"), encoding="utf-8")
# 로컬은 하드코딩, CI는 리포 루트(cwd). public/data/asset/index.json 있는 위치로 이동.
_LOCAL = r"c:/Users/user/moneytree-web"
if os.path.isdir(os.path.join(_LOCAL, "public", "data")):
    os.chdir(_LOCAL)
PXDIR = "import_MT/data/cache/px_hist"
idx = json.load(open("public/data/asset/index.json", encoding="utf-8"))

def asof(dd, cc, t):
    i = bisect.bisect_right(dd, t) - 1
    return cc[i] if i >= 0 else None

# 산출 창: 전일 종가 기준 롤링 3년 (매일 갱신). END=최신 거래일(SPY 벤치마크), BASE=END-3년.
def _last_date(fp):
    try:
        d = json.load(open(fp, encoding="utf-8"))
        return d[-1][0] if d else None
    except Exception:
        return None
END = _last_date(os.path.join(PXDIR, "SPY_NYSEARCA_US.json")) \
    or _last_date(os.path.join(PXDIR, "QQQ_NASDAQ_US.json"))
if not END:
    raise SystemExit("벤치마크 px_hist 없음(END 산출 불가)")
_ed = date.fromisoformat(END)
try:
    BASE = date(_ed.year - 3, _ed.month, _ed.day).isoformat()
except ValueError:
    BASE = date(_ed.year - 3, _ed.month, 28).isoformat()

def blurb(a):
    info = a.get("info") or {}
    cb = info.get("coreBiz") or a.get("coreBiz") or ""
    cb = re.sub(r"<br\s*/?>", " · ", cb)
    cb = re.sub(r"<[^>]+>", "", cb)
    cb = re.sub(r"^[\-\s·]+", "", re.sub(r"\s+", " ", cb)).strip()
    if not cb:
        chs = [c.get("name") for c in (a.get("characters") or [])][:3]
        ths = [t.get("themeName") for t in (a.get("themes") or [])][:2]
        cb = " · ".join([x for x in chs if x]) or (" · ".join([x for x in ths if x]))
    return cb[:180]

seen = {}
for aid, a in idx.items():
    tk = (a.get("ticker") or "").strip()
    if not tk:
        continue
    at = (a.get("asset_type") or "").upper()
    nm = a.get("name") or tk
    if "ETF" in at or "ETN" in at or "ETF" in nm.upper() or "ETN" in nm.upper():
        continue
    ex = (a.get("exchange") or "").upper(); co = (a.get("country") or "").upper()
    f = os.path.join(PXDIR, f"{tk}_{ex}_{co}.json")
    if not os.path.exists(f):
        continue
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    if not d or d[0][0] > BASE:
        continue
    dd = [x[0] for x in d]; cc = [x[1] for x in d]
    b = asof(dd, cc, BASE); e = asof(dd, cc, END)
    if not b or not e or b <= 0:
        continue
    mult = e / b
    if mult < 2:
        continue
    if tk not in seen or mult > seen[tk]["multiple"]:
        ths = []; seenT = set()
        for t in (a.get("themes") or []):
            nmT = (t.get("themeName") or "").strip(); idT = (t.get("themeId") or "").strip()
            if nmT and idT and idT not in seenT:
                seenT.add(idT); ths.append({"id": idT, "name": nmT})
        seen[tk] = {"id": aid, "name": nm, "ticker": tk, "country": co,
                    "multiple": round(mult, 2), "ret": round((mult - 1) * 100, 1),
                    "desc": blurb(a), "themes": ths[:6], "themeCount": len(ths)}

buckets = {}
for tk, it in seen.items():
    bk = 10 if it["multiple"] >= 10 else int(math.floor(it["multiple"]))
    buckets.setdefault(bk, []).append(it)
out_buckets = []
for bk in range(10, 1, -1):
    items = sorted(buckets.get(bk, []), key=lambda x: -x["multiple"])
    out_buckets.append({"label": "X10+" if bk == 10 else f"X{bk}", "min": bk, "count": len(items), "items": items})

payload = {
    "title": "x2~x10 배거 포트폴리오",
    "window": {"start": BASE, "end": END},
    "note": f"전일 종가 기준 최근 3년({BASE} → {END}) 주가 상승 배수로 분류한 개별종목 리스트로, 매일 갱신됩니다. 배수 = 최신 종가 ÷ 3년 전 종가(분할·배당 조정가, 직전 거래일 as-of). ETF·ETN 제외, 3년 전 이전 상장 종목만 포함(상장 3년 미만 종목의 과대배수 제거). 티커 중복 시 최고 배수 1개만 표기.",
    "asOf": END,
    "total": sum(len(b["items"]) for b in out_buckets),
    "buckets": out_buckets,
}
os.makedirs("public/data", exist_ok=True)
json.dump(payload, open("public/data/baggers.json", "w", encoding="utf-8"), ensure_ascii=False)
print("total", payload["total"], "| buckets", {b["label"]: b["count"] for b in out_buckets})
print("sample:", out_buckets[0]["items"][0])
