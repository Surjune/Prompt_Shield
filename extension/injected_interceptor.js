(function () {
  console.log("[ASIPE MainWorld] Active prompt submission network filter initialized.");

  const originalFetch = window.fetch;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHROpen = XMLHttpRequest.prototype.open;

  // 1. Intercept active POST fetch requests (ChatGPT / OpenAI APIs)
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : "");
    const config = args[1] || {};

    if (config.method && config.method.toUpperCase() === "POST" && config.body) {
      if (isActivePromptSubmissionUrl(url)) {
        const promptText = extractActiveUserPrompt(url, config.body);
        if (promptText && promptText.trim().length > 0) {
          console.log("[ASIPE Network] Active POST prompt dispatch detected:", url);
          const decision = await requestScanFromExtension(promptText, detectPlatform(url));

          if (decision.action === "BLOCK") {
            console.warn("[ASIPE Network] BLOCKING active prompt submission!");
            window.dispatchEvent(new CustomEvent("ASIPE_SHOW_BLOCK_UI", { detail: decision }));
            throw new TypeError("Active prompt submission blocked by ASIPE Policy Engine.");
          } else if (decision.action === "REDACT" && decision.sanitized_prompt) {
            config.body = replacePromptInBody(config.body, promptText, decision.sanitized_prompt);
            args[1] = config;
          }
        }
      }
    }
    return originalFetch.apply(this, args);
  };

  // 2. Intercept active POST XHR requests (Google Gemini StreamGenerate)
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._asipe_url = url;
    this._asipe_method = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (body && this._asipe_method && this._asipe_method.toUpperCase() === "POST") {
      const url = this._asipe_url || "";
      if (isActivePromptSubmissionUrl(url)) {
        const promptText = extractActiveUserPrompt(url, body);
        if (promptText && promptText.trim().length > 0) {
          console.log("[ASIPE Network] Active XHR prompt dispatch detected:", url);
          requestScanFromExtension(promptText, detectPlatform(url)).then((decision) => {
            if (decision.action === "BLOCK") {
              console.warn("[ASIPE Network] BLOCKING XHR active prompt submission!");
              window.dispatchEvent(new CustomEvent("ASIPE_SHOW_BLOCK_UI", { detail: decision }));
              try { this.abort(); } catch (e) {}
            }
          });
        }
      }
    }
    return originalXHRSend.apply(this, arguments);
  };

  function isActivePromptSubmissionUrl(url) {
    if (!url) return false;
    // Strict endpoints representing ACTIVE user message dispatches
    const activeEndpoints = [
      "/backend-api/conversation",
      "StreamGenerate",
      "BardFrontendService/StreamGenerate",
      "v1/chat/completions"
    ];
    return activeEndpoints.some(ep => url.includes(ep));
  }

  function extractActiveUserPrompt(url, body) {
    try {
      const strBody = typeof body === 'string' ? body : String(body);

      // Gemini active prompt parameter parsing (f.req)
      if (url.includes("StreamGenerate") || strBody.includes("f.req=")) {
        const decoded = decodeURIComponent(strBody);
        // Match user's input string in active RPC payload
        const stringMatches = decoded.match(/["']([^"']{3,})["']/g);
        if (stringMatches) {
          for (let s of stringMatches) {
            const val = s.replace(/^["']|["']$/g, '');
            if (!val.startsWith("at/") && !val.startsWith("c_") && !val.includes("BardFrontendService") && val.length > 2) {
              return val;
            }
          }
        }
      }

      // ChatGPT active prompt JSON parsing
      if (strBody.startsWith("{") || strBody.includes('"messages"')) {
        const data = JSON.parse(strBody);
        if (data.messages && Array.isArray(data.messages)) {
          const lastMsg = data.messages[data.messages.length - 1];
          if (lastMsg && lastMsg.author && lastMsg.author.role === "user") {
            if (typeof lastMsg.content === 'string') return lastMsg.content;
            if (Array.isArray(lastMsg.content) && lastMsg.content[0] && lastMsg.content[0].text) return lastMsg.content[0].text;
          } else if (lastMsg) {
            if (typeof lastMsg.content === 'string') return lastMsg.content;
            if (Array.isArray(lastMsg.content) && lastMsg.content[0] && lastMsg.content[0].text) return lastMsg.content[0].text;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function replacePromptInBody(body, originalText, sanitizedText) {
    try {
      if (typeof body === 'string') {
        return body.replace(encodeURIComponent(originalText), encodeURIComponent(sanitizedText)).replace(originalText, sanitizedText);
      }
    } catch (e) {}
    return body;
  }

  function requestScanFromExtension(promptText, platform) {
    return new Promise((resolve) => {
      const requestId = "asipe_req_" + Math.random().toString(36).substring(2, 11);

      function handleResponse(event) {
        if (event.detail && event.detail.requestId === requestId) {
          window.removeEventListener("ASIPE_SCAN_RESPONSE", handleResponse);
          resolve(event.detail.decision);
        }
      }

      window.addEventListener("ASIPE_SCAN_RESPONSE", handleResponse);
      window.dispatchEvent(new CustomEvent("ASIPE_SCAN_REQUEST", {
        detail: { requestId, promptText, platform }
      }));

      setTimeout(() => {
        window.removeEventListener("ASIPE_SCAN_RESPONSE", handleResponse);
        resolve({ action: "ALLOW", is_safe: true, risk_score: 0 });
      }, 3000);
    });
  }

  function detectPlatform(url) {
    if (url.includes("openai") || url.includes("chatgpt")) return "ChatGPT";
    if (url.includes("gemini") || url.includes("google") || url.includes("Bard")) return "Gemini";
    return "AI Platform";
  }
})();
