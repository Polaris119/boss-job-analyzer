(function () {
  const BUTTON_ID = "job-resume-assistant-button";
  const NOTICE_ID = "job-resume-assistant-notice";
  const JOB_HINTS = ["职位描述", "岗位职责", "任职要求"];
  let lastUrl = location.href;
  let renderTimer;
  let contextInvalidated = false;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function pageText() {
    return normalizeText(document.body?.innerText || "");
  }

  function isVisible(element) {
    if (!element || element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isJobPage() {
    const pathMatch = /\/job_detail\//.test(location.pathname);
    const domMatch = [...document.querySelectorAll(".job-detail, .job-detail-box, .job-sec, [class*='job-detail']")]
      .some(isVisible);
    const text = pageText();
    return (pathMatch || domMatch) && JOB_HINTS.some((hint) => text.includes(hint));
  }

  function visibleElementFromFirst(selectors, root = document) {
    for (const selector of selectors) {
      const elements = root.querySelectorAll(selector);
      for (const element of elements) {
        if (!isVisible(element)) continue;
        const value = normalizeText(element.innerText);
        if (value) return element;
      }
    }
    return null;
  }

  function visibleTextFromFirst(selectors, root = document) {
    const element = visibleElementFromFirst(selectors, root);
    return element ? normalizeText(element.innerText) : "";
  }

  function findCurrentJobDetail() {
    const candidates = document.querySelectorAll("div[class*='job-detail-box']");
    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      const title = visibleTextFromFirst(["span[class*='job-name']", ".job-name"], candidate);
      const description = visibleTextFromFirst(["p.desc", ".job-sec-text", "[class*='job-sec-text']"], candidate);
      if (title && description.length >= 30) return candidate;
    }
    return document;
  }

  function extractCompany(root) {
    const bossInfo = visibleTextFromFirst(["div[class*='boss-info-attr']"], root);
    if (bossInfo) return normalizeText(bossInfo.split(/\s+·\s+|\n/)[0]);

    const visible = visibleTextFromFirst([
      "a[ka='job-detail-company_custompage']",
      "a[ka*='job-detail-company']",
      ".sider-company .company-info a",
      "[class*='sider-company'] [class*='company-info'] a",
      ".job-detail-company .company-name",
      ".company-info .company-name",
      ".company-info h3",
      ".company-name",
      "[class*='company-name']",
      ".company-info a"
    ], root);
    if (visible) return visible.split("\n").map(normalizeText).find(Boolean) || "";

    for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
      try {
        const records = JSON.parse(script.textContent || "null");
        const entries = Array.isArray(records) ? records : Array.isArray(records?.["@graph"]) ? records["@graph"] : [records];
        for (const entry of entries) {
          const name = normalizeText(entry?.hiringOrganization?.name || entry?.worksFor?.name);
          if (name) return name;
        }
      } catch {}
    }
    return "";
  }

  function textAroundHeading(label) {
    const candidates = document.querySelectorAll("h1, h2, h3, h4, dt, strong, span, div");
    for (const candidate of candidates) {
      if (!isVisible(candidate) || normalizeText(candidate.innerText) !== label) continue;
      const container = candidate.closest(".job-sec, .job-detail-section, section, [class*='job-sec']");
      if (!isVisible(container)) continue;
      const value = normalizeText(container.innerText);
      if (value.length > label.length + 30) return value;
    }
    return "";
  }

  function sliceByHeadings(text, starts, ends) {
    let start = -1;
    for (const heading of starts) {
      const index = text.indexOf(heading);
      if (index >= 0 && (start < 0 || index < start)) start = index;
    }
    if (start < 0) return "";
    let end = text.length;
    for (const heading of ends) {
      const index = text.indexOf(heading, start + 1);
      if (index >= 0 && index < end) end = index;
    }
    return text.slice(start, end);
  }

  function extractJob() {
    const detailRoot = findCurrentJobDetail();
    const title = visibleTextFromFirst(["span[class*='job-name']", ".job-name", ".name h1", "[class*='job-name']", "h1"], detailRoot);
    const salary = extractSalary(detailRoot);
    const company = extractCompany(detailRoot);
    const jobMeta = visibleTextFromFirst(["ul[class*='tag-list']", ".job-primary .info-primary p", ".job-location", "[class*='job-location']", "[class*='job-tags']"], detailRoot);
    const detail = visibleTextFromFirst(["p.desc", ".job-sec-text", ".job-detail-section .text", "[class*='job-sec-text']"], detailRoot)
      || textAroundHeading("职位描述")
      || sliceByHeadings(pageText(), ["职位描述"], ["工商信息", "公司介绍", "职位发布者"]);
    const description = normalizeText(detail);

    if (!description || description.length < 30) {
      throw new Error("没有识别到完整职位描述，请确认当前是岗位详情页");
    }

    const externalJobId = location.pathname.match(/\/job_detail\/([^/.?]+)/)?.[1] || "";
    const fallbackIdentity = `${company}|${title}|${jobMeta}|${description}`;
    const jobKey = externalJobId ? `boss:${externalJobId}` : `boss:fallback:${hash(fallbackIdentity)}`;
    return {
      id: jobKey,
      jobKey,
      externalJobId,
      fingerprint: hash(fallbackIdentity),
      url: location.href,
      title: title || document.title.split("_")[0] || "未命名岗位",
      salary,
      company,
      jobMeta,
      description,
      capturedAt: new Date().toISOString()
    };
  }

  async function addContentVersion(job) {
    const normalized = normalizeText([job.company, job.title, job.jobMeta, job.description].filter(Boolean).join("\n"));
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    job.contentHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    return job;
  }

  function jobSnapshotKey(job) {
    return [job.url, job.externalJobId, job.company, job.title, job.jobMeta, job.description].join("|");
  }

  async function captureStableJob() {
    const captureUrl = location.href;
    let previousKey = "";
    let latestJob;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 200));
      if (location.href !== captureUrl) throw new Error("岗位页面仍在切换，请稍后重试");
      latestJob = extractJob();
      const currentKey = jobSnapshotKey(latestJob);
      if (currentKey === previousKey) return addContentVersion(latestJob);
      previousKey = currentKey;
    }
    return addContentVersion(latestJob);
  }

  async function clearStaleCurrentJob() {
    if (!hasValidExtensionContext()) return;
    try {
      const { currentJob } = await chrome.storage.local.get("currentJob");
      if (currentJob?.url && currentJob.url !== location.href) await chrome.storage.local.remove("currentJob");
    } catch (error) {
      if (isContextInvalidError(error)) contextInvalidated = true;
    }
  }

  function extractSalary(root = document) {
    const candidates = [];
    const salaryElements = root.querySelectorAll(".job-salary, .salary, [class*='salary']");
    for (const element of salaryElements) {
      if (!isVisible(element)) continue;
      candidates.push(element.innerText, element.getAttribute("aria-label"), element.getAttribute("title"));
      candidates.push(...Object.values(element.dataset || {}));
      for (const pseudo of ["::before", "::after"]) {
        const content = getComputedStyle(element, pseudo).content;
        if (content && content !== "none") candidates.push(content.replace(/^['\"]|['\"]$/g, ""));
      }
    }

    document.querySelectorAll("meta[name='description'], meta[property='og:description'], meta[property='og:title']")
      .forEach((meta) => candidates.push(meta.content));
    candidates.push(document.title);
    document.querySelectorAll("script[type='application/ld+json'], script[type='application/json']")
      .forEach((script) => candidates.push(script.textContent?.slice(0, 200000)));

    return JobSalaryParser.extractReadableSalary(candidates);
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function hasValidExtensionContext() {
    try {
      return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidError(error) {
    return contextInvalidated
      || !hasValidExtensionContext()
      || /extension context invalidated/i.test(String(error?.message || error));
  }

  function showNotice(message, type = "error") {
    document.getElementById(NOTICE_ID)?.remove();
    const notice = document.createElement("div");
    notice.id = NOTICE_ID;
    notice.dataset.type = type;
    notice.setAttribute("role", type === "error" ? "alert" : "status");
    notice.textContent = message;
    document.body.appendChild(notice);
    if (type !== "context") setTimeout(() => notice.remove(), 5000);
  }

  async function handleClick(button) {
    button.dataset.loading = "true";
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "正在读取当前岗位…";
    try {
      if (!hasValidExtensionContext()) throw new Error("Extension context invalidated");
      await chrome.storage.local.remove("currentJob");
      const job = await captureStableJob();
      await chrome.storage.local.set({ currentJob: job });
      await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
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

  function renderButton() {
    document.getElementById(BUTTON_ID)?.remove();
    if (contextInvalidated || !isJobPage()) return;
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
