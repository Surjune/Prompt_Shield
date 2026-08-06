(function () {
  console.log("[ASIPE ContentScript] Autonomous content script initialized.");

  // Instantiate DOM Interceptor independently of popup state
  const interceptor = new ASIPEDOMInterceptor(async (promptText, platform) => {
    const isEnabled = await checkMonitoringActive();
    if (!isEnabled) {
      return { action: "ALLOW", is_safe: true, risk_score: 0 };
    }
    return scanPromptViaBackground(promptText, platform);
  });

  // Listen for CustomEvents from main-world network interceptor
  window.addEventListener("ASIPE_SCAN_REQUEST", async (event) => {
    if (!event.detail) return;
    const { requestId, promptText, platform } = event.detail;

    const isEnabled = await checkMonitoringActive();
    if (!isEnabled) {
      window.dispatchEvent(new CustomEvent("ASIPE_SCAN_RESPONSE", {
        detail: { requestId, decision: { action: "ALLOW", is_safe: true, risk_score: 0 } }
      }));
      return;
    }

    const decision = await scanPromptViaBackground(promptText, platform);
    window.dispatchEvent(new CustomEvent("ASIPE_SCAN_RESPONSE", {
      detail: { requestId, decision }
    }));
  });

  window.addEventListener("ASIPE_SHOW_BLOCK_UI", (event) => {
    if (event.detail && window.asipeModal) {
      window.asipeModal.showBlockModal(
        event.detail.violations || [],
        event.detail.risk_score || 0,
        () => console.log("[ASIPE] Block modal dismissed.")
      );
    }
  });

  function checkMonitoringActive() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["isMonitoringEnabled", "asipe_enabled"], (res) => {
        const active = res.isMonitoringEnabled !== undefined ? res.isMonitoringEnabled : (res.asipe_enabled !== undefined ? res.asipe_enabled : true);
        resolve(active !== false);
      });
    });
  }

  function scanPromptViaBackground(promptText, platform) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "SCAN_PROMPT",
          payload: {
            prompt: promptText,
            platform: platform,
            user_id: "client_extension_user"
          }
        },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            console.warn("[ASIPE ContentScript] ServiceWorker communication fallback:", chrome.runtime.lastError);
            resolve({ action: "ALLOW", is_safe: true, risk_score: 0 });
            return;
          }

          const decision = response.data;
          if (decision.action === "BLOCK" && window.asipeModal) {
            window.asipeModal.showBlockModal(
              decision.violations || [],
              decision.risk_score || 0,
              () => console.log("[ASIPE] Block modal dismissed.")
            );
          }

          resolve(decision);
        }
      );
    });
  }

  injectStatusBadge();

  function injectStatusBadge() {
    if (document.getElementById("asipe-status-badge")) return;
    const badge = document.createElement("div");
    badge.id = "asipe-status-badge";
    badge.className = "asipe-security-badge";
    badge.style.position = "fixed";
    badge.style.bottom = "16px";
    badge.style.right = "16px";
    badge.style.zIndex = "99999";
    badge.innerHTML = `🛡️ ASIPE Active`;
    document.body.appendChild(badge);
  }
})();
