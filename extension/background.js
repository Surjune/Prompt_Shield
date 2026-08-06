const PRIMARY_BACKEND_URL = "http://127.0.0.1:8000/api/v1/scan-prompt";
const FALLBACK_BACKEND_URL = "http://localhost:8000/api/v1/scan-prompt";
const PRIMARY_STATS_URL = "http://127.0.0.1:8000/api/v1/logs/stats";
const FALLBACK_STATS_URL = "http://localhost:8000/api/v1/logs/stats";
const EXTENSION_KEY = "asipe-extension-sec-key-v1-9982";

function initStorageDefaults() {
  chrome.storage.local.get(["isMonitoringEnabled"], (result) => {
    if (result.isMonitoringEnabled === undefined) {
      chrome.storage.local.set({
        isMonitoringEnabled: true,
        asipe_enabled: true,
        backend_url: PRIMARY_BACKEND_URL,
        total_blocked: 0,
        total_redacted: 0,
        total_scanned: 0
      });
      console.log("[ASIPE ServiceWorker] Storage initialized.");
    }
  });
}

chrome.runtime.onInstalled.addListener(initStorageDefaults);
chrome.runtime.onStartup.addListener(initStorageDefaults);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "SCAN_PROMPT") {
    (async () => {
      try {
        const result = await handlePromptScan(message.payload || {});
        sendResponse({ success: true, data: result });
      } catch (err) {
        sendResponse({
          success: true,
          data: {
            action: "ALLOW",
            is_safe: true,
            risk_score: 0,
            violations: [],
            warning: err ? (err.message || String(err)) : "Scan failed"
          }
        });
      }
    })();
    return true; // Keeps async response channel open
  }

  if (message.type === "CHECK_HEALTH") {
    (async () => {
      try {
        const data = await fetchStatsAndHealth();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err ? (err.message || String(err)) : "Health check failed" });
      }
    })();
    return true; // Keeps async response channel open
  }

  if (message.type === "TOGGLE_MONITORING") {
    chrome.storage.local.set({
      isMonitoringEnabled: message.enabled,
      asipe_enabled: message.enabled
    }, () => {
      sendResponse({ success: true, enabled: message.enabled });
    });
    return true; // Keeps response channel open
  }

  return false;
});

async function executeScanRequest(targetUrl, payload, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Key": EXTENSION_KEY
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handlePromptScan(payload) {
  const config = await chrome.storage.local.get(["isMonitoringEnabled", "asipe_enabled", "backend_url"]);
  const isEnabled = config.isMonitoringEnabled !== undefined ? config.isMonitoringEnabled : config.asipe_enabled;

  if (isEnabled === false) {
    return { action: "ALLOW", is_safe: true, risk_score: 0, violations: [] };
  }

  const primaryUrl = config.backend_url || PRIMARY_BACKEND_URL;
  const fallbackUrl = primaryUrl.includes("127.0.0.1")
    ? FALLBACK_BACKEND_URL
    : (primaryUrl.includes("localhost") ? PRIMARY_BACKEND_URL : FALLBACK_BACKEND_URL);

  let response;
  try {
    response = await executeScanRequest(primaryUrl, payload);
    if (!response.ok) {
      throw new Error(`Primary endpoint returned HTTP ${response.status}`);
    }
  } catch (err) {
    console.warn(`[ASIPE Background] Primary URL (${primaryUrl}) failed (${err.message}), attempting fallback (${fallbackUrl})...`);
    try {
      response = await executeScanRequest(fallbackUrl, payload);
    } catch (fallbackErr) {
      // Both loopback endpoints unreachable — backend is offline. Fail-open silently.
      // This is expected when the backend server is not running.
      console.debug("[ASIPE Background] Backend offline — proceeding in fail-open mode.");
      return {
        action: "ALLOW",
        is_safe: true,
        risk_score: 0,
        violations: [],
        warning: "Backend API offline. Proceeding in fail-open mode."
      };
    }
  }

  if (!response.ok) {
    return {
      action: "ALLOW",
      is_safe: true,
      risk_score: 0,
      violations: [],
      warning: `Backend API returned HTTP ${response.status}. Proceeding in fail-open mode.`
    };
  }

  const data = await response.json();
  const stats = await chrome.storage.local.get(["total_scanned", "total_blocked", "total_redacted"]);
  const updates = { total_scanned: (stats.total_scanned || 0) + 1 };
  if (data.action === "BLOCK") updates.total_blocked = (stats.total_blocked || 0) + 1;
  if (data.action === "REDACT") updates.total_redacted = (stats.total_redacted || 0) + 1;

  await chrome.storage.local.set(updates);
  return data;
}

async function fetchStatsAndHealth() {
  let res;
  const fetchWithTimeout = async (url, timeoutMs = 2000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    res = await fetchWithTimeout(PRIMARY_STATS_URL);
  } catch (e) {
    try {
      res = await fetchWithTimeout(FALLBACK_STATS_URL);
    } catch (err2) {
      // Both loopback endpoints unreachable - backend is offline
      throw new Error("Backend API offline");
    }
  }

  // NOTE: fetchWithTimeout throws on !response.ok, so res is always a valid ok response here.
  if (!res) throw new Error("Backend API offline");
  const stats = await res.json();
  await chrome.storage.local.set({
    total_scanned: stats.total_scans,
    total_blocked: stats.total_blocked,
    total_redacted: stats.total_redacted
  });
  return stats;
}
