from __future__ import annotations

from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.settings import settings

engine = None
SessionLocal: Optional[sessionmaker[Session]] = None


def init_engine() -> None:
    global engine, SessionLocal
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    if SessionLocal is None:
        init_engine()
    if SessionLocal is None:
        raise RuntimeError("SessionLocal is not initialized")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
