#!/usr/bin/env python3
"""
Fetch Kitco live chart pages and optionally push spot to the Gold API (Turso).

Sources (HTML includes Next.js __NEXT_DATA__ with GetMetalQuoteV3 bid prices):
  - https://www.kitco.com/charts/gold
  - https://www.kitco.com/charts/silver

If Kitco changes their Next.js payload shape, parsing will fail; use stale-file
fallback per metal when configured.

Push mode (vc-dash style): set GOLD_API_BASE_URL and SPOT_PUSH_SECRET on the VPS
(Railway API must have the same SPOT_PUSH_SECRET). POSTs JSON to /v1/spot/push.

Still write --out if you want a public spot-feed.json for job:spot fallback.

Automated scraping may conflict with Kitco's Terms of Use; operators are
responsible for compliance. Prefer licensed APIs when available.

Cron examples:
  * * * * * /usr/bin/python3 /path/to/spot_scraper.py --out /var/www/html/spot-feed.json
  * * * * * env GOLD_API_BASE_URL=https://api.example.com SPOT_PUSH_SECRET=... /usr/bin/python3 /path/to/spot_scraper.py --out /var/www/html/spot-feed.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GOLD_URL = "https://www.kitco.com/charts/gold"
SILVER_URL = "https://www.kitco.com/charts/silver"

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)


def fetch_html(url: str, timeout: int = 15) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        },
    )
    with urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", errors="ignore")


def parse_kitco_bid(html: str) -> float:
    m = _NEXT_DATA_RE.search(html)
    if not m:
        raise ValueError("Kitco: missing __NEXT_DATA__")
    data: dict[str, Any] = json.loads(m.group(1))
    try:
        queries = data["props"]["pageProps"]["dehydratedState"]["queries"]
    except (KeyError, TypeError) as e:
        raise ValueError("Kitco: unexpected JSON shape") from e

    for q in queries:
        state = (q or {}).get("state") or {}
        payload = state.get("data")
        if not isinstance(payload, dict):
            continue
        gmq = payload.get("GetMetalQuoteV3")
        if not isinstance(gmq, dict):
            continue
        results = gmq.get("results")
        if not results:
            continue
        first = results[0]
        if not isinstance(first, dict):
            continue
        bid = first.get("bid")
        if bid is None:
            continue
        val = float(bid)
        if val > 0:
            return val

    raise ValueError("Kitco: no GetMetalQuoteV3 bid in __NEXT_DATA__")


def scrape_kitco_bid(url: str) -> float:
    return parse_kitco_bid(fetch_html(url))


def read_existing(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def push_spot_to_api(base_url: str, secret: str, payload: dict) -> None:
    """POST payload to Gold API /v1/spot/push (Bearer secret)."""
    url = base_url.rstrip("/") + "/v1/spot/push"
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + secret,
        },
    )
    try:
        with urlopen(req, timeout=20) as res:
            if res.getcode() != 200:
                raise RuntimeError(f"spot push HTTP {res.getcode()}")
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"spot push HTTP {e.code}: {detail}") from e
    except URLError as e:
        raise RuntimeError(f"spot push request failed: {e}") from e


def main() -> int:
    parser = argparse.ArgumentParser(description="Kitco spot scraper: JSON file and/or API push")
    parser.add_argument("--out", default="spot-feed.json", help="Output JSON path")
    parser.add_argument(
        "--api-url",
        default="",
        help="Override GOLD_API_BASE_URL (Gold API origin, e.g. https://api.example.com)",
    )
    parser.add_argument(
        "--push-secret",
        default="",
        help="Override SPOT_PUSH_SECRET (must match Railway SPOT_PUSH_SECRET)",
    )
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
            price = scrape_kitco_bid(url)
            payload[metal]["price"] = price
            payload[metal]["sourceState"] = "kitco"
        except Exception:
            prev = existing.get(metal) or {}
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

    api_base = (args.api_url or os.environ.get("GOLD_API_BASE_URL", "")).strip()
    push_secret = (args.push_secret or os.environ.get("SPOT_PUSH_SECRET", "")).strip()
    if api_base and push_secret:
        if not api_base.startswith("http://") and not api_base.startswith("https://"):
            api_base = "https://" + api_base
        try:
            push_spot_to_api(api_base, push_secret, payload)
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
