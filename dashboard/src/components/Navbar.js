"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Activity, FileText, Settings } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Overview", href: "/", icon: Activity },
    { name: "Audit Logs", href: "/logs", icon: FileText },
    { name: "Policy Manager", href: "/policies", icon: Settings },
  ];

  return (
    <nav style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "12px 24px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Shield style={{ width: "28px", height: "28px", color: "#38bdf8" }} />
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc" }}>ASIPE Platform</div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>AI Security & Governance Portal</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  textDecoration: "none",
                  background: active ? "#1e293b" : "transparent",
                  color: active ? "#38bdf8" : "#94a3b8"
                }}
              >
                <Icon style={{ width: "16px", height: "16px" }} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
