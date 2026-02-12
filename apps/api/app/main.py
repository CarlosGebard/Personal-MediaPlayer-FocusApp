from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.routers.focus_sessions import router as focus_sessions_router
from app.api.routers.goal_logs import router as goal_logs_router
from app.api.routers.goal_revisions import router as goal_revisions_router
from app.api.routers.goals import router as goals_router
from app.api.routers.stats import router as stats_router
from app.core.settings import settings
from app.core.logging import setup_logging

setup_logging()

app = FastAPI(title=settings.app_name, version=settings.api_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(goals_router)
app.include_router(goal_revisions_router)
app.include_router(goal_logs_router)
app.include_router(focus_sessions_router)
app.include_router(stats_router)


@app.get("/api/health", summary="Health check")
def health_check():
    return {"status": "ok"}
