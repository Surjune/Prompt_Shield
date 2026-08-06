import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "ASIPE Threat & Policy Engine"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "asipe_super_secret_jwt_key_2026_change_in_prod")
    EXTENSION_API_KEY: str = os.getenv("EXTENSION_API_KEY", "asipe-extension-sec-key-v1-9982")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./asipe.db")

    # Risk Thresholds
    RISK_THRESHOLD_BLOCK: int = 70
    RISK_THRESHOLD_REDACT: int = 40

    # Enabled Security Modules
    ENABLE_DLP_SCAN: bool = True
    ENABLE_INJECTION_SCAN: bool = True
    ENABLE_AUDIT_LOGGING: bool = True

    class Config:
        case_sensitive = True

settings = Settings()
