from typing import List, Tuple
from sqlalchemy.orm import Session
from backend.models.schemas import ThreatViolation
from backend.models.db_models import SecurityPolicy
from backend.config import settings

SEVERITY_WEIGHTS = {
    "LOW": 15,
    "MEDIUM": 30,
    "HIGH": 55,
    "CRITICAL": 85
}

def calculate_risk(violations: List[ThreatViolation], db: Session) -> Tuple[float, str, bool]:
    """Calculates risk score (0-100) and enforcement decision (ALLOW, REDACT, BLOCK)."""
    if not violations:
        return 0.0, "ALLOW", True

    base_score = 0.0
    must_block = False
    must_redact = False

    # Fetch dynamic policy rules from SQLite if available
    policies = {p.rule_key: p for p in db.query(SecurityPolicy).all()} if db else {}

    for v in violations:
        weight = SEVERITY_WEIGHTS.get(v.severity, 20)
        
        # Override with active policy setting if present
        rule_policy = policies.get(v.rule_id)
        if rule_policy:
            if not rule_policy.is_enabled:
                continue  # Rule disabled by admin
            weight = rule_policy.risk_weight
            if rule_policy.action_on_trigger == "BLOCK":
                must_block = True
            elif rule_policy.action_on_trigger == "REDACT":
                must_redact = True

        base_score += weight
        if v.severity == "CRITICAL":
            must_block = True

    # Clamp composite score to 100
    risk_score = min(100.0, base_score)

    if must_block or risk_score >= settings.RISK_THRESHOLD_BLOCK:
        action = "BLOCK"
        is_safe = False
    elif must_redact or risk_score >= settings.RISK_THRESHOLD_REDACT:
        action = "REDACT"
        is_safe = False
    else:
        action = "ALLOW"
        is_safe = True

    return risk_score, action, is_safe
