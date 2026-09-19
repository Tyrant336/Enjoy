"""Application settings — one config loader, one way (AGENTS.md §3).

All values come from the environment (optionally via the repo-root `.env`).
Missing `DATABASE_URL` crashes startup with a clear ValidationError (fail loudly).
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root: app/core/config.py -> core -> app -> Backend -> <repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required — no default. Startup fails loudly if absent (AGENTS.md §5.7).
    database_url: str

    # NO DEMO MODE (REQUIREMENTS §4.2, AGENTS.md §3.4): one runtime path only.
    # OpenRouter is required — missing key crashes startup with a clear error.
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str | None = None

    backend_host: str = "127.0.0.1"
    backend_port: int = 8000

    frontend_origin: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    # database_url is supplied from env / .env at runtime; pydantic-settings'
    # env-source injection is invisible to mypy, hence the narrow ignore.
    return Settings()  # type: ignore[call-arg]
