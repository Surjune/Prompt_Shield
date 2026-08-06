"use client";
import { useEffect, useState } from "react";
import { fetchPolicies, updatePolicy } from "../../lib/api";
import PolicyToggle from "../../components/PolicyToggle";

export default function PoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await fetchPolicies();
      setPolicies(data);
      setLoading(false);
    }
    load();
  }, []);

  const handlePolicyUpdate = async (ruleKey, payload) => {
    const updated = await updatePolicy(ruleKey, payload);
    setPolicies((prev) => prev.map((p) => (p.rule_key === ruleKey ? updated : p)));
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#f8fafc", margin: "0 0 4px 0" }}>Policy Rules & Threat Thresholds</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>Configure enterprise DLP scanning rules, risk score weights, and enforcement triggers.</p>
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", padding: "24px 0" }}>Loading active security policies...</div>
      ) : (
        <div>
          {policies.map((policy) => (
            <PolicyToggle key={policy.rule_key} policy={policy} onUpdate={handlePolicyUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
