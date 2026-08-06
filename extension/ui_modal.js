class ASIPEUIModal {
  constructor() {
    this.modalId = "asipe-security-warning-overlay";
    this.injectStyles();
  }

  // For <style> / <link> elements that belong in <head>
  safeAppendToHead(element) {
    if (!element) return;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(element);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        const deferredTarget = document.head || document.documentElement;
        if (deferredTarget) deferredTarget.appendChild(element);
      }, { once: true });
    }
  }

  // For visible <div> overlays that must be in <body>
  safeAppendToBody(element) {
    if (!element) return;
    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(element);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        const deferredTarget = document.body || document.documentElement;
        if (deferredTarget) deferredTarget.appendChild(element);
      }, { once: true });
    }
  }

  injectStyles() {
    if (document.getElementById("asipe-styles")) return;
    const style = document.createElement("style");
    style.id = "asipe-styles";
    style.textContent = `
      #asipe-security-warning-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(8px);
        z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .asipe-modal-card {
        background: #1e293b; color: #f8fafc;
        border: 1px solid #dc2626; border-radius: 12px;
        width: 480px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
      }
      .asipe-modal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
      .asipe-modal-title { font-size: 20px; font-weight: 700; color: #ef4444; }
      .asipe-badge { background: #991b1b; color: #fef2f2; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
      .asipe-violation-list { background: #0f172a; border-radius: 8px; padding: 12px; margin: 16px 0; max-height: 150px; overflow-y: auto; }
      .asipe-violation-item { font-size: 13px; color: #cbd5e1; margin-bottom: 8px; border-left: 3px solid #f87171; padding-left: 8px; }
      .asipe-modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
      .asipe-btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; }
      .asipe-btn-close { background: #dc2626; color: white; }
      .asipe-btn-close:hover { background: #b91c1c; }
    `;
    this.safeAppendToHead(style);
  }

  showBlockModal(violations, riskScore, onDismiss) {
    this.closeModal();

    const overlay = document.createElement("div");
    overlay.id = this.modalId;

    const violationsHTML = violations.map(v => `
      <div class="asipe-violation-item">
        <strong>[${v.category}] ${v.description}</strong><br/>
        <span style="color: #94a3b8">Match: ${v.match} (Severity: ${v.severity})</span>
      </div>
    `).join("");

    overlay.innerHTML = `
      <div class="asipe-modal-card">
        <div class="asipe-modal-header">
          <div class="asipe-badge">BLOCKED (Risk Score: ${riskScore}/100)</div>
          <div class="asipe-modal-title">Security Policy Violation</div>
        </div>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 12px;">
          Your prompt was intercepted and blocked by ASIPE to prevent potential data leakage or security policy violations.
        </p>
        <div class="asipe-violation-list">
          ${violationsHTML}
        </div>
        <div class="asipe-modal-footer">
          <button id="asipe-close-btn" class="asipe-btn asipe-btn-close">Acknowledge & Edit Prompt</button>
        </div>
      </div>
    `;

    this.safeAppendToBody(overlay);

    const closeBtn = document.getElementById("asipe-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.closeModal();
        if (onDismiss) onDismiss();
      });
    }
  }

  closeModal() {
    const existing = document.getElementById(this.modalId);
    if (existing) existing.remove();
  }
}

window.asipeModal = new ASIPEUIModal();
