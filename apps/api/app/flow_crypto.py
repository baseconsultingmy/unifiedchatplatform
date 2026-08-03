"""WhatsApp Flows request/response encryption (AES-GCM + RSA-OAEP)."""

from __future__ import annotations

import base64
import json
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class FlowCryptoError(Exception):
    def __init__(self, message: str, status_code: int = 421):
        super().__init__(message)
        self.status_code = status_code


def normalize_private_key_pem(raw: str) -> str:
    """Accept PEM text, escaped \\n PEM, or base64-encoded PEM."""
    text = (raw or "").strip()
    if not text:
        return ""
    if "BEGIN" not in text:
        try:
            decoded = base64.b64decode(text).decode("utf-8")
            if "BEGIN" in decoded:
                return decoded.strip()
        except Exception:  # noqa: BLE001
            pass
    return text.replace("\\n", "\n").strip()


def normalize_public_key_pem(raw: str) -> str:
    return normalize_private_key_pem(raw)


def is_flow_crypto_configured(private_key_pem: str) -> bool:
    return "BEGIN" in normalize_private_key_pem(private_key_pem)


def load_private_key(pem: str, passphrase: str | None):
    password = passphrase.encode() if passphrase else None
    normalized = normalize_private_key_pem(pem)
    return serialization.load_pem_private_key(normalized.encode(), password=password)


def decrypt_flow_request(
    body: dict[str, Any],
    *,
    private_key_pem: str,
    passphrase: str | None,
) -> tuple[dict, bytes, bytes]:
    """Return (decrypted_payload, aes_key, iv)."""
    try:
        encrypted_aes_key = base64.b64decode(body["encrypted_aes_key"])
        encrypted_flow_data = base64.b64decode(body["encrypted_flow_data"])
        initial_vector = base64.b64decode(body["initial_vector"])
    except Exception as exc:  # noqa: BLE001
        raise FlowCryptoError("Invalid encrypted payload", 421) from exc

    private_key = load_private_key(private_key_pem, passphrase)
    try:
        aes_key = private_key.decrypt(
            encrypted_aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        raise FlowCryptoError("Failed to decrypt AES key", 421) from exc

    # encrypted_flow_data = ciphertext || tag(16)
    if len(encrypted_flow_data) < 16:
        raise FlowCryptoError("Invalid flow data", 421)
    ciphertext, tag = encrypted_flow_data[:-16], encrypted_flow_data[-16:]
    aesgcm = AESGCM(aes_key)
    try:
        plaintext = aesgcm.decrypt(initial_vector, ciphertext + tag, None)
    except Exception as exc:  # noqa: BLE001
        raise FlowCryptoError("Failed to decrypt flow data", 421) from exc

    return json.loads(plaintext.decode("utf-8")), aes_key, initial_vector


def encrypt_flow_response(
    response: dict[str, Any],
    *,
    aes_key: bytes,
    initial_vector: bytes,
) -> str:
    # Flip IV bits as required by Meta Flows endpoint protocol
    flipped_iv = bytes(b ^ 0xFF for b in initial_vector)
    aesgcm = AESGCM(aes_key)
    payload = json.dumps(response).encode("utf-8")
    encrypted = aesgcm.encrypt(flipped_iv, payload, None)  # ciphertext||tag
    return base64.b64encode(encrypted).decode("utf-8")
