class ASIPEDOMInterceptor {
  constructor(onPromptSubmit) {
    this.onPromptSubmit = onPromptSubmit;
    this.isInteracting = false;
    this.targetSelectors = [
      '#prompt-textarea',                           // ChatGPT textarea
      'button[data-testid="send-button"]',          // ChatGPT send button
      'div[contenteditable="true"]',               // Gemini / Claude editable containers
      'button[aria-label*="Send"]',                 // Generic / Gemini send button
      'button[aria-label*="Submit"]'
    ];
    this.initObserver();
    this.initNativeFetchOverride();
  }

  initObserver() {
    this.attachListeners();
    const observer = new MutationObserver(() => this.attachListeners());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  attachListeners() {
    // 1. Textarea & Contenteditable Enter key interceptor (useCapture: true)
    const inputs = document.querySelectorAll('#prompt-textarea, div[contenteditable="true"], textarea');
    inputs.forEach(input => {
      if (!input.dataset.asipeBound) {
        input.dataset.asipeBound = "true";
        input.addEventListener('keydown', (e) => this.handleKeyDown(e, input), true);
      }
    });

    // 2. Send button click interceptor (useCapture: true)
    const buttons = document.querySelectorAll('button[data-testid="send-button"], button[aria-label*="Send"], button[type="submit"]');
    buttons.forEach(btn => {
      if (!btn.dataset.asipeBound) {
        btn.dataset.asipeBound = "true";
        btn.addEventListener('click', (e) => this.handleButtonClick(e), true);
      }
    });
  }

  async handleKeyDown(event, inputElement) {
    if (event.key === 'Enter' && !event.shiftKey && !this.isInteracting) {
      const text = this.extractText(inputElement);
      if (!text.trim()) return;

      // Intercept event synchronously at capture phase
      event.preventDefault();
      event.stopImmediatePropagation();

      this.isInteracting = true;
      const decision = await this.onPromptSubmit(text, this.detectPlatform());
      this.isInteracting = false;

      if (decision.action === "ALLOW") {
        this.releaseSubmission(inputElement);
      } else if (decision.action === "REDACT" && decision.sanitized_prompt) {
        this.updateInputText(inputElement, decision.sanitized_prompt);
        this.releaseSubmission(inputElement);
      }
    }
  }

  async handleButtonClick(event) {
    if (this.isInteracting) return;
    const inputElement = document.querySelector('#prompt-textarea, div[contenteditable="true"], textarea');
    if (!inputElement) return;

    const text = this.extractText(inputElement);
    if (!text.trim()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    this.isInteracting = true;
    const decision = await this.onPromptSubmit(text, this.detectPlatform());
    this.isInteracting = false;

    if (decision.action === "ALLOW") {
      this.releaseButtonSubmit(event.currentTarget);
    } else if (decision.action === "REDACT" && decision.sanitized_prompt) {
      this.updateInputText(inputElement, decision.sanitized_prompt);
      this.releaseButtonSubmit(event.currentTarget);
    }
  }

  extractText(element) {
    return element.value !== undefined ? element.value : (element.innerText || element.textContent || "");
  }

  updateInputText(element, newText) {
    if (element.value !== undefined) {
      element.value = newText;
    } else {
      element.innerText = newText;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  releaseSubmission(inputElement) {
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    });
    inputElement.dispatchEvent(enterEvent);
  }

  releaseButtonSubmit(buttonElement) {
    buttonElement.click();
  }

  detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("gemini")) return "Gemini";
    if (host.includes("openai") || host.includes("chatgpt")) return "ChatGPT";
    return "Unknown AI Platform";
  }

  initNativeFetchOverride() {
    // Native fetch monkey-patching for additional network-layer resilience
    const originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : "");
      if (url.includes("/backend-api/conversation") || url.includes("GenerateContent")) {
        // Platform backend API call detected
        console.log("[ASIPE Interceptor] Pre-flight fetch request monitored:", url);
      }
      return originalFetch.apply(this, args);
    };
  }
}

window.ASIPEDOMInterceptor = ASIPEDOMInterceptor;
