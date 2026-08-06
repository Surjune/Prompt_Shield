const BACKEND_URL = "http://127.0.0.1:8000/api/v1/scan-prompt";
const EXTENSION_KEY = "asipe-extension-sec-key-v1-9982";

// Initialize extension settings in chrome.storage.local
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    asipe_enabled: true,
    backend_url: BACKEND_URL,
    total_blocked: 0,
    total_redacted: 0,
    total_scanned: 0
  });
  console.log("[ASIPE ServiceWorker] Extension initialized.");
});

// Handle incoming messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_PROMPT") {
    handlePromptScan(message.payload)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
  
  if (message.type === "CHECK_HEALTH") {
    fetch("http://127.0.0.1:8000/")
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handlePromptScan(payload) {
  // Check local settings state
  const config = await chrome.storage.local.get(["asipe_enabled", "backend_url"]);
  if (!config.asipe_enabled) {
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

    // Update stats in storage
    const stats = await chrome.storage.local.get(["total_scanned", "total_blocked", "total_redacted"]);
    const updates = { total_scanned: (stats.total_scanned || 0) + 1 };

    if (data.action === "BLOCK") updates.total_blocked = (stats.total_blocked || 0) + 1;
    if (data.action === "REDACT") updates.total_redacted = (stats.total_redacted || 0) + 1;

    await chrome.storage.local.set(updates);
    return data;
  } catch (error) {
    console.error("[ASIPE Background] Scan failed:", error);
    // Fail-safe default: ALLOW with warning if backend unavailable
    return {
      action: "ALLOW",
      is_safe: true,
      risk_score: 0,
      violations: [],
      warning: "Backend API offline. Proceeding in fail-open mode."
    };
  }
}
