from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models.db_models import SecurityPolicy
from backend.models.schemas import PolicyDTO, PolicyUpdateDTO

router = APIRouter(prefix="/policies", tags=["Policies"])

DEFAULT_POLICIES = [
    {"rule_key": "CREDIT_CARD", "name": "Block Credit Cards (PAN)", "description": "Detects and blocks credit card numbers", "is_enabled": True, "risk_weight": 85, "action_on_trigger": "BLOCK"},
    {"rule_key": "SSN", "name": "Block SSN Data Leaks", "description": "Detects US Social Security Numbers", "is_enabled": True, "risk_weight": 90, "action_on_trigger": "BLOCK"},
    {"rule_key": "EMAIL", "name": "Redact Email Addresses", "description": "Identifies email addresses and redacts them", "is_enabled": True, "risk_weight": 30, "action_on_trigger": "REDACT"},
    {"rule_key": "OPENAI_KEY", "name": "Block API Keys & Credentials", "description": "Prevents secret credential transmission", "is_enabled": True, "risk_weight": 95, "action_on_trigger": "BLOCK"},
    {"rule_key": "PROMPT_INJECTION", "name": "Block Jailbreaks & DAN Prompts", "description": "Prevents roleplay overrides and injection attacks", "is_enabled": True, "risk_weight": 80, "action_on_trigger": "BLOCK"}
]

def seed_default_policies_if_empty(db: Session):
    if db.query(SecurityPolicy).count() == 0:
        for p in DEFAULT_POLICIES:
            db.add(SecurityPolicy(**p))
        db.commit()

@router.get("", response_model=List[PolicyDTO])
def get_policies(db: Session = Depends(get_db)):
    seed_default_policies_if_empty(db)
    return db.query(SecurityPolicy).all()

@router.put("/{rule_key}", response_model=PolicyDTO)
def update_policy(rule_key: str, update: PolicyUpdateDTO, db: Session = Depends(get_db)):
    seed_default_policies_if_empty(db)
    policy = db.query(SecurityPolicy).filter(SecurityPolicy.rule_key == rule_key).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy rule key not found")

    if update.is_enabled is not None:
        policy.is_enabled = update.is_enabled
    if update.risk_weight is not None:
        policy.risk_weight = update.risk_weight
    if update.action_on_trigger is not None:
        policy.action_on_trigger = update.action_on_trigger

    db.commit()
    db.refresh(policy)
    return policy
