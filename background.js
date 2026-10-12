const DIRECTIONS = {
  "pt-en": "pt|en",
  "en-pt": "en|pt"
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "translate") return;
  translate(message).then(sendResponse);
  return true;
});

async function translate({ text, direction }) {
  if (typeof text !== "string" || !text.trim() || !Object.hasOwn(DIRECTIONS, direction)) {
    return { ok: false, error: "Seleção ou direção inválida." };
  }
  text = text.trim();
  if (new TextEncoder().encode(text).length > 500) {
    return { ok: false, error: "Selecione um texto menor (máximo de 500 bytes)." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", DIRECTIONS[direction]);
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (response.status === 429) return quotaError();
    if (!response.ok) throw new Error("http");
    const data = await response.json();
    if (data.quotaFinished === true || Number(data.responseStatus) === 429 ||
        /USED ALL AVAILABLE FREE TRANSLATIONS|QUOTA|DAILY LIMIT/i.test(data.responseDetails || "")) {
      return quotaError();
    }
    if (Number(data.responseStatus) !== 200 || typeof data.responseData?.translatedText !== "string" ||
        !data.responseData.translatedText.trim()) throw new Error("invalid");
    return { ok: true, translation: data.responseData.translatedText };
  } catch (error) {
    if (error.name === "AbortError") return { ok: false, error: "A tradução demorou demais. Tente novamente." };
    if (error instanceof TypeError) return { ok: false, error: "Não foi possível conectar. Verifique sua internet e tente novamente." };
    return { ok: false, error: "O serviço de tradução está indisponível. Tente novamente mais tarde." };
  } finally {
    clearTimeout(timer);
  }
}

function quotaError() {
  return { ok: false, error: "O limite gratuito do serviço foi atingido. Tente novamente mais tarde." };
}
