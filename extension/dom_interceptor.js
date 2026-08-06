class ASIPEDOMInterceptor {
  constructor(onPromptSubmit) {
    this.onPromptSubmit = onPromptSubmit;
    this.isInteracting = false;
    this._lastScannedText = "";         // Prevents scanning identical text twice
    this._lastScanTimestamp = 0;        // Debounce guard (ms)
    this._scanDebounceMs = 3000;        // Min gap between scans of same text
    this.injectMainWorldInterceptor();
    this.bindSubmitEventCapture();
  }

  injectMainWorldInterceptor() {
    try {
      if (document.getElementById("asipe-injected-script")) return;
      const script = document.createElement("script");
      script.id = "asipe-injected-script";
      script.src = chrome.runtime.getURL("injected_interceptor.js");
      script.onload = () => script.remove();

      const mountScript = () => {
        const parentNode = document.head || document.documentElement || document.body;
        if (parentNode) {
          parentNode.appendChild(script);
          console.log("[ASIPE ContentScript] Injected main-world active network interceptor.");
        } else {
          document.addEventListener("DOMContentLoaded", () => {
            const deferredParent = document.head || document.documentElement || document.body;
            if (deferredParent) {
              deferredParent.appendChild(script);
              console.log("[ASIPE ContentScript] Injected main-world interceptor on DOMContentLoaded.");
            }
          }, { once: true });
        }
      };

      mountScript();
    } catch (e) {
      console.error("[ASIPE ContentScript] Script injection failed:", e);
    }
  }

  bindSubmitEventCapture() {
    const handleCapture = async (event) => {

      // ── Fast path: only Enter key (no Shift) or explicit send button click ──
      const isEnterKey = (event.type === 'keydown') && event.key === 'Enter' && !event.shiftKey;
      const isSendButtonClick = (event.type === 'click') && this.isSendButtonElement(event.target);

      // Ignore everything that is not an Enter keydown or a send-button click
      if (!isEnterKey && !isSendButtonClick) return;

      // ── Find the active input element ──
      const activeInputElem = this.findActiveInputElement(event.target);
      if (!activeInputElem) return;

      // ── Extract and validate prompt text ──
      const promptText = this.extractText(activeInputElem).trim();
      if (!promptText || promptText.length < 2) return;

      // ── Deduplication: skip if same text scanned within debounce window ──
      const now = Date.now();
      if (
        promptText === this._lastScannedText &&
        (now - this._lastScanTimestamp) < this._scanDebounceMs
      ) {
        console.log("[ASIPE DOMInterceptor] Skipping duplicate scan (debounce).");
        return; // Let the event pass through normally
      }

      // ── Block if a scan is already in-progress ──
      if (this.isInteracting) return;

      // ── Intercept: halt event propagation and run scan ──
      event.preventDefault();
      event.stopImmediatePropagation();

      this.isInteracting = true;
      this._lastScannedText = promptText;
      this._lastScanTimestamp = now;

      console.log("[ASIPE DOMInterceptor] Prompt submission intercepted:", event.type, `"${promptText.substring(0, 40)}..."`);

      const decision = await this.onPromptSubmit(promptText, this.detectPlatform());
      this.isInteracting = false;

      if (decision.action === "ALLOW") {
        this.releaseNativeSubmit(activeInputElem, isEnterKey);
      } else if (decision.action === "REDACT" && decision.sanitized_prompt) {
        this.updateInputText(activeInputElem, decision.sanitized_prompt);
        this.releaseNativeSubmit(activeInputElem, isEnterKey);
      }
      // BLOCK: do nothing — modal is shown by content.js
    };

    // ONLY keydown (for Enter) and click (for send button)
    // Removed: 'keyup' (fires after keydown, causes double scan)
    // Removed: 'pointerdown' (fires on every mouse press anywhere on page — SCAN STORM SOURCE)
    // Removed: 'submit' (fires redundantly with keydown Enter on most SPAs)
    ['keydown', 'click'].forEach(eventType => {
      window.addEventListener(eventType, handleCapture, true);
    });
  }

  findActiveInputElement(target) {
    // Prefer the element that was directly interacted with if it is an input field
    if (this.isActiveInputField(target)) return target;

    // Gemini: rich-textarea uses a contenteditable div
    const host = window.location.hostname;
    if (host.includes("gemini") || host.includes("google")) {
      return (
        document.querySelector('div.ql-editor[contenteditable="true"]') ||
        document.querySelector('rich-textarea div[contenteditable="true"]') ||
        document.querySelector('div[aria-label*="Enter a prompt"][contenteditable]') ||
        document.querySelector('div[contenteditable="true"][data-placeholder]') ||
        null
      );
    }

    // ChatGPT
    return (
      document.getElementById("prompt-textarea") ||
      document.querySelector('textarea[data-id="root"]') ||
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea') ||
      null
    );
  }

  isActiveInputField(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    return (
      tag === "textarea" ||
      tag === "rich-textarea" ||
      el.isContentEditable ||
      el.id === "prompt-textarea"
    );
  }

  isSendButtonElement(el) {
    if (!el) return false;
    // Walk up to 4 levels to find a send button ancestor
    let node = el;
    for (let i = 0; i < 4; i++) {
      if (!node) break;
      const attr = (node.getAttribute && node.getAttribute('data-testid')) || '';
      const aria = (node.getAttribute && node.getAttribute('aria-label')) || '';
      const tooltip = (node.getAttribute && node.getAttribute('title')) || '';
      if (
        attr.toLowerCase().includes('send') ||
        aria.toLowerCase().includes('send') ||
        tooltip.toLowerCase().includes('send') ||
        (node.tagName === 'BUTTON' && node.closest && node.closest('[data-testid*="send"]'))
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  extractText(element) {
    if (!element) return "";
    // textarea value takes priority; contenteditable uses innerText
    if (element.value !== undefined && element.value !== null) return element.value;
    return (element.innerText || element.textContent || "").trim();
  }

  updateInputText(element, newText) {
    if (!element) return;
    if (element.value !== undefined) {
      element.value = newText;
    } else {
      element.innerText = newText;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  releaseNativeSubmit(inputElement, isEnterKey) {
    if (isEnterKey) {
      // Re-dispatch the Enter key event so the native form handler fires
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      });
      inputElement.dispatchEvent(enterEvent);
    } else {
      // Click the send button
      const btn = (
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label*="Send"]') ||
        document.querySelector('button[title*="Send"]')
      );
      if (btn) btn.click();
    }
  }

  detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("gemini") || host.includes("google")) return "Gemini";
    if (host.includes("openai") || host.includes("chatgpt")) return "ChatGPT";
    return "AI Platform";
  }
}

window.ASIPEDOMInterceptor = ASIPEDOMInterceptor;
