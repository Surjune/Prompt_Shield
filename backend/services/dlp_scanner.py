import re
import base64
import unicodedata
from typing import Tuple, List
from backend.models.schemas import ThreatViolation

# Regex Patterns for PII and Secrets
# Each entry: rule_id -> (regex_pattern, description, severity, category)
PATTERNS = {
    # ── Financial ─────────────────────────────────────────────────────────────
    "BANK_ACCOUNT": (
        r"(?i)\b(?:account\s*(?:no\.?|number)|a/c|bank\s*account)\s*[:#-]?\s*\d{9,18}\b",
        "Bank Account Number", "CRITICAL", "[PII: Financial Data]"
    ),
    "CREDIT_CARD": (
        r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b",
        "Credit Card Number (Visa/MC/Amex/Discover)", "CRITICAL", "[PII: Financial Data]"
    ),
    "IBAN": (
        r"\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]{0,16})?\b",
        "International Bank Account Number (IBAN)", "CRITICAL", "[PII: Financial Data]"
    ),

    # ── Indian Government IDs ─────────────────────────────────────────────────
    "INDIA_PAN": (
        r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
        "Indian PAN Card Number", "CRITICAL", "[PII: Identity]"
    ),
    "INDIA_AADHAAR": (
        r"\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b",
        "Indian Aadhaar Number", "CRITICAL", "[PII: Identity]"
    ),
    "INDIA_PASSPORT": (
        r"\b[A-PR-WY][1-9][0-9]{5}[1-9]\b",
        "Indian Passport Number", "CRITICAL", "[PII: Identity]"
    ),
    "INDIA_DRIVING_LICENSE": (
        r"\b[A-Z]{2}[0-9]{2}\s?(?:19|20)[0-9]{2}\s?[0-9]{7}\b",
        "Indian Driving License Number", "HIGH", "[PII: Identity]"
    ),
    "INDIA_VPA": (
        r"\b[a-zA-Z0-9._-]{2,}@(?:oksbi|okicici|okhdfcbank|okaxis|ybl|ibl|axl|upi|paytm|apl|waicici|wahdfcbank)\b",
        "Indian UPI / VPA Payment Handle", "HIGH", "[PII: Financial Data]"
    ),

    # ── US Government IDs ─────────────────────────────────────────────────────
    "SSN": (
        r"\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b",
        "US Social Security Number (SSN)", "CRITICAL", "[PII: Identity]"
    ),

    # ── Contact / Identity ────────────────────────────────────────────────────
    "EMAIL": (
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "Email Address", "MEDIUM", "[PII: Contact]"
    ),
    "PHONE_NUMBER": (
        r"\b(?:\+?91[\s\-]?)?[6-9][0-9]{9}\b|\b(?:\+?[1-9]{1,3}[\s\-]?)?(?:\([0-9]{1,4}\)[\s\-]?)?[0-9]{3,4}[\s\-]?[0-9]{3,4}[\s\-]?[0-9]{3,4}\b",
        "Phone / Mobile Number", "HIGH", "[PII: Contact]"
    ),
    "IP_ADDRESS": (
        r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b",
        "IP Address", "MEDIUM", "[PII: Network]"
    ),

    # ── Credentials & Secrets ─────────────────────────────────────────────────
    "OPENAI_KEY": (
        r"\bsk-(?:proj-)?[a-zA-Z0-9_-]{32,}\b",
        "OpenAI API Key", "CRITICAL", "[CREDENTIAL: Secret Key]"
    ),
    "GOOGLE_API_KEY": (
        r"\bAIzaSy[a-zA-Z0-9_-]{33}\b",
        "Google API Key", "CRITICAL", "[CREDENTIAL: Secret Key]"
    ),
    "AWS_KEY": (
        r"\bAKIA[0-9A-Z]{16}\b",
        "AWS Access Key ID", "CRITICAL", "[CREDENTIAL: Secret Key]"
    ),
    "GENERIC_SECRET": (
        r"(?i)\b(?:api[_-]?key|secret[_-]?key|secret[_-]?token|bearer[_-]?token|password|passwd)\s*[:=]\s*['\"]?([a-zA-Z0-9_\-]{20,})['\"]?",
        "Hardcoded Credential / API Token", "CRITICAL", "[CREDENTIAL: Secret Key]"
    ),
    "RSA_PRIVATE_KEY": (
        r"-----BEGIN (?:RSA )?PRIVATE KEY-----",
        "RSA Private Key Header", "CRITICAL", "[CREDENTIAL: Secret Key]"
    ),
}

def normalize_text(text: str) -> str:
    """Decodes unicodedata homoglyphs, extra spaces, and attempts base64 decoding."""
    # Homoglyph normalization (NFKC)
    normalized = unicodedata.normalize('NFKC', text)
    
    # Try decoding embedded Base64 chunks if present
    b64_matches = re.findall(r'[A-Za-z0-9+/]{20,}={0,2}', normalized)
    decoded_chunks = []
    for chunk in b64_matches:
        try:
            decoded = base64.b64decode(chunk).decode('utf-8', errors='ignore')
            if len(decoded) > 5 and any(c.isalnum() for c in decoded):
                decoded_chunks.append(decoded)
        except Exception:
            pass
            
    return normalized + ("\n" + "\n".join(decoded_chunks) if decoded_chunks else "")

def scan_dlp(prompt: str) -> Tuple[str, List[ThreatViolation]]:
    """Scans text for DLP violations and returns redacted text + violation list."""
    violations: List[ThreatViolation] = []
    redacted = prompt
    normalized = normalize_text(prompt)

    for rule_id, rule_info in PATTERNS.items():
        pattern = rule_info[0]
        desc = rule_info[1]
        severity = rule_info[2]
        category = rule_info[3]

        matches = list(re.finditer(pattern, normalized))
        if matches:
            for match in matches:
                match_str = match.group(0)
                # Mask all but first 4 chars for audit log (prevent log becoming a data honeypot)
                masked = match_str[:4] + "****" if len(match_str) > 4 else "****"
                violations.append(ThreatViolation(
                    category=category,
                    rule_id=rule_id,
                    match=masked,
                    description=desc,
                    severity=severity
                ))
            # Redact all occurrences in original prompt text
            redacted = re.sub(pattern, f"[REDACTED_{rule_id}]", redacted)

    return redacted, violations

