import re
import base64
import unicodedata
from typing import Tuple, List
from backend.models.schemas import ThreatViolation

# Regex Patterns for PII and Secrets
PATTERNS = {
    "CREDIT_CARD": (
        r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b",
        "Credit Card / PAN Number", "CRITICAL"
    ),
    "SSN": (
        r"\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b",
        "Social Security Number (SSN)", "CRITICAL"
    ),
    "EMAIL": (
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "Email Address", "MEDIUM"
    ),
    "AWS_KEY": (
        r"\b(AKIA[0-9A-Z]{16})\b",
        "AWS Access Key ID", "CRITICAL"
    ),
    "OPENAI_KEY": (
        r"\bsk-[a-zA-Z0-9]{32,64}\b",
        "OpenAI API Key", "CRITICAL"
    ),
    "GENERIC_SECRET": (
        r"(?i)\b(?:api[_-]?key|secret[_-]?token|bearer[_-]?token|password|passwd)\s*[:=]\s*['\"]?([A-Za-z0-9-_]{16,64})['\"]?",
        "Hardcoded Credential / API Token", "HIGH"
    ),
    "RSA_PRIVATE_KEY": (
        r"-----BEGIN (?:RSA )?PRIVATE KEY-----",
        "RSA Private Key Header", "CRITICAL"
    )
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

    for rule_id, (pattern, desc, severity) in PATTERNS.items():
        matches = re.findall(pattern, normalized)
        if matches:
            for match in matches:
                match_str = match[0] if isinstance(match, tuple) else match
                violations.append(ThreatViolation(
                    category="PII" if rule_id in ["CREDIT_CARD", "SSN", "EMAIL"] else "CREDENTIAL",
                    rule_id=rule_id,
                    match=match_str[:4] + "****" if len(match_str) > 4 else "****",
                    description=desc,
                    severity=severity
                ))
            # Redact in original prompt
            redacted = re.sub(pattern, f"[REDACTED_{rule_id}]", redacted)

    return redacted, violations
