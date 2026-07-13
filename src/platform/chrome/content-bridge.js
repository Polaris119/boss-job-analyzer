(function (root) {
  function hasValidExtensionContext() {
    try {
      return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  async function getCurrentJob() {
    const { currentJob } = await chrome.storage.local.get("currentJob");
    return currentJob || null;
  }

  function removeCurrentJob() {
    return chrome.storage.local.remove("currentJob");
  }

  function saveCurrentJob(job) {
    return chrome.storage.local.set({ currentJob: job });
  }

  function openSidePanel() {
    return chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  }

  root.JobCaptureBridge = {
    getCurrentJob,
    hasValidExtensionContext,
    openSidePanel,
    removeCurrentJob,
    saveCurrentJob
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
