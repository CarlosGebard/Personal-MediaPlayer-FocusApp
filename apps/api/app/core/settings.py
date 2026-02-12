from typing import Literal
from functools import cached_property
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Pydantic settings config ---
    model_config = SettingsConfigDict(
        extra="ignore",
    )

    # --- App ---
    app_name: str = "Ethos API"
    api_version: str = "1.0.1"

    # --- Core / required ---
    database_url: str = Field(alias="DATABASE_URL")
    auth_secret: str = Field(alias="AUTH_SECRET")

    # --- API ---
    cors_origins: str = Field(default="", alias="CORS_ORIGINS")
    admin_secret: str = Field(alias="ADMIN_SECRET")
    # --- Media / logging ---
    media_root: str = Field(default="/data/media", alias="MEDIA_ROOT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # --- Auth / cookies ---
    auth_cookie_name: str = Field(
        default="ethos_session", alias="AUTH_COOKIE_NAME"
    )
    auth_cookie_secure: bool = Field(
        default=False, alias="AUTH_COOKIE_SECURE"
    )
    auth_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", alias="AUTH_COOKIE_SAMESITE"
    )
    auth_token_ttl_minutes: int = Field(
        default=60 * 24 * 7, alias="AUTH_TOKEN_TTL_MINUTES"
    )

    @cached_property
    def cors_list(self) -> list[str]:
        if not self.cors_origins:
            return []
        return [origin.strip() for origin in self.cors_origins.split(",")]

# Singleton-style access
settings = Settings() # type: ignore
