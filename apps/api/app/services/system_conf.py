# services/system_settings.py

from sqlalchemy.orm import Session
from app.models.system_conf import SystemSetting
from app.core.settings import settings

REGISTRATION_KEY = "registration_enabled"

def is_registration_enabled(db: Session) -> bool:
    setting = db.get(SystemSetting, REGISTRATION_KEY)
    return bool(setting and setting.value)

def verify_admin_password(password: str) -> bool:
    return password == settings.admin_secret
