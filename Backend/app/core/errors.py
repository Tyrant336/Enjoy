"""API error envelope — §5.2: all 4xx/5xx from OUR code, never raw framework
errors (AGENTS.md §2.5: errors must reach the user as errors)."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas import ErrorEnvelope

logger = logging.getLogger("enjoy.errors")


class AppError(Exception):
    """The ONE way our code raises HTTP errors — always becomes the §5.2
    error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: dict[str, Any] | None = None,
        recoverable: bool = True,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail
        self.recoverable = recoverable


def _envelope_response(
    status_code: int, envelope: ErrorEnvelope
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json", by_alias=True),
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_req: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "AppError %s (%s): %s detail=%s", exc.code, exc.status_code, exc.message,
            exc.detail,
        )
        return _envelope_response(
            exc.status_code,
            ErrorEnvelope(
                code=exc.code,
                message=exc.message,
                detail=exc.detail,
                recoverable=exc.recoverable,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _req: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # REST response only (no SSE event), per §5.2.
        return _envelope_response(
            422,
            ErrorEnvelope(
                code="VALIDATION_ERROR",
                message="The request did not match the expected shape.",
                detail={"errors": exc.errors()},
                recoverable=True,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        _req: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return _envelope_response(
            exc.status_code,
            ErrorEnvelope(
                code="NOT_FOUND" if exc.status_code == 404 else f"HTTP_{exc.status_code}",
                message=str(exc.detail),
                detail=None,
                recoverable=exc.status_code < 500,
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_req: Request, exc: Exception) -> JSONResponse:
        # Loud: full traceback in logs AND an explicit envelope to the client.
        # Never a silent empty world (AGENTS.md §2.5).
        logger.exception("Unhandled error: %s", exc)
        return _envelope_response(
            500,
            ErrorEnvelope(
                code="INTERNAL_ERROR",
                message="Something broke in the harbour. The error has been logged.",
                detail={"exception": type(exc).__name__},
                recoverable=False,
            ),
        )
