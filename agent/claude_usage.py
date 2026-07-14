"""Summarize local Claude Code usage from ~/.claude/projects/**/*.jsonl.

Each assistant message line carries a ``message.usage`` block (input/output/
cache tokens) and ``message.model``. We aggregate tokens and an *estimated*
cost by day and model, then the agent pushes the summary to the backend for a
dashboard tile (the server can't read the Mac; the Mac pushes).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_CLAUDE_DIR = Path.home() / ".claude" / "projects"

# Rough USD per-token rates (input, output) by model family. Cache-read is
# ~0.1x input, cache-write ~1.25x input. Estimates only — for a sense of scale.
_RATES = {
    "opus": (15 / 1e6, 75 / 1e6),
    "sonnet": (3 / 1e6, 15 / 1e6),
    "haiku": (0.8 / 1e6, 4 / 1e6),
    "fable": (3 / 1e6, 15 / 1e6),
}
_DEFAULT_RATE = (3 / 1e6, 15 / 1e6)


def _rate(model: str) -> tuple[float, float]:
    for key, rate in _RATES.items():
        if key in model:
            return rate
    return _DEFAULT_RATE


def summarize(claude_dir: Path = DEFAULT_CLAUDE_DIR) -> dict[str, Any]:
    today = datetime.now().astimezone().date()
    by_model: dict[str, dict[str, float]] = {}
    day_tokens: dict[str, int] = {}
    day_io: dict[str, int] = {}  # input+output — the "real work" (no cache)
    day_cost: dict[str, float] = {}
    totals = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "cost": 0.0}
    messages = 0

    for path in claude_dir.rglob("*.jsonl"):
        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            msg = event.get("message")
            if not isinstance(msg, dict) or msg.get("role") != "assistant":
                continue
            usage = msg.get("usage")
            if not isinstance(usage, dict):
                continue

            model = msg.get("model") or "unknown"
            if model.startswith("<"):  # synthetic/placeholder messages
                continue
            inp = int(usage.get("input_tokens", 0) or 0)
            out = int(usage.get("output_tokens", 0) or 0)
            cread = int(usage.get("cache_read_input_tokens", 0) or 0)
            cwrite = int(usage.get("cache_creation_input_tokens", 0) or 0)
            in_rate, out_rate = _rate(model)
            cost = inp * in_rate + out * out_rate + cread * in_rate * 0.1 + cwrite * in_rate * 1.25
            tokens = inp + out + cread + cwrite

            messages += 1
            totals["input"] += inp
            totals["output"] += out
            totals["cacheRead"] += cread
            totals["cacheWrite"] += cwrite
            totals["cost"] += cost

            m = by_model.setdefault(model, {"tokens": 0, "cost": 0.0})
            m["tokens"] += tokens
            m["cost"] += cost

            ts = event.get("timestamp")
            if isinstance(ts, str):
                try:
                    day = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().date().isoformat()
                    day_tokens[day] = day_tokens.get(day, 0) + tokens
                    day_io[day] = day_io.get(day, 0) + inp + out
                    day_cost[day] = day_cost.get(day, 0.0) + cost
                except ValueError:
                    pass

    total_tokens = totals["input"] + totals["output"] + totals["cacheRead"] + totals["cacheWrite"]
    today_key = today.isoformat()

    def week_sum(d: dict[str, float]) -> float:
        cutoff = (today.toordinal() - 6)
        return sum(v for k, v in d.items() if _ordinal(k) is not None and _ordinal(k) >= cutoff)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "messages": messages,
        "totals": {"tokens": total_tokens, "io": totals["input"] + totals["output"], "costEst": round(totals["cost"], 2), **{k: totals[k] for k in ("input", "output", "cacheRead", "cacheWrite")}},
        "today": {"tokens": day_tokens.get(today_key, 0), "io": day_io.get(today_key, 0), "costEst": round(day_cost.get(today_key, 0.0), 2)},
        "week": {"tokens": int(week_sum(day_tokens)), "io": int(week_sum(day_io)), "costEst": round(week_sum(day_cost), 2)},
        "byModel": {m: {"tokens": v["tokens"], "costEst": round(v["cost"], 2)} for m, v in sorted(by_model.items(), key=lambda kv: -kv[1]["tokens"])},
    }


def _ordinal(day: str) -> int | None:
    try:
        return datetime.fromisoformat(day).toordinal()
    except ValueError:
        return None
