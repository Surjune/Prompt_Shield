"use client";
import { useState } from "react";

export default function PolicyToggle({ policy, onUpdate }) {
  const [isEnabled, setIsEnabled] = useState(policy.is_enabled);
  const [riskWeight, setRiskWeight] = useState(policy.risk_weight);
  const [action, setAction] = useState(policy.action_on_trigger);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    const nextState = !isEnabled;
    setIsEnabled(nextState);
    await saveChanges({ is_enabled: nextState });
  };

  const handleWeightChange = async (e) => {
    const val = parseInt(e.target.value, 10);
    setRiskWeight(val);
    await saveChanges({ risk_weight: val });
  };

  const handleActionChange = async (e) => {
    const val = e.target.value;
    setAction(val);
    await saveChanges({ action_on_trigger: val });
  };

  const saveChanges = async (payload) => {
    setSaving(true);
    try {
      await onUpdate(policy.rule_key, payload);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: "#1e293b", padding: "16px 20px", borderRadius: "12px", border: "1px solid #334155", marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <span style={{ fontSize: "15px", fontWeight: "700", color: "#f8fafc" }}>{policy.name}</span>
          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "4px 0 0 0" }}>{policy.description}</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          style={{
            background: isEnabled ? "#0284c7" : "#334155",
            color: "#ffffff",
            border: "none",
            borderRadius: "20px",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: "700",
            cursor: "pointer"
          }}
        >
          {isEnabled ? "ENABLED" : "DISABLED"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", paddingTop: "12px", borderTop: "1px solid #334155" }}>
        <div>
          <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
            Risk Score Penalty Weight: <strong style={{ color: "#f8fafc" }}>{riskWeight}</strong>
          </label>
          <input
            type="range"
            min="10"
            max="100"
            value={riskWeight}
            onChange={handleWeightChange}
            disabled={!isEnabled || saving}
            style={{ width: "100%", accentColor: "#38bdf8" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
            Trigger Enforcement Action:
          </label>
          <select
            value={action}
            onChange={handleActionChange}
            disabled={!isEnabled || saving}
            style={{ background: "#0f172a", color: "#f8fafc", border: "1px solid #475569", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", width: "100%" }}
          >
            <option value="BLOCK">BLOCK (Halt Prompt + Warning Modal)</option>
            <option value="REDACT">REDACT (Sanitize Input Text)</option>
            <option value="ALLOW">ALLOW (Pass to LLM)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
