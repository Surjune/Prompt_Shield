document.addEventListener("DOMContentLoaded", () => {
  // Load storage statistics
  chrome.storage.local.get(["total_scanned", "total_blocked", "total_redacted"], (res) => {
    document.getElementById("scanned-count").textContent = res.total_scanned || 0;
    document.getElementById("blocked-count").textContent = res.total_blocked || 0;
    document.getElementById("redacted-count").textContent = res.total_redacted || 0;
  });

  // Query background health check
  chrome.runtime.sendMessage({ type: "CHECK_HEALTH" }, (response) => {
    const dot = document.getElementById("status-dot");
    const label = document.getElementById("backend-status");

    if (response && response.success) {
      dot.style.background = "#22c55e";
      label.textContent = "Online";
      label.style.color = "#22c55e";
    } else {
      dot.style.background = "#ef4444";
      label.textContent = "Offline";
      label.style.color = "#ef4444";
    }
  });
});
