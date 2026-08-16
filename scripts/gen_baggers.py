# -*- coding: utf-8 -*-
import json, io, os, sys, math, bisect, re
sys.stdout = io.TextIOWrapper(os.fdopen(os.dup(1), "wb"), encoding="utf-8")
os.chdir(r"c:/Users/user/moneytree-web")
PXDIR = "import_MT/data/cache/px_hist"
idx = json.load(open("public/data/asset/index.json", encoding="utf-8"))
BASE, END = "2023-07-01", "2026-06-30"

def asof(dd, cc, t):
    i = bisect.bisect_right(dd, t) - 1
    return cc[i] if i >= 0 else None

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
    if mult < 3:
        continue
    if tk not in seen or mult > seen[tk]["multiple"]:
        seen[tk] = {"id": aid, "name": nm, "ticker": tk, "country": co,
                    "multiple": round(mult, 2), "ret": round((mult - 1) * 100, 1), "desc": blurb(a)}

buckets = {}
for tk, it in seen.items():
    bk = 10 if it["multiple"] >= 10 else int(math.floor(it["multiple"]))
    buckets.setdefault(bk, []).append(it)
out_buckets = []
for bk in range(10, 2, -1):
    items = sorted(buckets.get(bk, []), key=lambda x: -x["multiple"])
    out_buckets.append({"label": "X10+" if bk == 10 else f"X{bk}", "min": bk, "count": len(items), "items": items})

payload = {
    "title": "x3~x10 배거 포트폴리오",
    "window": {"start": BASE, "end": END},
    "note": "2023년 7월 1일 → 2026년 6월 30일(3년, 반기 정렬) 동안의 주가 상승 배수로 분류한 개별종목 리스트입니다. 배수 = 종료일 종가 ÷ 시작일 종가(분할·배당 조정가, 직전 거래일 as-of). ETF·ETN 제외, 2023년 7월 이전 상장 종목만 포함(3년 미만 상장 종목의 과대배수 제거). 티커 중복 시 최고 배수 1개만 표기.",
    "asOf": END,
    "total": sum(len(b["items"]) for b in out_buckets),
    "buckets": out_buckets,
}
os.makedirs("public/data", exist_ok=True)
json.dump(payload, open("public/data/baggers.json", "w", encoding="utf-8"), ensure_ascii=False)
print("total", payload["total"], "| buckets", {b["label"]: b["count"] for b in out_buckets})
print("sample:", out_buckets[0]["items"][0])
