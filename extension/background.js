const BACKEND_URL = "http://127.0.0.1:8000/api/v1/scan-prompt";
const STATS_URL = "http://127.0.0.1:8000/api/v1/logs/stats";
const EXTENSION_KEY = "asipe-extension-sec-key-v1-9982";

function initStorageDefaults() {
  chrome.storage.local.get(["isMonitoringEnabled"], (result) => {
    if (result.isMonitoringEnabled === undefined) {
      chrome.storage.local.set({
        isMonitoringEnabled: true,
        asipe_enabled: true,
        backend_url: BACKEND_URL,
        total_blocked: 0,
        total_redacted: 0,
        total_scanned: 0
      });
      console.log("[ASIPE ServiceWorker] Defaults initialized: isMonitoringEnabled = true");
    }
  });
}

chrome.runtime.onInstalled.addListener(initStorageDefaults);
chrome.runtime.onStartup.addListener(initStorageDefaults);

// Handle incoming messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_PROMPT") {
    handlePromptScan(message.payload)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === "CHECK_HEALTH") {
    fetchStatsAndHealth()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TOGGLE_MONITORING") {
    chrome.storage.local.set({
      isMonitoringEnabled: message.enabled,
      asipe_enabled: message.enabled
    }, () => {
      sendResponse({ success: true, enabled: message.enabled });
    });
    return true;
  }
});

async function handlePromptScan(payload) {
  const config = await chrome.storage.local.get(["isMonitoringEnabled", "asipe_enabled", "backend_url"]);
  const isEnabled = config.isMonitoringEnabled !== undefined ? config.isMonitoringEnabled : config.asipe_enabled;

  if (isEnabled === false) {
    console.log("[ASIPE ServiceWorker] Monitoring disabled in storage. Bypassing scan.");
    return { action: "ALLOW", is_safe: true, risk_score: 0, violations: [] };
  }

  try {
    const response = await fetch(config.backend_url || BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Key": EXTENSION_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    // Sync persistent storage stats
    const stats = await chrome.storage.local.get(["total_scanned", "total_blocked", "total_redacted"]);
    const updates = { total_scanned: (stats.total_scanned || 0) + 1 };
    if (data.action === "BLOCK") updates.total_blocked = (stats.total_blocked || 0) + 1;
    if (data.action === "REDACT") updates.total_redacted = (stats.total_redacted || 0) + 1;

    await chrome.storage.local.set(updates);
    return data;
  } catch (error) {
    console.error("[ASIPE Background] Scan network call failed:", error);
    return {
      action: "ALLOW",
      is_safe: true,
      risk_score: 0,
      violations: [],
      warning: "Backend API offline. Proceeding in fail-open mode."
    };
  }
}

async function fetchStatsAndHealth() {
  const res = await fetch(STATS_URL);
  if (!res.ok) throw new Error("Backend offline");
  const stats = await res.json();
  
  // Sync DB stats into storage
  await chrome.storage.local.set({
    total_scanned: stats.total_scans,
    total_blocked: stats.total_blocked,
    total_redacted: stats.total_redacted
  });
  return stats;
}
