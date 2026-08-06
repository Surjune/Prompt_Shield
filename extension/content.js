(function () {
  console.log("[ASIPE ContentScript] Initializing client-side security interceptor...");

  // Instantiate DOM Interceptor with async callback handler
  const interceptor = new ASIPEDOMInterceptor(async (promptText, platform) => {
    console.log(`[ASIPE] Intercepted prompt (${platform}): "${promptText.substring(0, 40)}..."`);

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
            console.warn("[ASIPE] Background scan error/fallback:", chrome.runtime.lastError);
            resolve({ action: "ALLOW", is_safe: true, risk_score: 0 });
            return;
          }

          const decision = response.data;
          console.log(`[ASIPE Decision] Action: ${decision.action}, Risk Score: ${decision.risk_score}`);

          if (decision.action === "BLOCK") {
            window.asipeModal.showBlockModal(
              decision.violations || [],
              decision.risk_score || 0,
              () => console.log("[ASIPE] Block modal dismissed by user.")
            );
          }

          resolve(decision);
        }
      );
    });
  });

  // Render top indicator badge
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
