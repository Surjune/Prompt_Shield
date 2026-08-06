"use client";
import { useEffect, useState } from "react";
import { fetchStats, fetchAuditLogs } from "../lib/api";
import RiskCharts from "../components/RiskCharts";
import ThreatFeed from "../components/ThreatFeed";

export default function OverviewPage() {
  const [stats, setStats] = useState({ total_scans: 0, total_blocked: 0, total_redacted: 0, total_allowed: 0, block_rate: 0.0 });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    async function loadData() {
      const s = await fetchStats();
      const l = await fetchAuditLogs("", 10);
      setStats(s);
      setLogs(l);
    }
    loadData();
    const timer = setInterval(loadData, 3000); // Live poll every 3 seconds
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#f8fafc", margin: "0 0 4px 0" }}>Executive Governance Dashboard</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>Real-time telemetry and prompt interception metrics across enterprise LLM tools.</p>
      </div>

      {/* Metric Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#1e293b", padding: "16px 20px", borderRadius: "12px", border: "1px solid #334155" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>Total Intercepted Scans</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#38bdf8", marginTop: "4px" }}>{stats.total_scans}</div>
        </div>

        <div style={{ background: "#1e293b", padding: "16px 20px", borderRadius: "12px", border: "1px solid #334155" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>Blocked Data Leaks</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#ef4444", marginTop: "4px" }}>{stats.total_blocked}</div>
        </div>

        <div style={{ background: "#1e293b", padding: "16px 20px", borderRadius: "12px", border: "1px solid #334155" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>Sanitized / Redacted</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#eab308", marginTop: "4px" }}>{stats.total_redacted}</div>
        </div>

        <div style={{ background: "#1e293b", padding: "16px 20px", borderRadius: "12px", border: "1px solid #334155" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>Threat Block Rate</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#22c55e", marginTop: "4px" }}>{stats.block_rate}%</div>
        </div>
      </div>

      <RiskCharts stats={stats} />
      <ThreatFeed logs={logs} />
    </div>
  );
}
