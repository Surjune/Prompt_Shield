from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

class PromptScanRequest(BaseModel):
    prompt: str = Field(..., description="Raw text prompt to analyze")
    platform: str = Field(..., description="Target platform: ChatGPT, Gemini, etc.")
    user_id: Optional[str] = Field(default="anonymous_user")

class ThreatViolation(BaseModel):
    category: str  # PII, CREDENTIAL, JAILBREAK, PROMPT_INJECTION
    rule_id: str
    match: str
    description: str
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL

class ScanResponse(BaseModel):
    is_safe: bool
    risk_score: float
    action: str  # ALLOW, REDACT, BLOCK
    sanitized_prompt: Optional[str] = None
    violations: List[ThreatViolation] = []
    scan_time_ms: float

class PolicyUpdateDTO(BaseModel):
    is_enabled: Optional[bool] = None
    risk_weight: Optional[int] = None
    action_on_trigger: Optional[str] = None

class PolicyDTO(BaseModel):
    id: int
    rule_key: str
    name: str
    description: str
    is_enabled: bool
    risk_weight: int
    action_on_trigger: str

    class Config:
        from_attributes = True

class AuditLogDTO(BaseModel):
    id: int
    timestamp: datetime
    user_id: str
    platform: str
    prompt_hash: str
    redacted_prompt: Optional[str]
    risk_score: float
    action: str
    violations_json: str

    @field_validator('timestamp', mode='after')
    def ensure_utc_tz(cls, v: datetime) -> datetime:
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    class Config:
        from_attributes = True

