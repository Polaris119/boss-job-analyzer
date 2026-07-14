(function () {
  const BUTTON_ID = "job-resume-assistant-button";
  const NOTICE_ID = "job-resume-assistant-notice";
  const extractor = globalThis.JobCaptureExtractor;
  const bridge = globalThis.JobCaptureBridge;
  let lastUrl = location.href;
  let renderTimer;
  let contextInvalidated = false;

  async function clearStaleCurrentJob() {
    if (!hasValidExtensionContext()) return;
    try {
      const currentJob = await bridge.getCurrentJob();
      if (currentJob?.url && currentJob.url !== location.href) await bridge.removeCurrentJob();
    } catch (error) {
      if (isContextInvalidError(error)) contextInvalidated = true;
    }
  }

  function hasValidExtensionContext() {
    try {
      return bridge.hasValidExtensionContext();
    } catch {
      return false;
    }
  }

  function isContextInvalidError(error) {
    return contextInvalidated
      || !hasValidExtensionContext()
      || /extension context invalidated/i.test(String(error?.message || error));
  }

  function showNotice(message, type = "error", actions = []) {
    document.getElementById(NOTICE_ID)?.remove();
    const notice = document.createElement("div");
    notice.id = NOTICE_ID;
    notice.dataset.type = type;
    notice.setAttribute("role", type === "error" ? "alert" : "status");
    const close = document.createElement("button");
    close.className = "job-resume-assistant-notice-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭提示");
    close.addEventListener("click", () => notice.remove());
    const copy = document.createElement("span");
    copy.textContent = message;
    notice.append(close, copy);
    if (actions.length) {
      const actionRow = document.createElement("div");
      actionRow.className = "job-resume-assistant-notice-actions";
      actions.forEach(({ label, handler, primary = false }) => {
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = label;
        action.dataset.primary = String(primary);
        action.addEventListener("click", async () => {
          action.disabled = true;
          try { await handler(); }
          catch (error) { showNotice(`操作没有完成：${error?.message || error}`); }
        });
        actionRow.appendChild(action);
      });
      notice.appendChild(actionRow);
    }
    document.body.appendChild(notice);
    if (type !== "context") setTimeout(() => notice.remove(), actions.length ? 9000 : 1000);
  }

  async function handleClick(button) {
    button.dataset.loading = "true";
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "正在读取当前岗位…";
    try {
      if (!hasValidExtensionContext()) throw new Error("Extension context invalidated");
      await bridge.removeCurrentJob();
      const job = await extractor.captureStableJob();
      await bridge.saveCurrentJob(job);
      const result = await bridge.enqueueCurrentJob();
      if (!result?.ok) {
        if (result?.needsSetup) {
          showNotice(result.message, "info");
          await bridge.openSidePanel();
          return;
        }
        throw new Error(result?.error || result?.message || "暂时无法加入分析队列");
      }
      if (result.status === "completed") {
        showCompletedNotice(result);
        return;
      }
      const type = result.status === "active" ? "info" : "success";
      showNotice(result.message, type);
    } catch (error) {
      if (isContextInvalidError(error)) {
        contextInvalidated = true;
        button.remove();
        showNotice("BOSS直聘岗位分析助手刚刚更新，当前页面仍在使用旧版本。请刷新此 BOSS 页面后重试。", "context");
        return;
      }
      showNotice(`BOSS直聘岗位分析助手：${error.message}`);
    } finally {
      if (!button.isConnected) return;
      button.dataset.loading = "false";
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function showCompletedNotice(result) {
    showNotice(result.message, "info", [
      {
        label: "查看结果",
        primary: true,
        handler: async () => {
          const response = await bridge.openTaskResult(result.taskId);
          if (!response?.ok) throw new Error(response?.error || "无法打开分析结果");
          document.getElementById(NOTICE_ID)?.remove();
        }
      },
      {
        label: "重新分析",
        handler: async () => {
          const response = await bridge.enqueueCurrentJob({ force: true });
          if (!response?.ok) throw new Error(response?.error || response?.message || "无法重新分析");
          showNotice(response.message, "success");
        }
      }
    ]);
  }

  function renderButton() {
    document.getElementById(BUTTON_ID)?.remove();
    if (contextInvalidated || !extractor.isJobPage()) return;
    if (!hasValidExtensionContext()) {
      contextInvalidated = true;
      showNotice("BOSS直聘岗位分析助手刚刚更新，请刷新此 BOSS 页面后继续使用。", "context");
      return;
    }
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "✨ AI 分析当前岗位";
    button.setAttribute("aria-label", button.textContent);
    button.addEventListener("click", () => handleClick(button));
    document.body.appendChild(button);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderButton, 300);
  }

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      clearStaleCurrentJob();
      scheduleRender();
      return;
    }
    if (!document.getElementById(BUTTON_ID)) scheduleRender();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", scheduleRender);
  scheduleRender();
})();
