(() => {
  let settings = { enabled: true, direction: "pt-en" };
  let ready = false;
  let host;
  let card;
  let result;
  let anchor;
  let sequence = 0;
  let debounce;

  chrome.storage.local.get(settings).then(value => {
    settings = value;
    ready = true;
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of ["enabled", "direction"]) {
      if (changes[key]) settings[key] = changes[key].newValue ?? (key === "enabled" ? true : "pt-en");
    }
    close();
  });

  function close() {
    clearTimeout(debounce);
    sequence++;
    host?.remove();
    host = card = result = anchor = undefined;
  }

  function excluded(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') ||
      !!element?.isContentEditable;
  }

  function schedule(event) {
    if (event.composedPath().includes(host)) return;
    clearTimeout(debounce);
    // Invalidate immediately, so an earlier request cannot update while selection settles.
    sequence++;
    debounce = setTimeout(showSelection, 180);
  }

  async function showSelection() {
    if (!ready || !settings.enabled) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !selection.rangeCount || excluded(selection.anchorNode) || excluded(selection.focusNode) ||
        excluded(document.activeElement)) { close(); return; }
    const range = selection.getRangeAt(0);
    if (range.cloneContents().querySelector('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
      close(); return;
    }
    close();
    anchor = range.getBoundingClientRect();
    createCard(text);
    if (new TextEncoder().encode(text).length > 500) {
      result.textContent = "Selecione um texto menor (máximo de 500 bytes).";
      position();
      return;
    }
    const request = ++sequence;
    try {
      const response = await chrome.runtime.sendMessage({ type: "translate", text, direction: settings.direction });
      if (request !== sequence || !host) return;
      result.textContent = response?.ok ? decodeEntities(response.translation) :
        (response?.error || "Não foi possível traduzir. Tente novamente.");
    } catch {
      if (request !== sequence || !host) return;
      result.textContent = "A extensão foi atualizada ou está indisponível. Recarregue esta página.";
    }
    if (request === sequence) position();
  }

  function decodeEntities(text) {
    // Decode entities without interpreting the provider's text as HTML markup.
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return textarea.value;
  }

  function createCard(text) {
    host = document.createElement("div");
    host.style.cssText = "all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { color-scheme: light; }
      * { box-sizing: border-box; }
      section { width: min(340px, calc(100vw - 20px)); max-height: calc(100vh - 20px); overflow: auto;
        padding: 16px; background: #fff; color: #172b45; border: 1px solid #d9e2ef; border-radius: 12px;
        box-shadow: 0 8px 32px #172b4533; font: 14px/1.5 system-ui, sans-serif; text-align: left; }
      header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      strong { color: #245bd6; font-size: 12px; }
      button { border: 0; border-radius: 5px; background: #eff3f9; color: #172b45; font: 20px system-ui;
        cursor: pointer; width: 28px; height: 28px; flex-shrink: 0; }
      button:focus-visible { outline: 2px solid #245bd6; }
      p { margin: 10px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
      .original { color: #64748b; font-size: 12px; max-height: 72px; overflow: auto; }
      .note { font-size: 10px; color: #64748b; border-top: 1px solid #e5eaf1; padding-top: 9px; }
    `;
    card = document.createElement("section");
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "Tradução do texto selecionado");
    const header = document.createElement("header");
    const label = document.createElement("strong");
    label.textContent = settings.direction === "en-pt" ? "Inglês → Português" : "Português → Inglês";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "×";
    button.setAttribute("aria-label", "Fechar tradução");
    button.addEventListener("click", close);
    const original = document.createElement("p");
    original.className = "original";
    original.textContent = text;
    result = document.createElement("p");
    result.setAttribute("role", "status");
    result.setAttribute("aria-live", "polite");
    result.textContent = "Traduzindo…";
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Tradução via MyMemory · O texto selecionado é enviado ao serviço.";
    header.append(label, button);
    card.append(header, original, result, note);
    shadow.append(style, card);
    document.documentElement.append(host);
    position();
  }

  function position() {
    if (!host || !anchor) return;
    const box = card.getBoundingClientRect();
    const maxX = Math.max(10, window.innerWidth - box.width - 10);
    const maxY = Math.max(10, window.innerHeight - box.height - 10);
    const top = anchor.bottom + 8 + box.height <= window.innerHeight - 10 ? anchor.bottom + 8 : anchor.top - box.height - 8;
    host.style.setProperty("left", Math.max(10, Math.min(anchor.left, maxX)) + "px", "important");
    host.style.setProperty("top", Math.max(10, Math.min(top, maxY)) + "px", "important");
  }

  document.addEventListener("pointerup", schedule, true);
  document.addEventListener("keyup", event => {
    if (event.key === "Escape") return;
    if (event.key === "Shift" || event.key.startsWith("Arrow") || (event.ctrlKey && event.key.toLowerCase() === "a")) schedule(event);
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); }, true);
  document.addEventListener("pointerdown", event => {
    if (!event.composedPath().includes(host)) close();
  }, true);
  window.addEventListener("scroll", event => {
    if (!event.composedPath().includes(host)) close();
  }, true);
  window.addEventListener("resize", close);
})();
