"""Master Admin — Cloudflare + Exabytes edge / DNS control plane."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import cloudflare_client as cf
from app import exabytes_client as xb
from app.config import settings
from app.deps import require_platform_admin
from app.dns_probe import probe_domain
from app.models import User

router = APIRouter(prefix="/edge", tags=["edge"])


class DnsRecordIn(BaseModel):
    type: str = Field(..., min_length=1, max_length=16)
    name: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1, max_length=2048)
    proxied: bool | None = None
    ttl: int = 1
    priority: int | None = None


class DnsRecordUpdateIn(BaseModel):
    type: str | None = None
    name: str | None = None
    content: str | None = None
    proxied: bool | None = None
    ttl: int | None = None
    priority: int | None = None


class NameserversIn(BaseModel):
    ns1: str = Field(..., min_length=1)
    ns2: str = Field(..., min_length=1)
    ns3: str = ""
    ns4: str = ""
    ns5: str = ""
    use_cloudflare: bool = False


class SslModeIn(BaseModel):
    mode: Literal["off", "flexible", "full", "strict"] = "strict"


def _http_err(exc: Exception) -> HTTPException:
    status = getattr(exc, "status_code", 400) or 400
    return HTTPException(status_code=status, detail=str(exc))


def _is_cloudflare_anycast(ips: list[str]) -> bool:
    """Heuristic: proxied hostnames resolve to Cloudflare anycast, not origin."""
    origin = settings.origin_ip.strip()
    if not ips:
        return False
    if all(ip == origin for ip in ips):
        return False
    # Common CF ranges start with these prefixes in public DNS answers
    cf_prefixes = ("104.", "172.64.", "172.65.", "172.66.", "172.67.", "188.114.", "162.159.")
    return any(ip.startswith(cf_prefixes) for ip in ips)


@router.get("/status")
def edge_status(_: User = Depends(require_platform_admin)) -> dict[str, Any]:
    zone_name = settings.cf_zone.strip() or "baseapp.asia"
    origin_ip = settings.origin_ip.strip() or "157.245.149.238"
    public = probe_domain(zone_name)

    out: dict[str, Any] = {
        "zone_name": zone_name,
        "origin_ip": origin_ip,
        "cloudflare": {
            "configured": cf.cloudflare_configured(),
            "zone": None,
            "expected_nameservers": [],
            "ssl": None,
            "always_use_https": None,
            "error": None,
        },
        "exabytes": {
            "configured": xb.exabytes_configured(),
            "api_url": settings.exabytes_api_url.strip(),
            "portal_url": settings.exabytes_portal_url.strip(),
            "domain": None,
            "nameservers": None,
            "error": None,
        },
        "public_dns": public,
        "health": {
            "registry_on_cloudflare": False,
            "proxy_active": False,
            "ssl_strict": False,
            "ready": False,
        },
        "links": {
            "cloudflare_overview": f"https://dash.cloudflare.com/?to=/:account/{zone_name}",
            "cloudflare_dns": f"https://dash.cloudflare.com/?to=/:account/{zone_name}/dns",
            "cloudflare_ssl": f"https://dash.cloudflare.com/?to=/:account/{zone_name}/ssl-tls",
            "exabytes_domains": settings.exabytes_portal_url.strip().rstrip("/")
            + "/clientarea.php?action=domains",
            "exabytes_nameservers": settings.exabytes_portal_url.strip().rstrip("/")
            + "/clientarea.php?action=domaindetails#tabNameservers",
            "admin_login": "https://admin.baseapp.asia/login",
        },
    }

    if cf.cloudflare_configured():
        try:
            zone = cf.get_zone(zone_name)
            if zone:
                zid = zone["id"]
                out["cloudflare"]["zone"] = {
                    "id": zid,
                    "name": zone.get("name"),
                    "status": zone.get("status"),
                    "paused": zone.get("paused"),
                    "name_servers": zone.get("name_servers") or [],
                    "original_name_servers": zone.get("original_name_servers") or [],
                }
                out["cloudflare"]["expected_nameservers"] = zone.get("name_servers") or []
                try:
                    out["cloudflare"]["ssl"] = cf.get_setting(zid, "ssl")
                    out["cloudflare"]["always_use_https"] = cf.get_setting(zid, "always_use_https")
                except cf.CloudflareError as exc:
                    out["cloudflare"]["error"] = str(exc)
            else:
                out["cloudflare"]["error"] = f"Zone {zone_name!r} not found in Cloudflare account"
        except cf.CloudflareError as exc:
            out["cloudflare"]["error"] = str(exc)

    if xb.exabytes_configured():
        try:
            domain = xb.find_domain(zone_name)
            if domain:
                out["exabytes"]["domain"] = {
                    "id": domain.get("id"),
                    "domain": domain.get("domain"),
                    "status": domain.get("status"),
                    "registrar": domain.get("registrar"),
                }
                try:
                    out["exabytes"]["nameservers"] = xb.get_nameservers(domain["id"])
                except xb.ExabytesError as exc:
                    out["exabytes"]["error"] = str(exc)
            else:
                out["exabytes"]["error"] = f"Domain {zone_name!r} not found via Exabytes API"
        except xb.ExabytesError as exc:
            out["exabytes"]["error"] = str(exc)

    expected = {ns.rstrip(".").lower() for ns in out["cloudflare"]["expected_nameservers"]}
    public_ns = {ns.rstrip(".").lower() for ns in public.get("nameservers") or []}
    on_cf = bool(expected) and expected.issubset(public_ns)
    if not expected:
        on_cf = any(ns.endswith(".ns.cloudflare.com") for ns in public_ns)
    proxy_active = (
        _is_cloudflare_anycast(public.get("admin_a") or [])
        or _is_cloudflare_anycast(public.get("api_a") or [])
    )
    ssl_strict = out["cloudflare"].get("ssl") == "strict"
    zone_status = (out["cloudflare"].get("zone") or {}).get("status")
    out["health"] = {
        "registry_on_cloudflare": on_cf,
        "proxy_active": proxy_active,
        "ssl_strict": ssl_strict,
        "zone_active": zone_status == "active",
        "ready": bool(on_cf and proxy_active and (ssl_strict or not cf.cloudflare_configured())),
    }
    return out


@router.post("/cloudflare/activation-check")
def cloudflare_activation_check(_: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        zone = cf.require_zone()
        result = cf.activation_check(zone["id"])
        refreshed = cf.require_zone()
        return {
            "ok": True,
            "activation_check": result,
            "status": refreshed.get("status"),
            "name_servers": refreshed.get("name_servers") or [],
        }
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.post("/cloudflare/bootstrap")
def cloudflare_bootstrap(_: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        zone = cf.require_zone()
        records = cf.bootstrap_baseapp_records(zone["id"])
        ssl = cf.apply_recommended_ssl(zone["id"])
        return {
            "ok": True,
            "zone_id": zone["id"],
            "records_upserted": len(records),
            "ssl": ssl,
            "name_servers": zone.get("name_servers") or [],
        }
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.post("/cloudflare/ssl")
def cloudflare_set_ssl(body: SslModeIn, _: User = Depends(require_platform_admin)) -> dict[str, Any]:
    if body.mode == "flexible":
        raise HTTPException(
            status_code=400,
            detail="Flexible SSL is not allowed — it breaks HTTPS to origin. Use Full (strict).",
        )
    try:
        zone = cf.require_zone()
        ssl = cf.set_setting(zone["id"], "ssl", body.mode)
        https = cf.set_setting(zone["id"], "always_use_https", "on")
        return {"ok": True, "ssl": ssl, "always_use_https": https}
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.get("/cloudflare/dns")
def cloudflare_list_dns(_: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        zone = cf.require_zone()
        records = cf.list_dns_records(zone["id"])
        slim = [
            {
                "id": r.get("id"),
                "type": r.get("type"),
                "name": r.get("name"),
                "content": r.get("content"),
                "proxied": r.get("proxied"),
                "ttl": r.get("ttl"),
                "priority": r.get("priority"),
            }
            for r in records
        ]
        return {"zone_id": zone["id"], "zone_name": zone.get("name"), "records": slim}
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.post("/cloudflare/dns")
def cloudflare_create_dns(body: DnsRecordIn, _: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        zone = cf.require_zone()
        payload: dict[str, Any] = {
            "type": body.type.upper(),
            "name": body.name,
            "content": body.content,
            "ttl": body.ttl,
        }
        if body.proxied is not None:
            payload["proxied"] = body.proxied
        if body.priority is not None:
            payload["priority"] = body.priority
        rec = cf.create_dns_record(zone["id"], payload)
        return {"ok": True, "record": rec}
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.patch("/cloudflare/dns/{record_id}")
def cloudflare_update_dns(
    record_id: str,
    body: DnsRecordUpdateIn,
    _: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    try:
        zone = cf.require_zone()
        existing = next((r for r in cf.list_dns_records(zone["id"]) if r.get("id") == record_id), None)
        if not existing:
            raise HTTPException(status_code=404, detail="DNS record not found")
        payload = {
            "type": (body.type or existing["type"]).upper(),
            "name": body.name or existing["name"],
            "content": body.content if body.content is not None else existing["content"],
            "ttl": body.ttl if body.ttl is not None else existing.get("ttl") or 1,
            "proxied": body.proxied if body.proxied is not None else existing.get("proxied", False),
        }
        priority = body.priority if body.priority is not None else existing.get("priority")
        if priority is not None:
            payload["priority"] = priority
        rec = cf.update_dns_record(zone["id"], record_id, payload)
        return {"ok": True, "record": rec}
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.delete("/cloudflare/dns/{record_id}")
def cloudflare_delete_dns(record_id: str, _: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        zone = cf.require_zone()
        cf.delete_dns_record(zone["id"], record_id)
        return {"ok": True}
    except cf.CloudflareError as exc:
        raise _http_err(exc) from exc


@router.get("/exabytes/domains")
def exabytes_domains(_: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        domains = xb.list_domains()
        return {
            "configured": True,
            "domains": [
                {
                    "id": d.get("id"),
                    "domain": d.get("domain"),
                    "status": d.get("status"),
                    "registrar": d.get("registrar"),
                    "nextduedate": d.get("nextduedate"),
                }
                for d in domains
            ],
        }
    except xb.ExabytesError as exc:
        raise _http_err(exc) from exc


@router.get("/exabytes/nameservers")
def exabytes_get_nameservers(_: User = Depends(require_platform_admin)) -> dict[str, Any]:
    try:
        domain = xb.find_domain()
        if not domain:
            raise HTTPException(status_code=404, detail=f"Domain {settings.cf_zone!r} not found at Exabytes")
        ns = xb.get_nameservers(domain["id"])
        return {"domain": domain.get("domain"), "domain_id": domain.get("id"), "nameservers": ns}
    except xb.ExabytesError as exc:
        raise _http_err(exc) from exc


@router.post("/exabytes/nameservers")
def exabytes_set_nameservers(
    body: NameserversIn,
    _: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    try:
        domain = xb.find_domain()
        if not domain:
            raise HTTPException(status_code=404, detail=f"Domain {settings.cf_zone!r} not found at Exabytes")

        ns1, ns2, ns3, ns4, ns5 = body.ns1, body.ns2, body.ns3, body.ns4, body.ns5
        if body.use_cloudflare:
            if not cf.cloudflare_configured():
                raise HTTPException(status_code=503, detail="Cloudflare not configured — cannot read expected NS")
            zone = cf.require_zone()
            expected = zone.get("name_servers") or []
            if len(expected) < 2:
                raise HTTPException(status_code=400, detail="Cloudflare did not return nameservers yet")
            ns1, ns2 = expected[0], expected[1]
            ns3 = expected[2] if len(expected) > 2 else ""
            ns4 = expected[3] if len(expected) > 3 else ""
            ns5 = expected[4] if len(expected) > 4 else ""

        xb.update_nameservers(domain["id"], ns1=ns1, ns2=ns2, ns3=ns3, ns4=ns4, ns5=ns5)
        current = xb.get_nameservers(domain["id"])
        return {
            "ok": True,
            "domain": domain.get("domain"),
            "domain_id": domain.get("id"),
            "nameservers": current,
            "note": "Registry propagation can take minutes to a few hours. Use Check nameservers in Cloudflare.",
        }
    except (xb.ExabytesError, cf.CloudflareError) as exc:
        raise _http_err(exc) from exc
