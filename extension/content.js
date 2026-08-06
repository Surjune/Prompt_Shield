(function () {
  console.log("[ASIPE ContentScript] Autonomous content script initialized.");

  // ── Guard: detect if extension context is still valid ────────────────────
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // ── Safe DOM append with MutationObserver fallback ────────────────────────
  // Fixes: "Cannot read properties of null (reading 'appendChild')"
  // DOMContentLoaded may already have fired by the time this is called at
  // document_start on SPAs like Gemini, so we use MutationObserver as backup.
  function safeAppend(element) {
    if (!element) return;

    const tryAppend = () => {
      const target = document.body || document.documentElement;
      if (target) {
        target.appendChild(element);
        return true;
      }
      return false;
    };

    if (tryAppend()) return;

    // DOMContentLoaded already fired OR hasn't yet — observe for body to appear
    if (document.readyState === 'loading') {
      document.addEventListener("DOMContentLoaded", () => {
        if (!tryAppend()) {
          // Still no body? Observe until it appears
          const obs = new MutationObserver(() => {
            if (tryAppend()) obs.disconnect();
          });
          obs.observe(document.documentElement || document, { childList: true, subtree: false });
        }
      }, { once: true });
    } else {
      // DOM is parsed but body may still not exist — use MutationObserver
      const obs = new MutationObserver(() => {
        if (tryAppend()) obs.disconnect();
      });
      const root = document.documentElement || document;
      obs.observe(root, { childList: true, subtree: false });
      // Safety: disconnect after 10 seconds to avoid memory leak
      setTimeout(() => obs.disconnect(), 10000);
    }
  }

  // ── Instantiate DOM Interceptor ───────────────────────────────────────────
  const interceptor = new ASIPEDOMInterceptor(async (promptText, platform) => {
    if (!isExtensionContextValid()) return { action: "ALLOW", is_safe: true, risk_score: 0 };
    const isEnabled = await checkMonitoringActive();
    if (!isEnabled) return { action: "ALLOW", is_safe: true, risk_score: 0 };
    return scanPromptViaBackground(promptText, platform);
  });

  // ── Network interceptor bridge ────────────────────────────────────────────
  window.addEventListener("ASIPE_SCAN_REQUEST", async (event) => {
    // Wrap everything in try-catch: async handlers MUST catch all errors to
    // avoid "Uncaught (in promise)" when extension context is invalidated.
    try {
      if (!event.detail) return;
      const { requestId, promptText, platform } = event.detail;
      const failOpen = { requestId, decision: { action: "ALLOW", is_safe: true, risk_score: 0 } };

      const dispatchFail = () => {
        try {
          window.dispatchEvent(new CustomEvent("ASIPE_SCAN_RESPONSE", { detail: failOpen }));
        } catch (e) { /* page may be unloading */ }
      };

      // Check context FIRST — before any other async or chrome API call
      if (!isExtensionContextValid()) { dispatchFail(); return; }

      // Skip trivially short prompts
      if (!promptText || promptText.trim().length < 5) { dispatchFail(); return; }

      const isEnabled = await checkMonitoringActive();
      if (!isEnabled) { dispatchFail(); return; }

      const decision = await scanPromptViaBackground(promptText, platform);
      try {
        window.dispatchEvent(new CustomEvent("ASIPE_SCAN_RESPONSE", {
          detail: { requestId, decision }
        }));
      } catch (e) { /* page may be unloading */ }

    } catch (e) {
      // Silently swallow "Extension context invalidated" and any other async errors.
      // The injected_interceptor has its own 4s timeout that will fail-open.
      if (event && event.detail && event.detail.requestId) {
        try {
          window.dispatchEvent(new CustomEvent("ASIPE_SCAN_RESPONSE", {
            detail: {
              requestId: event.detail.requestId,
              decision: { action: "ALLOW", is_safe: true, risk_score: 0 }
            }
          }));
        } catch (e2) { /* ignore */ }
      }
    }
  });


  // ── Block UI listener ─────────────────────────────────────────────────────
  window.addEventListener("ASIPE_SHOW_BLOCK_UI", (event) => {
    if (event.detail && window.asipeModal) {
      window.asipeModal.showBlockModal(
        event.detail.violations || [],
        event.detail.risk_score || 0,
        () => console.log("[ASIPE] Block modal dismissed.")
      );
    }
  });

  // ── Storage helper ────────────────────────────────────────────────────────
  function checkMonitoringActive() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(true); return; }
      try {
        chrome.storage.local.get(["isMonitoringEnabled", "asipe_enabled"], (res) => {
          if (chrome.runtime.lastError) { resolve(true); return; }
          const active = res.isMonitoringEnabled !== undefined
            ? res.isMonitoringEnabled
            : (res.asipe_enabled !== undefined ? res.asipe_enabled : true);
          resolve(active !== false);
        });
      } catch (e) {
        resolve(true);
      }
    });
  }

  // ── Core scan function ────────────────────────────────────────────────────
  function scanPromptViaBackground(promptText, platform) {
    return new Promise((resolve) => {
      const FAIL_OPEN = { action: "ALLOW", is_safe: true, risk_score: 0 };
      let isResolved = false;

      const safeResolve = (decision) => {
        if (isResolved) return;
        isResolved = true;
        resolve(decision || FAIL_OPEN);
      };

      // Extension context gone (e.g. after reload) — fail open immediately
      if (!isExtensionContextValid()) {
        safeResolve(FAIL_OPEN);
        return;
      }

      // Timeout guard: fail-open after 4s if service worker doesn't respond
      const timeoutId = setTimeout(() => {
        // Don't log — this is expected when backend is offline
        safeResolve(FAIL_OPEN);
      }, 4000);

      const handleResponse = (response) => {
        clearTimeout(timeoutId);

        // Read lastError FIRST (Chrome clears it immediately after callback)
        const lastErr = chrome.runtime.lastError;

        if (lastErr) {
          const msg = lastErr.message || "";
          // "message channel closed" = service worker terminated mid-request (MV3 known issue)
          // "Extension context invalidated" = extension was reloaded
          // Both are fail-open silently — no need to warn the user
          if (
            msg.includes("message channel closed") ||
            msg.includes("context invalidated") ||
            msg.includes("Receiving end does not exist")
          ) {
            safeResolve(FAIL_OPEN);
          } else {
            console.warn("[ASIPE ContentScript] ServiceWorker error:", msg);
            safeResolve(FAIL_OPEN);
          }
          return;
        }

        if (!response || !response.success) {
          // Backend returned a fail-open result — don't warn, this is expected
          safeResolve(response && response.data ? response.data : FAIL_OPEN);
          return;
        }

        const decision = response.data || FAIL_OPEN;

        // Show block modal if needed
        if (decision.action === "BLOCK" && window.asipeModal) {
          window.asipeModal.showBlockModal(
            decision.violations || [],
            decision.risk_score || 0,
            () => console.log("[ASIPE] Block modal dismissed.")
          );
        }

        safeResolve(decision);
      };

      try {
        chrome.runtime.sendMessage(
          {
            type: "SCAN_PROMPT",
            payload: {
              prompt: promptText,
              platform: platform,
              user_id: "client_extension_user"
            }
          },
          handleResponse
        );
      } catch (e) {
        clearTimeout(timeoutId);
        // chrome.runtime.sendMessage throws synchronously when context is gone
        safeResolve(FAIL_OPEN);
      }
    });
  }

  // ── Status badge ──────────────────────────────────────────────────────────
  // IMPORTANT: Never call appendChild at document_start — defer via setTimeout
  // so the call runs AFTER the browser has parsed at least document.documentElement.
  function injectStatusBadge() {
    // Already injected
    if (document.getElementById("asipe-status-badge")) return;

    // body not ready yet — retry in 50ms (handles SPA document_start edge case)
    if (!document.body) {
      setTimeout(injectStatusBadge, 50);
      return;
    }

    const badge = document.createElement("div");
    badge.id = "asipe-status-badge";
    badge.className = "asipe-security-badge";
    badge.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:99999;pointer-events:none;";
    badge.innerHTML = "\uD83D\uDEE1\uFE0F ASIPE Active";
    document.body.appendChild(badge);  // document.body is guaranteed non-null here
  }

  // Defer initial call so we are never racing against the parser at document_start
  setTimeout(injectStatusBadge, 0);
})();
