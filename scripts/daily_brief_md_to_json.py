# -*- coding: utf-8 -*-
# 에디터 포맷 데일리 브리프 .md → 리치 .json 변환.
# 사용법: python scripts/daily_brief_md_to_json.py [--force] [YYYY-MM-DD ...]
#   인자 없으면 public/data/daily_briefs/*.md 중 .json 없는 것 전부 변환.
#   --force: 기존 .json도 덮어씀(수기 작성분 보존하려면 생략).
import os, re, io, sys, json, glob

BASE = os.path.join("public", "data", "daily_briefs")
if not os.path.isdir(BASE):
    BASE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "daily_briefs")
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
except Exception:
    pass

DIR_MAP = {"up": "강세", "down": "약세", "mixed": "혼조", "flat": "혼조",
           "risk_on": "RISK-ON", "risk_off": "RISK-OFF"}
LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")


def cells(line):
    if not line.strip().startswith("|"):
        return None
    parts = [c.strip() for c in line.strip().split("|")[1:-1]]
    return parts


def is_sep(line):
    return bool(re.match(r"^\|[\s:|-]+\|?$", line.strip()))


def section(md, num):
    # "## {num}." 부터 다음 "## " 전까지
    lines = md.split("\n")
    out, on = [], False
    for ln in lines:
        if ln.startswith("## "):
            on = ln.strip().startswith(f"## {num}.")
            continue
        if on:
            out.append(ln)
    return out


def first_link(text):
    m = LINK.search(text or "")
    if m:
        return {"label": m.group(1), "url": m.group(2)}
    return None


def strip_links(text):
    return LINK.sub(lambda m: "", text or "").replace("()", "").strip()


def theme_keywords(name, gist):
    kw = []
    for tok in re.split(r"[_·/\s\(\)]+", name or ""):
        t = tok.strip()
        if len(t) >= 2 and not re.match(r"^T_\d+$", t):
            kw.append(t)
        if len(kw) >= 2:
            break
    # %↑ 급등 같은 수치 토큰 하나
    mnum = re.search(r"(\d+%\s*[↑↓]?)", gist or "")
    if mnum:
        kw.append(mnum.group(1).strip())
    return kw[:3]


ANALYST_RE = re.compile(r"(증권가|목표주가|목표가|매수의견|매수·비중확대|비중확대|IB|커버리지|주주환원|가이던스|리포트|실적)")


def convert(date):
    mdp = os.path.join(BASE, f"{date}.md")
    md = open(mdp, encoding="utf-8").read()

    # ---- macro ----
    macro_rows = []
    body = section(md, 0)
    seen_header = False
    for ln in body:
        c = cells(ln)
        if not c or is_sep(ln):
            continue
        if not seen_header and ("카테고리" in c[0] or "상태" in (c[1] if len(c) > 1 else "")):
            seen_header = True
            continue
        if len(c) >= 3 and c[0]:
            state = c[1].strip()
            d = DIR_MAP.get(state.lower(), state)
            macro_rows.append({"axis": c[0], "dir": d, "text": strip_links(c[2])})
    summary = macro_rows[-1]["text"][:90] if macro_rows else ""

    # ---- 보강(3) → themeId별 meaning ----
    meaning_by = {}
    for ln in section(md, 3):
        c = cells(ln)
        if not c or is_sep(ln):
            continue
        tid = next((x for x in c if re.match(r"^T_\d+$", x)), None)
        if not tid:
            continue
        rel = c[3] if len(c) > 3 else ""
        gist = strip_links(c[-1]) if c else ""
        meaning_by[tid] = (f"{rel} — {gist}" if rel else gist).strip()

    # ---- TOP5 → news ----
    news, analyst, seen_an = [], [], set()
    for ln in section(md, 1):
        c = cells(ln)
        if not c or is_sep(ln) or len(c) < 6:
            continue
        if "순위" in c[0]:
            continue
        tid = c[1].strip()
        if not re.match(r"^T_\d+$", tid):
            continue
        name = c[2].strip()
        strength = c[3].strip()
        gist_raw = c[5]
        src = first_link(gist_raw)
        gist = strip_links(gist_raw)
        mean = meaning_by.get(tid) or "이 뉴스가 직접 관련된 테마 — 그래프에서 수혜/피해 구성과 온도를 확인하세요."
        news.append({"themeId": tid, "themeName": name, "strength": strength,
                     "keywords": theme_keywords(name, gist),
                     "news": gist, "meaning": mean,
                     "source": src or {}})
        # 애널리스트 신호 추출
        if ANALYST_RE.search(gist) and tid not in seen_an:
            seen_an.add(tid)
            rating = ("매수" if "매수" in gist else "상향" if "상향" in gist or "가이던스" in gist
                      else "실적" if "실적" in gist else "리포트")
            analyst.append({"themeId": tid, "themeName": name, "firm": "증권가/시장",
                            "rating": rating, "keywords": theme_keywords(name, gist)[:2],
                            "title": (name + " — " + gist.split("—")[0].strip())[:60],
                            "summary": gist[:180], "source": src or {}})

    news_kw = []
    for n in news:
        for k in n["keywords"]:
            if k not in news_kw:
                news_kw.append(k)
    an_kw = []
    for a in analyst:
        for k in a["keywords"]:
            if k not in an_kw:
                an_kw.append(k)

    out = {"date": date, "title": f"데일리 브리프 — {date}",
           "intro": "오늘 뜬 뉴스가 어떤 테마에 무슨 의미인지 해석하고, 바로 그 테마 화면으로 안내합니다.",
           "macro": {"summary": summary, "rows": macro_rows},
           "newsKeywords": news_kw[:8], "news": news,
           "analystKeywords": an_kw[:8], "analyst": analyst[:4],
           "_generated": "md->json auto-convert"}
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    dates = args or [os.path.basename(p)[:-3] for p in glob.glob(os.path.join(BASE, "*.md"))]
    done = skip = 0
    for date in sorted(dates):
        mdp = os.path.join(BASE, f"{date}.md")
        jsp = os.path.join(BASE, f"{date}.json")
        if not os.path.exists(mdp):
            continue
        if os.path.exists(jsp) and not force:
            skip += 1
            continue
        try:
            out = convert(date)
        except Exception as e:
            print("  ERR", date, str(e)[:80]); continue
        json.dump(out, open(jsp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        done += 1
    print(f"변환 {done}건, 스킵(기존 json) {skip}건")


if __name__ == "__main__":
    main()
