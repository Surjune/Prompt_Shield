"use client";
import { useEffect, useState } from "react";
import { fetchAuditLogs } from "../../lib/api";
import ThreatFeed from "../../components/ThreatFeed";
import ExportModal from "../../components/ExportModal";

export default function LogsPage() {
  const [filter, setFilter] = useState("");
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    async function loadLogs() {
      const data = await fetchAuditLogs(filter, 100);
      setLogs(data);
    }
    loadLogs();
  }, [filter]);

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#f8fafc", margin: "0 0 4px 0" }}>Security Audit Logs</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>Inspect detailed prompt hashes, risk scores, and enforcement decisions.</p>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
        <button
          onClick={() => setFilter("")}
          style={{ background: filter === "" ? "#0284c7" : "#1e293b", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
        >
          All Logs
        </button>
        <button
          onClick={() => setFilter("BLOCK")}
          style={{ background: filter === "BLOCK" ? "#dc2626" : "#1e293b", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
        >
          Blocked Only
        </button>
        <button
          onClick={() => setFilter("REDACT")}
          style={{ background: filter === "REDACT" ? "#ca8a04" : "#1e293b", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
        >
          Redacted Only
        </button>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <ExportModal />
      </div>

      <ThreatFeed logs={logs} />
    </div>
  );
}
