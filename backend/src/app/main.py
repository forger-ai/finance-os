"""FastAPI application entry point for FinanceOS Lite."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.cors import allowed_origins
from app.database_ext import init_app_db
from app.forger_context import router as forger_context_router
from app.health import router as health_router
from app.remote_tunnel import RemoteTunnelGuardMiddleware
from app.routes import assistant, budgets, categories, imports, movements, settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="FinanceOS Lite",
        version="0.1.0",
        description="Personal finance API. Backend for the Vite + React frontend.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RemoteTunnelGuardMiddleware)

    @app.on_event("startup")
    def _startup() -> None:
        init_app_db()

    @app.exception_handler(ValueError)
    async def _value_error_handler(_request, exc: ValueError):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    app.include_router(health_router)
    app.include_router(
        forger_context_router,  # pragma: no cover - imported before coverage
    )
    app.include_router(assistant.router)
    app.include_router(categories.router)
    app.include_router(budgets.router)
    app.include_router(movements.router)
    app.include_router(imports.router)
    app.include_router(settings.router)

    return app


app = create_app()
