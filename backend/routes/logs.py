import csv
import io
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.models.db_models import AuditLog
from backend.models.schemas import AuditLogDTO

router = APIRouter(prefix="/logs", tags=["Audit Logs"])

@router.get("", response_model=List[AuditLogDTO])
def get_audit_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = None,
    platform: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action.upper())
    if platform:
        query = query.filter(AuditLog.platform.ilike(f"%{platform}%"))

    return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

@router.get("/stats")
def get_audit_stats(db: Session = Depends(get_db)):
    total = db.query(AuditLog).count()
    blocked = db.query(AuditLog).filter(AuditLog.action == "BLOCK").count()
    redacted = db.query(AuditLog).filter(AuditLog.action == "REDACT").count()
    allowed = db.query(AuditLog).filter(AuditLog.action == "ALLOW").count()

    return {
        "total_scans": total,
        "total_blocked": blocked,
        "total_redacted": redacted,
        "total_allowed": allowed,
        "block_rate": round((blocked / total * 100), 1) if total > 0 else 0.0
    }

@router.get("/export")
def export_audit_logs_csv(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "User ID", "Platform", "Prompt Hash", "Risk Score", "Action", "Violations"])

    for log in logs:
        writer.writerow([
            log.id,
            log.timestamp.isoformat(),
            log.user_id,
            log.platform,
            log.prompt_hash,
            log.risk_score,
            log.action,
            log.violations_json
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=asipe_audit_logs.csv"}
    )
