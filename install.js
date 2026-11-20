"use strict";

if (window.isSecureContext && location.protocol !== "file:" && "serviceWorker" in navigator) {
  const installTools = document.getElementById("install-tools");
  const installButton = document.getElementById("install-button");
  const installHelp = document.getElementById("install-help");
  const offlineStatus = document.getElementById("offline-status");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let installPrompt = null;

  function syncInstallTools() {
    installTools.hidden = standalone.matches || navigator.standalone === true;
    installButton.hidden = installPrompt === null;
    installHelp.hidden = installPrompt !== null;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    syncInstallTools();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installTools.hidden = true;
  });

  standalone.addEventListener("change", syncInstallTools);
  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      return;
    }

    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
    } catch {
      installHelp.open = true;
    } finally {
      if (!installTools.hidden) {
        syncInstallTools();
      }
    }
  });

  syncInstallTools();

  navigator.serviceWorker.register("./sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => { offlineStatus.textContent = "Lista para usar sin conexión."; })
    .catch(() => {
      offlineStatus.textContent = "No se pudo preparar el uso sin conexión. Vuelve a abrir la app con internet.";
    });
}
