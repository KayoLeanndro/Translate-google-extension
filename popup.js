const enabled = document.getElementById("enabled");
const direction = document.getElementById("direction");
const status = document.getElementById("status");
enabled.disabled = direction.disabled = true;
chrome.storage.local.get({ enabled: true, direction: "pt-en" }).then(settings => {
  enabled.checked = settings.enabled;
  direction.value = settings.direction === "en-pt" ? "en-pt" : "pt-en";
  enabled.disabled = direction.disabled = false;
}).catch(() => { status.textContent = "Não foi possível carregar as preferências. Reabra o painel."; });

async function save() {
  try {
    await chrome.storage.local.set({ enabled: enabled.checked, direction: direction.value });
    status.textContent = "Preferências salvas.";
  } catch {
    status.textContent = "Não foi possível salvar. Tente novamente.";
  }
}
enabled.addEventListener("change", save);
direction.addEventListener("change", save);
