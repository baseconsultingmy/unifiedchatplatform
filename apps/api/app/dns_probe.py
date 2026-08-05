"""Public DNS checks via DNS-over-HTTPS (no dig dependency)."""

from __future__ import annotations

from typing import Any

import httpx


def doh_query(name: str, record_type: str = "NS") -> dict[str, Any]:
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": name, "type": record_type},
                headers={"accept": "application/dns-json"},
            )
            res.raise_for_status()
            return res.json()
    except Exception as exc:
        return {"Status": -1, "error": str(exc), "Answer": []}


def extract_records(payload: dict[str, Any]) -> list[str]:
    answers = payload.get("Answer") or []
    out: list[str] = []
    for ans in answers:
        data = str(ans.get("data") or "").rstrip(".").lower()
        if data:
            out.append(data)
    return sorted(set(out))


def probe_domain(domain: str) -> dict[str, Any]:
    ns_payload = doh_query(domain, "NS")
    a_admin = doh_query(f"admin.{domain}", "A")
    a_api = doh_query(f"api.{domain}", "A")
    a_apex = doh_query(domain, "A")
    return {
        "domain": domain,
        "nameservers": extract_records(ns_payload),
        "admin_a": extract_records(a_admin),
        "api_a": extract_records(a_api),
        "apex_a": extract_records(a_apex),
        "ns_error": ns_payload.get("error"),
    }
