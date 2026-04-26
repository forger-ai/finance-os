"""FastAPI application entry point for FinanceOS Lite."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import init_db
from app.routes import categories, health, imports, movements


def _allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5180,http://127.0.0.1:5180")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(
        title="FinanceOS Lite",
        version="0.1.0",
        description="Personal finance API. Backend for the Vite + React frontend.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    @app.exception_handler(ValueError)
    async def _value_error_handler(_request, exc: ValueError):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    app.include_router(health.router)
    app.include_router(categories.router)
    app.include_router(movements.router)
    app.include_router(imports.router)

    return app


app = create_app()
