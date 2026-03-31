#!/usr/bin/env python3
"""
Scrape Gold/Silver spot pages and write a JSON feed.

Use with cron (every 30s while streaming), for example:
* * * * * /usr/bin/python3 /path/to/spot_scraper.py --out /var/www/html/spot-feed.json
* * * * * sleep 30; /usr/bin/python3 /path/to/spot_scraper.py --out /var/www/html/spot-feed.json
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

GOLD_URL = "https://www.google.com/finance/beta/quote/GCW00:COMEX?sa=X&ved=2ahUKEwje8OWo78eTAxXNRDABHTwmLXYQ3ecFegQIIhAP"
SILVER_URL = "https://www.google.com/finance/beta/quote/SIW00:COMEX?sa=X&ved=2ahUKEwjM-sq578eTAxXaRzABHZ84Gf4Q3ecFegQIJRAP"

PRICE_PATTERNS = (
    re.compile(r'data-last-price="([0-9.,]+)"', re.I),
    re.compile(r'"lastPrice"\s*:\s*"([0-9.,]+)"', re.I),
    re.compile(r'"price"\s*:\s*"([0-9.,]+)"', re.I),
    re.compile(r"\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)", re.I),
)


def fetch_html(url: str, timeout: int = 10) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        },
    )
    with urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", errors="ignore")


def parse_price(html: str) -> float:
    for pattern in PRICE_PATTERNS:
        m = pattern.search(html)
        if m and m.group(1):
            raw = m.group(1).replace(",", "")
            try:
                val = float(raw)
            except ValueError:
                continue
            if val > 0:
                return val
    raise ValueError("Unable to parse price")


def scrape_price(url: str) -> float:
    return parse_price(fetch_html(url))


def read_existing(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser(description="Write VPS spot feed JSON")
    parser.add_argument("--out", default="spot-feed.json", help="Output JSON path")
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = read_existing(out_path)
    payload = {
        "gold": {"price": 0, "sourceState": "offline"},
        "silver": {"price": 0, "sourceState": "offline"},
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    for metal, url in (("gold", GOLD_URL), ("silver", SILVER_URL)):
        try:
            price = scrape_price(url)
            payload[metal]["price"] = price
            payload[metal]["sourceState"] = "primary"
        except Exception:
            prev = (existing.get(metal) or {})
            prev_price = prev.get("price")
            if isinstance(prev_price, (int, float)) and prev_price > 0:
                payload[metal]["price"] = prev_price
                payload[metal]["sourceState"] = "fallback"
            else:
                payload[metal]["sourceState"] = "offline"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp_path.replace(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
