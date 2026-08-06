(function () {
  console.log("[ASIPE MainWorld] Network filter initialized.");

  const originalFetch = window.fetch;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHROpen = XMLHttpRequest.prototype.open;

  // ─── Deduplication registry ────────────────────────────────────────────────
  // Tracks recently scanned prompts to prevent scanning the same text twice
  // (e.g. when both network interceptor AND DOM interceptor both fire for a submit)
  const _recentScans = new Map(); // promptKey -> timestamp
  const DEDUP_WINDOW_MS = 5000;  // 5 seconds

  function isDuplicateScan(promptText) {
    if (!promptText || promptText.length < 5) return true; // ignore trivially short text
    const key = promptText.substring(0, 120); // use first 120 chars as key
    const lastScan = _recentScans.get(key);
    if (lastScan && (Date.now() - lastScan) < DEDUP_WINDOW_MS) return true;
    _recentScans.set(key, Date.now());
    // Keep map small — evict entries older than DEDUP_WINDOW_MS
    if (_recentScans.size > 20) {
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      for (const [k, ts] of _recentScans.entries()) {
        if (ts < cutoff) _recentScans.delete(k);
      }
    }
    return false;
  }

  // ─── 1. ChatGPT fetch interception (fully blocking) ───────────────────────
  // NOTE: Gemini uses XHR, not fetch, for StreamGenerate. The fetch interceptor
  //       here targets ONLY ChatGPT's /backend-api/conversation and v1/chat/completions.
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : "");
    const config = args[1] || {};

    if (
      config.method &&
      config.method.toUpperCase() === "POST" &&
      config.body &&
      isChatGPTSubmissionUrl(url)  // Only ChatGPT — NOT Gemini StreamGenerate
    ) {
      const promptText = extractChatGPTPrompt(config.body);
      if (promptText && promptText.trim().length >= 5) {
        if (!isDuplicateScan(promptText)) {
          console.log("[ASIPE Network] ChatGPT fetch prompt intercepted:", url.split('/').pop());
          const decision = await requestScanFromExtension(promptText, "ChatGPT");

          if (decision.action === "BLOCK") {
            console.warn("[ASIPE Network] BLOCKING ChatGPT prompt submission.");
            window.dispatchEvent(new CustomEvent("ASIPE_SHOW_BLOCK_UI", { detail: decision }));
            throw new TypeError("Prompt submission blocked by ASIPE Policy Engine.");
          } else if (decision.action === "REDACT" && decision.sanitized_prompt) {
            config.body = replacePromptInBody(config.body, promptText, decision.sanitized_prompt);
            args[1] = config;
          }
        } else {
          console.log("[ASIPE Network] Skipping duplicate fetch scan (dedup guard).");
        }
      }
    }
    return originalFetch.apply(this, args);
  };

  // ─── 2. XHR open: track URL and method ────────────────────────────────────
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._asipe_url = url;
    this._asipe_method = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  // ─── 3. Gemini XHR interception (advisory only — cannot block after send) ─
  // XHR cannot be synchronously blocked once send() fires, so this is advisory.
  // The DOM interceptor in dom_interceptor.js is the primary blocking mechanism for Gemini.
  // We only use this to catch cases where DOM interception missed the event.
  XMLHttpRequest.prototype.send = function (body) {
    if (
      body &&
      this._asipe_method &&
      this._asipe_method.toUpperCase() === "POST" &&
      isGeminiSubmissionUrl(this._asipe_url || "")
    ) {
      // Only scan if body is large enough to be a real prompt (not autocomplete ping)
      const bodyStr = typeof body === 'string' ? body : String(body);
      if (bodyStr.length > 50) {  // Autocomplete calls tend to be very small
        const promptText = extractGeminiPrompt(bodyStr);
        if (promptText && promptText.trim().length >= 5) {
          if (!isDuplicateScan(promptText)) {
            console.log("[ASIPE Network] Gemini XHR prompt detected (advisory scan).");
            requestScanFromExtension(promptText, "Gemini").then((decision) => {
              if (decision.action === "BLOCK") {
                // XHR already fired — show UI warning only
                console.warn("[ASIPE Network] Gemini prompt was flagged (advisory block).");
                window.dispatchEvent(new CustomEvent("ASIPE_SHOW_BLOCK_UI", { detail: decision }));
              }
            });
          } else {
            console.log("[ASIPE Network] Skipping duplicate XHR scan (dedup guard).");
          }
        }
      }
    }
    return originalXHRSend.apply(this, arguments);
  };

  // ─── URL matchers ─────────────────────────────────────────────────────────

  function isChatGPTSubmissionUrl(url) {
    if (!url) return false;
    return (
      url.includes("/backend-api/conversation") ||
      url.includes("v1/chat/completions")
    );
  }

  function isGeminiSubmissionUrl(url) {
    if (!url) return false;
    // Only match BardFrontendService StreamGenerate — not other Google API calls
    return (
      url.includes("BardFrontendService/StreamGenerate") ||
      url.includes("google.com/bard/") ||
      url.includes("generativelanguage.googleapis.com")
    );
  }

  // ─── Prompt extractors ────────────────────────────────────────────────────

  function extractChatGPTPrompt(body) {
    try {
      const strBody = typeof body === 'string' ? body : String(body);
      if (strBody.startsWith("{") || strBody.includes('"messages"')) {
        const data = JSON.parse(strBody);
        if (data.messages && Array.isArray(data.messages)) {
          const lastMsg = data.messages[data.messages.length - 1];
          if (lastMsg) {
            if (typeof lastMsg.content === 'string') return lastMsg.content;
            if (Array.isArray(lastMsg.content) && lastMsg.content[0] && lastMsg.content[0].text) {
              return lastMsg.content[0].text;
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function extractGeminiPrompt(body) {
    try {
      const strBody = typeof body === 'string' ? body : String(body);
      // Gemini encodes payload as f.req URL-encoded JSON
      const decoded = decodeURIComponent(strBody);
      // Look for quoted strings that look like user input (>10 chars, not a system key)
      const stringMatches = decoded.match(/"([^"]{10,})"/g);
      if (stringMatches) {
        for (let s of stringMatches) {
          const val = s.replace(/^"|"$/g, '');
          // Filter out URL paths, identifiers, and Bard system tokens
          if (
            !val.startsWith("at/") &&
            !val.startsWith("c_") &&
            !val.startsWith("http") &&
            !val.includes("BardFrontendService") &&
            !val.includes("StreamGenerate") &&
            !val.match(/^[a-z_]+$/) && // skip pure identifiers
            val.length > 8
          ) {
            return val;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function replacePromptInBody(body, originalText, sanitizedText) {
    try {
      if (typeof body === 'string') {
        return body
          .replace(encodeURIComponent(originalText), encodeURIComponent(sanitizedText))
          .replace(originalText, sanitizedText);
      }
    } catch (e) {}
    return body;
  }

  // ─── Scan request bridge ──────────────────────────────────────────────────

  function requestScanFromExtension(promptText, platform) {
    return new Promise((resolve) => {
      const requestId = "asipe_req_" + Math.random().toString(36).substring(2, 11);

      function handleResponse(event) {
        if (event.detail && event.detail.requestId === requestId) {
          window.removeEventListener("ASIPE_SCAN_RESPONSE", handleResponse);
          resolve(event.detail.decision || { action: "ALLOW", is_safe: true, risk_score: 0 });
        }
      }

      window.addEventListener("ASIPE_SCAN_RESPONSE", handleResponse);
      window.dispatchEvent(new CustomEvent("ASIPE_SCAN_REQUEST", {
        detail: { requestId, promptText, platform }
      }));

      // Fail-open after 4 seconds to avoid freezing the page
      setTimeout(() => {
        window.removeEventListener("ASIPE_SCAN_RESPONSE", handleResponse);
        resolve({ action: "ALLOW", is_safe: true, risk_score: 0 });
      }, 4000);
    });
  }

  function detectPlatform(url) {
    if (url.includes("openai") || url.includes("chatgpt")) return "ChatGPT";
    if (url.includes("gemini") || url.includes("google") || url.includes("Bard")) return "Gemini";
    return "AI Platform";
  }
})();
