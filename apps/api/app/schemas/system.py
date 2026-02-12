from __future__ import annotations
from pydantic import BaseModel

class RegistrationToggle(BaseModel):
    enabled: bool
    admin_password: str