"""Meta Graph helpers for WhatsApp Flows (create, upload, publish, encryption key)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import settings
from app.flow_definition import BOOKING_FLOW_JSON, BOOKING_FLOW_NAME
from app.models import Tenant
from app.whatsapp_creds import resolve_whatsapp_credentials

logger = logging.getLogger("baseapp.flow_meta")

GRAPH = "https://graph.facebook.com/v21.0"


class FlowMetaError(Exception):
    def __init__(self, message: str, payload: dict | None = None):
        super().__init__(message)
        self.payload = payload or {}


def _token_for(tenant: Tenant) -> str:
    token, _ = resolve_whatsapp_credentials(tenant)
    if not token:
        raise FlowMetaError("WhatsApp access token is not configured for this shop")
    return token


def _phone_for(tenant: Tenant) -> str:
    _, phone_id = resolve_whatsapp_credentials(tenant)
    if not phone_id:
        raise FlowMetaError("WhatsApp phone number ID is not configured for this shop")
    return phone_id


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def graph_get(path: str, token: str, params: dict | None = None) -> dict:
    with httpx.Client(timeout=45.0) as client:
        res = client.get(f"{GRAPH}/{path.lstrip('/')}", headers=_headers(token), params=params)
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = (data.get("error") or {}).get("message") or res.text or "Graph GET failed"
        raise FlowMetaError(msg, data)
    return data


def graph_post(path: str, token: str, *, json_body: dict | None = None, data=None, files=None) -> dict:
    with httpx.Client(timeout=60.0) as client:
        res = client.post(
            f"{GRAPH}/{path.lstrip('/')}",
            headers=_headers(token),
            json=json_body,
            data=data,
            files=files,
        )
    payload = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = (payload.get("error") or {}).get("message") or res.text or "Graph POST failed"
        raise FlowMetaError(msg, payload)
    return payload


def upload_business_public_key(tenant: Tenant, public_key_pem: str) -> dict:
    """Register the Flows endpoint RSA public key on the phone number."""
    token = _token_for(tenant)
    phone_id = _phone_for(tenant)
    pem = public_key_pem.strip()
    if "BEGIN PUBLIC KEY" not in pem:
        raise FlowMetaError("Invalid public key PEM")
    # Meta expects form field business_public_key
    return graph_post(
        f"{phone_id}/whatsapp_business_encryption",
        token,
        data={"business_public_key": pem},
    )


def list_flows(tenant: Tenant) -> list[dict]:
    token = _token_for(tenant)
    waba = (tenant.wa_business_account_id or "").strip()
    if not waba:
        raise FlowMetaError("WhatsApp Business Account ID (WABA) is required to manage Flows")
    data = graph_get(f"{waba}/flows", token, params={"fields": "id,name,status,categories"})
    return list(data.get("data") or [])


def create_or_reuse_flow(tenant: Tenant) -> str:
    """Return flow_id for baseapp booking flow (create if missing)."""
    token = _token_for(tenant)
    waba = (tenant.wa_business_account_id or "").strip()
    if not waba:
        raise FlowMetaError("WhatsApp Business Account ID (WABA) is required to publish Flows")

    existing = list_flows(tenant)
    for row in existing:
        if row.get("name") == BOOKING_FLOW_NAME:
            return str(row["id"])

    created = graph_post(
        f"{waba}/flows",
        token,
        json_body={
            "name": BOOKING_FLOW_NAME,
            "categories": ["APPOINTMENT_BOOKING"],
        },
    )
    flow_id = created.get("id")
    if not flow_id:
        raise FlowMetaError("Flow create returned no id", created)
    return str(flow_id)


def upload_flow_json(tenant: Tenant, flow_id: str) -> dict:
    token = _token_for(tenant)
    raw = json.dumps(BOOKING_FLOW_JSON).encode("utf-8")
    files = {
        "file": ("flow.json", raw, "application/json"),
    }
    data = {
        "name": "flow.json",
        "asset_type": "FLOW_JSON",
    }
    return graph_post(f"{flow_id}/assets", token, data=data, files=files)


def set_flow_endpoint(tenant: Tenant, flow_id: str) -> dict:
    token = _token_for(tenant)
    endpoint = f"{settings.public_api_base.rstrip('/')}/v1/webhooks/whatsapp/flows"
    # endpoint_uri is set via Flow update
    return graph_post(
        flow_id,
        token,
        json_body={"endpoint_uri": endpoint},
    )


def publish_flow(tenant: Tenant, flow_id: str) -> dict:
    token = _token_for(tenant)
    return graph_post(f"{flow_id}/publish", token, json_body={})


def ensure_booking_flow_published(tenant: Tenant, *, public_key_pem: str | None = None) -> dict[str, Any]:
    """
    Full setup: optional public key upload → create/reuse Flow → upload JSON →
    set endpoint → publish → return {flow_id, ...}.
    """
    steps: dict[str, Any] = {}
    if public_key_pem and public_key_pem.strip():
        try:
            steps["encryption_key"] = upload_business_public_key(tenant, public_key_pem)
        except FlowMetaError as exc:
            # Key may already be set; continue but record the error.
            steps["encryption_key_error"] = str(exc)

    flow_id = create_or_reuse_flow(tenant)
    steps["flow_id"] = flow_id
    steps["upload"] = upload_flow_json(tenant, flow_id)
    try:
        steps["endpoint"] = set_flow_endpoint(tenant, flow_id)
    except FlowMetaError as exc:
        steps["endpoint_error"] = str(exc)
    try:
        steps["publish"] = publish_flow(tenant, flow_id)
    except FlowMetaError as exc:
        # Already published / validation pending — keep flow_id for draft sends.
        steps["publish_error"] = str(exc)
    return steps
