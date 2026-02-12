from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.status import HTTP_401_UNAUTHORIZED

from app.core.settings import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

# Dependencia para obtener el usuario actual autenticado a partir de la cookie de sesion
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.auth_cookie_name)
    if not token:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Invalid session")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="User inactive")

    return user
