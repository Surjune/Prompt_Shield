class ASIPEDOMInterceptor {
  constructor(onPromptSubmit) {
    this.onPromptSubmit = onPromptSubmit;
    this.isInteracting = false;
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
      (document.head || document.documentElement).appendChild(script);
      console.log("[ASIPE ContentScript] Injected main-world active network interceptor.");
    } catch (e) {
      console.error("[ASIPE ContentScript] Script injection failed:", e);
    }
  }

  // Bind capture phase listeners strictly to active submission events
  bindSubmitEventCapture() {
    const handleCapture = async (event) => {
      // 1. Must be an active submission event (Enter keypress without Shift or Click on Send button)
      const isSendButton = this.isSendButtonElement(event.target);
      const isEnterKey = (event.type === 'keydown' || event.type === 'keyup') && event.key === 'Enter' && !event.shiftKey;

      if (!isSendButton && !isEnterKey) return;

      // 2. Locate ONLY the active input field (ignoring historical chat messages)
      const activeInputElem = this.findActiveInputElement(event.target);
      if (!activeInputElem) return;

      const promptText = this.extractText(activeInputElem);
      if (!promptText || !promptText.trim()) return;

      // Halt propagation to prevent synthetic delegation
      event.preventDefault();
      event.stopImmediatePropagation();

      if (this.isInteracting) return;
      this.isInteracting = true;

      console.log("[ASIPE DOMInterceptor] Active submission intercepted:", event.type);
      const decision = await this.onPromptSubmit(promptText, this.detectPlatform());
      this.isInteracting = false;

      if (decision.action === "ALLOW") {
        this.releaseNativeSubmit(activeInputElem, isEnterKey);
      } else if (decision.action === "REDACT" && decision.sanitized_prompt) {
        this.updateInputText(activeInputElem, decision.sanitized_prompt);
        this.releaseNativeSubmit(activeInputElem, isEnterKey);
      }
    };

    ['keydown', 'click', 'pointerdown', 'submit'].forEach(eventType => {
      window.addEventListener(eventType, handleCapture, true);
    });
  }

  // Strict query targeting ONLY active prompt entry containers
  findActiveInputElement(target) {
    if (this.isActiveInputField(target)) return target;
    return document.querySelector(
      '#prompt-textarea, rich-textarea div[contenteditable="true"], rich-textarea p, textarea, div[aria-label*="Enter a prompt"]'
    );
  }

  isActiveInputField(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    return tag === "textarea" || tag === "rich-textarea" || el.isContentEditable || el.id === "prompt-textarea";
  }

  isSendButtonElement(el) {
    if (!el) return false;
    const attr = (el.getAttribute && el.getAttribute('data-testid')) || '';
    const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
    return attr.includes('send') || aria.toLowerCase().includes('send') || (el.closest && el.closest('button[data-testid="send-button"], button[aria-label*="Send"]'));
  }

  extractText(element) {
    if (!element) return "";
    return element.value !== undefined ? element.value : (element.innerText || element.textContent || "");
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
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      });
      inputElement.dispatchEvent(enterEvent);
    } else {
      const btn = document.querySelector('button[aria-label*="Send"], button[data-testid="send-button"]');
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
