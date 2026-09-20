"""FastAPI app factory — enjoy backend (REQUIREMENTS §4.1).

Phase 1: app factory, CORS, /health, §5.2 error envelope, identity dep,
seeded-data read endpoints + SSE outbox stream (app/api/, app/services/).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.agents.flashcards.apkg import STATIC_DECKS_DIR
from app.api import agents, chat, world
from app.core.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()  # crashes loudly here if DATABASE_URL is missing

    app = FastAPI(title="enjoy — Harbour of Learning")
    register_error_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(world.router)
    app.include_router(agents.router)
    app.include_router(chat.router)

    # Generated .apkg exports (FR-2.3) are served as static files.
    STATIC_DECKS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/static",
        StaticFiles(directory=STATIC_DECKS_DIR.parent),
        name="static",
    )

    @app.get("/health")
    async def health() -> dict[str, object]:
        return {"status": "ok"}

    return app


app = create_app()
