"""Exabytes billing (WHMCS) API helpers for nameserver control.

Exabytes client area is WHMCS-based. When API access is enabled for the
account, we can read/update domain nameservers from Master Admin.

Create credentials: billing.exabytes.my → Account → API Credentials
(or ask Exabytes support to enable API access).
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import settings


class ExabytesError(Exception):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def exabytes_configured() -> bool:
    return bool(settings.exabytes_api_identifier.strip() and settings.exabytes_api_secret.strip())


def _endpoint() -> str:
    base = settings.exabytes_api_url.strip().rstrip("/") + "/"
    return urljoin(base, "includes/api.php")


def _call(action: str, **params: Any) -> dict[str, Any]:
    if not exabytes_configured():
        raise ExabytesError(
            "Exabytes API not configured (EXABYTES_API_IDENTIFIER / EXABYTES_API_SECRET)",
            status_code=503,
        )
    payload = {
        "identifier": settings.exabytes_api_identifier.strip(),
        "secret": settings.exabytes_api_secret.strip(),
        "action": action,
        "responsetype": "json",
        **{k: v for k, v in params.items() if v is not None},
    }
    try:
        with httpx.Client(timeout=45.0) as client:
            res = client.post(_endpoint(), data=payload)
    except httpx.HTTPError as exc:
        raise ExabytesError(f"Exabytes API request failed: {exc}", status_code=502) from exc

    try:
        data = res.json()
    except Exception as exc:
        raise ExabytesError(
            f"Exabytes returned non-JSON ({res.status_code}). "
            "Confirm EXABYTES_API_URL and that API access is enabled.",
            status_code=502,
        ) from exc

    if str(data.get("result", "")).lower() == "error":
        raise ExabytesError(data.get("message") or "Exabytes API error", status_code=400)
    return data


def list_domains(domain: str | None = None) -> list[dict[str, Any]]:
    """Return domains visible to the API credential."""
    params: dict[str, Any] = {"limitnum": 100}
    if domain:
        params["domain"] = domain
    data = _call("GetClientsDomains", **params)
    domains = data.get("domains") or {}
    items = domains.get("domain") if isinstance(domains, dict) else domains
    if items is None:
        return []
    if isinstance(items, dict):
        return [items]
    return list(items)


def find_domain(domain_name: str | None = None) -> dict[str, Any] | None:
    name = (domain_name or settings.cf_zone).strip().lower()
    for d in list_domains(name):
        if str(d.get("domain", "")).lower() == name:
            return d
    # Some WHMCS installs ignore the domain filter — scan all
    for d in list_domains():
        if str(d.get("domain", "")).lower() == name:
            return d
    return None


def get_nameservers(domain_id: int | str) -> dict[str, Any]:
    data = _call("DomainGetNameservers", domainid=domain_id)
    return {
        "ns1": data.get("ns1") or "",
        "ns2": data.get("ns2") or "",
        "ns3": data.get("ns3") or "",
        "ns4": data.get("ns4") or "",
        "ns5": data.get("ns5") or "",
    }


def update_nameservers(
    domain_id: int | str,
    *,
    ns1: str,
    ns2: str,
    ns3: str = "",
    ns4: str = "",
    ns5: str = "",
) -> dict[str, Any]:
    return _call(
        "DomainUpdateNameservers",
        domainid=domain_id,
        ns1=ns1.strip(),
        ns2=ns2.strip(),
        ns3=(ns3 or "").strip(),
        ns4=(ns4 or "").strip(),
        ns5=(ns5 or "").strip(),
    )
