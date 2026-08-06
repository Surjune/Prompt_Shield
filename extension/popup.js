document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-btn");
  const scannedLabel = document.getElementById("scanned-count");
  const blockedLabel = document.getElementById("blocked-count");
  const redactedLabel = document.getElementById("redacted-count");
  const backendLabel = document.getElementById("backend-status");
  const statusDot = document.getElementById("status-dot");

  function refreshStatsUI() {
    chrome.storage.local.get(["isMonitoringEnabled", "asipe_enabled", "total_scanned", "total_blocked", "total_redacted"], (res) => {
      const isEnabled = res.isMonitoringEnabled !== undefined ? res.isMonitoringEnabled : (res.asipe_enabled !== undefined ? res.asipe_enabled : true);
      updateToggleUI(isEnabled);

      scannedLabel.textContent = res.total_scanned || 0;
      blockedLabel.textContent = res.total_blocked || 0;
      redactedLabel.textContent = res.total_redacted || 0;
    });

    chrome.runtime.sendMessage({ type: "CHECK_HEALTH" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.success && response.data) {
        statusDot.style.background = "#22c55e";
        backendLabel.textContent = "Online";
        backendLabel.style.color = "#22c55e";

        if (response.data.total_scans !== undefined) {
          scannedLabel.textContent = response.data.total_scans;
          blockedLabel.textContent = response.data.total_blocked;
          redactedLabel.textContent = response.data.total_redacted;
        }
      } else {
        statusDot.style.background = "#ef4444";
        backendLabel.textContent = "Offline (Fail-Open)";
        backendLabel.style.color = "#ef4444";
      }
    });
  }

  toggleBtn.addEventListener("click", () => {
    chrome.storage.local.get(["isMonitoringEnabled"], (res) => {
      const currentState = res.isMonitoringEnabled !== false;
      const nextState = !currentState;

      chrome.storage.local.set({
        isMonitoringEnabled: nextState,
        asipe_enabled: nextState
      }, () => {
        updateToggleUI(nextState);
        chrome.runtime.sendMessage({ type: "TOGGLE_MONITORING", enabled: nextState });
      });
    });
  });

  function updateToggleUI(enabled) {
    if (enabled) {
      toggleBtn.textContent = "ACTIVE";
      toggleBtn.className = "btn-toggle btn-on";
    } else {
      toggleBtn.textContent = "DISABLED";
      toggleBtn.className = "btn-toggle btn-off";
    }
  }

  // Initial load + 1000ms polling for instant UI counter updates
  refreshStatsUI();
  const pollTimer = setInterval(refreshStatsUI, 1000);
  window.addEventListener("unload", () => clearInterval(pollTimer));
});
