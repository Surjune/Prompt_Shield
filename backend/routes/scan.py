import time
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.schemas import PromptScanRequest, ScanResponse
from backend.services.dlp_scanner import scan_dlp
from backend.services.injection_classifier import scan_prompt_injection
from backend.services.risk_engine import calculate_risk
from backend.services.audit_logger import log_audit_event
from backend.config import settings

router = APIRouter(prefix="/scan-prompt", tags=["Scan Engine"])

def verify_extension_key(x_extension_key: str = Header(None)):
    """Verifies X-Extension-Key security header."""
    if x_extension_key != settings.EXTENSION_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Extension-Key header"
        )
    return x_extension_key

@router.post("", response_model=ScanResponse)
def scan_prompt(
    request: PromptScanRequest,
    db: Session = Depends(get_db),
    key: str = Depends(verify_extension_key)
):
    start_time = time.time()
    all_violations = []
    sanitized_text = request.prompt

    # 1. Execute DLP Scanning
    if settings.ENABLE_DLP_SCAN:
        sanitized_text, dlp_violations = scan_dlp(request.prompt)
        all_violations.extend(dlp_violations)

    # 2. Execute Prompt Injection & Jailbreak Scanning
    if settings.ENABLE_INJECTION_SCAN:
        injection_violations = scan_prompt_injection(request.prompt)
        all_violations.extend(injection_violations)

    # 3. Calculate Composite Risk Score and Action
    risk_score, action, is_safe = calculate_risk(all_violations, db)

    # 4. Record Audit Log (SHA-256 hashed & sanitized)
    log_audit_event(
        db=db,
        prompt=request.prompt,
        platform=request.platform,
        user_id=request.user_id or "anonymous_user",
        risk_score=risk_score,
        action=action,
        violations=all_violations,
        redacted_prompt=sanitized_text if action == "REDACT" else None
    )

    elapsed_ms = round((time.time() - start_time) * 1000, 2)

    return ScanResponse(
        is_safe=is_safe,
        risk_score=risk_score,
        action=action,
        sanitized_prompt=sanitized_text if action == "REDACT" else None,
        violations=all_violations,
        scan_time_ms=elapsed_ms
    )
