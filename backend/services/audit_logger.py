import hashlib
import json
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.models.db_models import AuditLog
from backend.models.schemas import ThreatViolation
from backend.config import settings

def log_audit_event(
    db: Session,
    prompt: str,
    platform: str,
    user_id: str,
    risk_score: float,
    action: str,
    violations: List[ThreatViolation],
    redacted_prompt: Optional[str] = None
) -> AuditLog:
    """Hashes original prompt with SHA-256 and writes redacted audit record to SQLite."""
    if not settings.ENABLE_AUDIT_LOGGING:
        return None

    prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()
    
    # Store redacted prompt or sanitized placeholder
    safe_prompt_record = redacted_prompt if action == "REDACT" else (
        "[BLOCKED_CONTENT_NOT_STORED]" if action == "BLOCK" else prompt[:100] + "..."
    )

    violations_serialized = json.dumps([v.model_dump() for v in violations])

    log_entry = AuditLog(
        user_id=user_id,
        platform=platform,
        prompt_hash=prompt_hash,
        redacted_prompt=safe_prompt_record,
        risk_score=risk_score,
        action=action,
        violations_json=violations_serialized
    )

    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
