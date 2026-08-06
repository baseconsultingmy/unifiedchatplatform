from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "BaseApp Unified API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg2://baseapp:baseapp@db:5432/baseapp"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "https://admin.baseapp.asia,http://localhost:5173"
    bootstrap_admin_email: str = "admin@baseapp.asia"
    bootstrap_admin_password: str = "ChangeMeNow123"
    bootstrap_tenant_name: str = "BaseApp Demo Studio"
    wa_verify_token: str = "baseapp-wa-verify"
    wa_app_secret: str = ""
    meta_access_token: str = ""
    meta_phone_number_id: str = ""
    public_api_base: str = "https://api.baseapp.asia"
    payment_mode: str = "demo"  # demo | hitpay | stripe (hitpay/stripe later)
    # WhatsApp Flows endpoint encryption (PEM or base64 PEM)
    wa_flow_private_key: str = ""
    wa_flow_private_key_password: str = ""
    wa_flow_public_key: str = ""
    # Send draft Flows before Meta publish completes (dev / first setup)
    wa_flow_draft_mode: bool = False
    # Set false when Meta returns #139000 Integrity on Flow sends
    wa_flow_enabled: bool = True
    # Grab Food POS partner credentials (optional; dry-run without them)
    grab_client_id: str = ""
    grab_client_secret: str = ""
    grab_partner_webhook_secret: str = ""
    # Google Identity Services (merchant social login / signup)
    google_client_id: str = ""
    public_admin_base: str = "https://admin.baseapp.asia"
    # Default LIFF app id (optional; tenants may override with line_liff_id)
    line_liff_id: str = ""
    # Cloudflare edge control (Master Admin → Edge)
    cf_api_token: str = ""
    cf_zone: str = "baseapp.asia"
    origin_ip: str = "157.245.149.238"
    # Exabytes / WHMCS API (optional — nameserver changes from Master Admin)
    exabytes_api_url: str = "https://billing.exabytes.my/mypanel"
    exabytes_api_identifier: str = ""
    exabytes_api_secret: str = ""
    exabytes_portal_url: str = "https://billing.exabytes.my/mypanel"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
