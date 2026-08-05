"""Cloudflare API v4 helpers for Master Admin edge control."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings

API = "https://api.cloudflare.com/client/v4"


class CloudflareError(Exception):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def cloudflare_configured() -> bool:
    return bool(settings.cf_api_token.strip())


def _headers() -> dict[str, str]:
    token = settings.cf_api_token.strip()
    if not token:
        raise CloudflareError("Cloudflare API token not configured (CF_API_TOKEN)", status_code=503)
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _request(method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> Any:
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.request(method, f"{API}{path}", headers=_headers(), json=json, params=params)
    except httpx.HTTPError as exc:
        raise CloudflareError(f"Cloudflare request failed: {exc}", status_code=502) from exc

    try:
        data = res.json()
    except Exception as exc:
        raise CloudflareError(f"Cloudflare returned non-JSON ({res.status_code})", status_code=502) from exc

    if not data.get("success"):
        errors = data.get("errors") or []
        msg = "; ".join(e.get("message", str(e)) for e in errors) or f"HTTP {res.status_code}"
        code = 400 if res.status_code < 500 else 502
        raise CloudflareError(msg, status_code=code)
    return data.get("result")


def get_zone(zone_name: str | None = None) -> dict[str, Any] | None:
    name = (zone_name or settings.cf_zone).strip()
    result = _request("GET", "/zones", params={"name": name})
    if not result:
        return None
    return result[0]


def require_zone(zone_name: str | None = None) -> dict[str, Any]:
    zone = get_zone(zone_name)
    if not zone:
        raise CloudflareError(
            f"Zone {(zone_name or settings.cf_zone)!r} not found in this Cloudflare account. "
            "Add the site in Cloudflare first.",
            status_code=404,
        )
    return zone


def list_dns_records(zone_id: str, *, record_type: str | None = None, name: str | None = None) -> list[dict]:
    params: dict[str, Any] = {"per_page": 100}
    if record_type:
        params["type"] = record_type
    if name:
        params["name"] = name
    result = _request("GET", f"/zones/{zone_id}/dns_records", params=params)
    return list(result or [])


def upsert_a_record(zone_id: str, *, name: str, ip: str, proxied: bool = True) -> dict:
    zone = _request("GET", f"/zones/{zone_id}")
    zone_name = zone.get("name") or settings.cf_zone
    fqdn = zone_name if name in ("@", zone_name) else f"{name}.{zone_name}"
    existing = list_dns_records(zone_id, record_type="A", name=fqdn)
    body = {"type": "A", "name": name, "content": ip, "ttl": 1, "proxied": proxied}
    if existing:
        return _request("PUT", f"/zones/{zone_id}/dns_records/{existing[0]['id']}", json=body)
    return _request("POST", f"/zones/{zone_id}/dns_records", json=body)


def upsert_cname_record(zone_id: str, *, name: str, target: str, proxied: bool = True) -> dict:
    zone = _request("GET", f"/zones/{zone_id}")
    zone_name = zone.get("name") or settings.cf_zone
    fqdn = zone_name if name in ("@", zone_name) else f"{name}.{zone_name}"
    existing = list_dns_records(zone_id, record_type="CNAME", name=fqdn)
    body = {"type": "CNAME", "name": name, "content": target, "ttl": 1, "proxied": proxied}
    if existing:
        return _request("PUT", f"/zones/{zone_id}/dns_records/{existing[0]['id']}", json=body)
    return _request("POST", f"/zones/{zone_id}/dns_records", json=body)


def create_dns_record(zone_id: str, body: dict) -> dict:
    return _request("POST", f"/zones/{zone_id}/dns_records", json=body)


def update_dns_record(zone_id: str, record_id: str, body: dict) -> dict:
    return _request("PUT", f"/zones/{zone_id}/dns_records/{record_id}", json=body)


def delete_dns_record(zone_id: str, record_id: str) -> dict:
    return _request("DELETE", f"/zones/{zone_id}/dns_records/{record_id}")


def get_setting(zone_id: str, key: str) -> Any:
    result = _request("GET", f"/zones/{zone_id}/settings/{key}")
    return result.get("value") if isinstance(result, dict) else result


def set_setting(zone_id: str, key: str, value: Any) -> Any:
    result = _request("PATCH", f"/zones/{zone_id}/settings/{key}", json={"value": value})
    return result.get("value") if isinstance(result, dict) else result


def activation_check(zone_id: str) -> dict:
    return _request("PUT", f"/zones/{zone_id}/activation_check") or {}


def bootstrap_baseapp_records(zone_id: str, origin_ip: str | None = None) -> list[dict]:
    ip = (origin_ip or settings.origin_ip).strip()
    applied: list[dict] = []
    zone = _request("GET", f"/zones/{zone_id}")
    zone_name = zone.get("name") or settings.cf_zone
    for name in ("@", "admin", "api"):
        applied.append(upsert_a_record(zone_id, name=name, ip=ip, proxied=True))
    applied.append(upsert_cname_record(zone_id, name="www", target=zone_name, proxied=True))
    # Mail/FTP must not be proxied if present
    for name in ("mail", "ftp"):
        fqdn = f"{name}.{zone_name}"
        for rec in list_dns_records(zone_id, name=fqdn):
            if rec.get("proxied"):
                body = {
                    "type": rec["type"],
                    "name": rec["name"],
                    "content": rec["content"],
                    "ttl": rec.get("ttl") or 1,
                    "proxied": False,
                }
                if rec["type"] == "MX":
                    body["priority"] = rec.get("priority", 0)
                applied.append(update_dns_record(zone_id, rec["id"], body))
    return applied


def apply_recommended_ssl(zone_id: str) -> dict[str, Any]:
    return {
        "ssl": set_setting(zone_id, "ssl", "strict"),
        "always_use_https": set_setting(zone_id, "always_use_https", "on"),
        "min_tls_version": set_setting(zone_id, "min_tls_version", "1.2"),
        "automatic_https_rewrites": set_setting(zone_id, "automatic_https_rewrites", "on"),
        "tls_1_3": set_setting(zone_id, "tls_1_3", "on"),
    }
