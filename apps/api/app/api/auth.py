from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.status import HTTP_401_UNAUTHORIZED

from app.services.auth import get_current_user
from app.core.settings import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.services.system_conf import is_registration_enabled, verify_admin_password
from app.db.session import get_db
from app.models.user import User
from app.models.system_conf import SystemSetting
from app.schemas.user import UserCreate, UserLogin, UserOut
from app.schemas.system import RegistrationToggle

#Auth Router
router = APIRouter(prefix="/api/auth", tags=["auth"])
# Domain Restriction Missing
def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
        secure=settings.auth_cookie_secure,
        max_age=settings.auth_token_ttl_minutes * 60,
        path="/",
    )

@router.post(
    "/login",
    summary="User login",
    description="Authenticate user and set access token in HTTP-only cookie",
    response_model=UserOut,
    status_code=200,
    responses={
        401: {"description": "Invalid credentials"},
    },
)
def login(
    payload: UserLogin,
    response: Response,
    db: Session = Depends(get_db),
):
    username = payload.username.lower().strip()

    user = db.execute(
        select(User).where(User.username == username)
    ).scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    token = create_access_token(user.id)
    _set_auth_cookie(response, token)

    return user

@router.post(
    "/register",
    response_model=UserOut,
    status_code=201,
    summary="Register a new user",
    description=(
        "Creates a new user account if registration is enabled. "
        "On success, an authentication cookie is set."
    ),
    tags=["auth"],
    responses={
        201: {"description": "User successfully created"},
        400: {"description": "Invalid username"},
        403: {"description": "User registration is disabled"},
        409: {"description": "User already exists"},
    },
)
def register(
    payload: UserCreate,
    response: Response,
    db: Session = Depends(get_db),
):
    if not is_registration_enabled(db):
        raise HTTPException(
            status_code=403,
            detail="User registration is disabled",
        )

    username = payload.username.lower().strip()
    if not username:
        raise HTTPException(
            status_code=400,
            detail="Username is required",
        )

    existing = db.execute(
        select(User).where(User.username == username)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="User already exists",
        )

    user = User(
        username=username,
        password_hash=hash_password(payload.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    _set_auth_cookie(response, token)

    return user

@router.post(
    "/disable-registration",
    summary="Enable or disable user registration",
    description=(
        "Allows an administrator to enable or disable user registration "
        "globally using an admin secret."
    ),
    tags=["admin"],
    responses={
        200: {"description": "Registration state updated"},
        401: {"description": "Invalid admin password"},
    },
)
def toggle_registration(
    payload: RegistrationToggle,
    db: Session = Depends(get_db),
):
    if not verify_admin_password(payload.admin_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid admin password",
        )

    setting = db.get(SystemSetting, "registration_enabled")

    if not setting:
        setting = SystemSetting(
            key="registration_enabled",
            value=payload.enabled,
        )
        db.add(setting)
    else:
        setting.value = payload.enabled

    db.commit()

    return {
        "registration_enabled": setting.value,
    }

@router.post(
    "/logout",
    summary="Logout current user",
    description=(
        "Logs out the currently authenticated user by deleting "
        "the authentication cookie."
    ),
    tags=["auth"],
    responses={
        200: {"description": "User successfully logged out"},
    },
)
def logout(response: Response):
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
    )
    return {"ok": True}

@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current user",
    description="Returns the currently authenticated user.",
    tags=["auth"],
    responses={
        200: {"description": "Authenticated user data"},
        401: {"description": "Not authenticated"},
    },
)
def me(
    current_user: User = Depends(get_current_user),
):
    return current_user

