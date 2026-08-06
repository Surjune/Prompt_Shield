from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float
from datetime import datetime, timezone
from backend.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, index=True)
    user_id = Column(String, index=True, default="anonymous_user")
    platform = Column(String, index=True)  # e.g., ChatGPT, Gemini
    prompt_hash = Column(String, index=True)  # SHA-256 hash of original prompt
    redacted_prompt = Column(Text, nullable=True)  # Safe redacted version
    risk_score = Column(Float, index=True)
    action = Column(String, index=True)  # ALLOW, REDACT, BLOCK
    violations_json = Column(Text)  # JSON string of detected threats

class SecurityPolicy(Base):
    __tablename__ = "security_policies"

    id = Column(Integer, primary_key=True, index=True)
    rule_key = Column(String, unique=True, index=True)  # e.g., strict_pii, block_jailbreaks
    name = Column(String)
    description = Column(String)
    is_enabled = Column(Boolean, default=True)
    risk_weight = Column(Integer, default=50)  # Added to composite risk score if violated
    action_on_trigger = Column(String, default="BLOCK")  # BLOCK, REDACT, ALLOW
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

