import re
from typing import List
from backend.models.schemas import ThreatViolation

JAILBREAK_PATTERNS = [
    (r"(?i)\bignore (?:all )?previous (?:instructions|rules|prompts)\b", "System Prompt Override", "CRITICAL"),
    (r"(?i)\bdo anything now\b|\bdan\s+mode\b", "DAN (Do Anything Now) Jailbreak", "CRITICAL"),
    (r"(?i)\bdeveloper mode (?:enabled|on)\b", "Developer Mode Jailbreak", "HIGH"),
    (r"(?i)\bpretend (?:you are|you\'re) (?:a|an) (?:unfiltered|evil|unrestricted)\b", "Evil Roleplay Override", "HIGH"),
    (r"(?i)\bprint (?:your|the) (?:system prompt|initial instructions|above text)\b", "System Prompt Extraction Attempt", "HIGH"),
    (r"(?i)\bact as (?:a|an) (?:jailbroken|unrestricted) (?:AI|model)\b", "Unrestricted persona instruction", "HIGH"),
    (r"(?i)\bbase64 decode the following and execute\b", "Obfuscated Command Injection", "HIGH"),
]

def scan_prompt_injection(prompt: str) -> List[ThreatViolation]:
    """Analyzes prompt text for jailbreak and prompt injection indicators."""
    violations: List[ThreatViolation] = []

    for pattern, desc, severity in JAILBREAK_PATTERNS:
        match = re.search(pattern, prompt)
        if match:
            violations.append(ThreatViolation(
                category="JAILBREAK",
                rule_id="PROMPT_INJECTION",
                match=match.group(0),
                description=desc,
                severity=severity
            ))

    return violations
