# sim/store.py
# 시뮬레이션 기록 저장/불러오기 — sim/runs/*.json 에 설정·결과·3줄요약을 보관.
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

RUNS_DIR = Path(__file__).resolve().parent / "runs"
RUNS_DIR.mkdir(exist_ok=True)


def _slug(s: str) -> str:
    s = re.sub(r"[^0-9A-Za-z가-힣_-]+", "-", (s or "sim").strip())
    return s.strip("-")[:40] or "sim"


def save_run(
    name: str,
    params: dict[str, Any],
    summary3: dict[str, str],
    metrics_rows: list[dict[str, Any]],
    period_label: str = "",
    note: str = "",
) -> Path:
    """
    하나의 시뮬레이션 기록을 저장.
      name        : 사용자 지정 제목
      params      : 재실행용 설정(위젯 값 dict)
      summary3    : {"내용": .., "결과": .., "시사점": ..}
      metrics_rows: 비교표 행(표시용, 직렬화 가능한 값만)
      note        : 사용자가 직접 쓴 자유 메모(노트)
    """
    now = datetime.now()
    rid = f"{now:%Y%m%d-%H%M%S}_{_slug(name)}"
    rec = {
        "id": rid,
        "name": name or "(무제)",
        "saved_at": now.isoformat(timespec="seconds"),
        "period_label": period_label,
        "note": note or "",
        "summary3": {
            "내용": summary3.get("내용", ""),
            "결과": summary3.get("결과", ""),
            "시사점": summary3.get("시사점", ""),
        },
        "params": params,
        "metrics_rows": metrics_rows,
    }
    p = RUNS_DIR / f"{rid}.json"
    p.write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def list_runs() -> list[dict[str, Any]]:
    """저장된 기록을 최신순으로 반환(메타 + summary3 포함)."""
    out = []
    for p in RUNS_DIR.glob("*.json"):
        try:
            rec = json.loads(p.read_text(encoding="utf-8"))
            out.append(rec)
        except Exception:
            continue
    out.sort(key=lambda r: r.get("saved_at", ""), reverse=True)
    return out


def load_run(rid: str) -> Optional[dict[str, Any]]:
    p = RUNS_DIR / f"{rid}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def delete_run(rid: str) -> bool:
    p = RUNS_DIR / f"{rid}.json"
    if p.exists():
        try:
            p.unlink()
            return True
        except Exception:
            return False
    return False
