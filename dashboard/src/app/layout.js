import Navbar from "../components/Navbar";

export const metadata = {
  title: "ASIPE Admin & Governance Console",
  description: "Real-time AI Security Interceptor & Policy Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <Navbar />
        <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
