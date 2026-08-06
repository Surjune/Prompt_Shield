"use client";

export default function ThreatFeed({ logs = [], error = null, loading = false }) {
  const getBadgeStyle = (action) => {
    switch (action) {
      case "BLOCK":
        return { background: "#991b1b", color: "#fef2f2", border: "1px solid #dc2626" };
      case "REDACT":
        return { background: "#854d0e", color: "#fefce8", border: "1px solid #ca8a04" };
      default:
        return { background: "#14532d", color: "#f0fdf4", border: "1px solid #16a34a" };
    }
  };

  return (
    <div style={{ background: "#1e293b", borderRadius: "12px", border: "1px solid #334155", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>Real-Time Intercepted Prompts</h3>
        <span style={{ fontSize: "12px", color: "#64748b" }}>Live Database Feed ({logs.length} events)</span>
      </div>

      {error ? (
        <div style={{ padding: "24px", color: "#ef4444", background: "#450a0a", fontSize: "13px" }}>
          ⚠️ Backend Database Connection Error: {error}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <th style={{ padding: "12px 16px" }}>Timestamp</th>
                <th style={{ padding: "12px 16px" }}>Platform</th>
                <th style={{ padding: "12px 16px" }}>Action</th>
                <th style={{ padding: "12px 16px" }}>Risk Score</th>
                <th style={{ padding: "12px 16px" }}>Prompt Hash</th>
                <th style={{ padding: "12px 16px" }}>Violations Summary</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    Fetching real-time records from FastAPI database...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    No security events in SQLite database. Intercepted prompts will populate here live.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  let violations = [];
                  try { violations = JSON.parse(log.violations_json || "[]"); } catch (e) {}

                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid #334155", color: "#cbd5e1" }}>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: "600" }}>{log.platform}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", ...getBadgeStyle(log.action) }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: "700", color: log.risk_score > 60 ? "#ef4444" : "#eab308" }}>
                        {log.risk_score}/100
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "#94a3b8" }}>
                        {log.prompt_hash ? log.prompt_hash.substring(0, 12) + "..." : "N/A"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {violations.map((v, i) => (
                          <span key={i} style={{ background: "#0f172a", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", marginRight: "4px", border: "1px solid #475569" }}>
                            {v.category}: {v.description}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
