"use client";
import { getExportUrl } from "../lib/api";

export default function ExportModal() {
  const handleExport = () => {
    window.open(getExportUrl(), "_blank");
  };

  return (
    <div style={{ background: "#1e293b", padding: "16px 20px", borderRadius: "12px", border: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h4 style={{ fontSize: "14px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>Compliance Audit Reports</h4>
        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "4px 0 0 0" }}>Export structured security audit logs for SOC2, HIPAA, and GDPR compliance validation.</p>
      </div>
      <button
        onClick={handleExport}
        style={{
          background: "#059669",
          color: "#ffffff",
          border: "none",
          padding: "8px 16px",
          borderRadius: "6px",
          fontWeight: "700",
          fontSize: "13px",
          cursor: "pointer"
        }}
      >
        Export Audit CSV
      </button>
    </div>
  );
}
