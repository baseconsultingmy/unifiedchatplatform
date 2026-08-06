"""Map shop country → display / settlement currency."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Tenant

# Supported BaseApp markets (ISO-3166-1 alpha-2 → ISO-4217).
COUNTRY_CURRENCY: dict[str, str] = {
    "MY": "MYR",
    "TH": "THB",
    "SG": "SGD",
    "ID": "IDR",
}

COUNTRY_TIMEZONE: dict[str, str] = {
    "MY": "Asia/Kuala_Lumpur",
    "TH": "Asia/Bangkok",
    "SG": "Asia/Singapore",
    "ID": "Asia/Jakarta",
}

DEFAULT_COUNTRY = "MY"
DEFAULT_CURRENCY = "MYR"


def normalize_country(raw: str | None) -> str:
    code = (raw or DEFAULT_COUNTRY).strip().upper()[:2]
    return code if len(code) == 2 else DEFAULT_COUNTRY


def currency_for_country(country: str | None) -> str:
    return COUNTRY_CURRENCY.get(normalize_country(country), DEFAULT_CURRENCY)


def timezone_for_country(country: str | None) -> str:
    return COUNTRY_TIMEZONE.get(normalize_country(country), COUNTRY_TIMEZONE[DEFAULT_COUNTRY])


def tenant_currency(tenant: "Tenant | None") -> str:
    if tenant is None:
        return DEFAULT_CURRENCY
    return currency_for_country(getattr(tenant, "country", None))
