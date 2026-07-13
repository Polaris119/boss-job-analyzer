(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./text-utils.js"), require("./salary-parser.js"));
  } else {
    root.JobCaptureExtractor = factory(root.JobCaptureText, root.JobSalaryParser);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (textUtils, salaryParser) {
  const JOB_HINTS = ["职位描述", "岗位职责", "任职要求"];
  const { hash, normalizeText, sliceByHeadings } = textUtils;

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
      for (const element of root.querySelectorAll(selector)) {
        if (!isVisible(element)) continue;
        if (normalizeText(element.innerText)) return element;
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

  function extractSalary(root = document) {
    const candidates = [];
    for (const element of root.querySelectorAll(".job-salary, .salary, [class*='salary']")) {
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
    return salaryParser.extractReadableSalary(candidates);
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
    if (!description || description.length < 30) throw new Error("没有识别到完整职位描述，请确认当前是岗位详情页");

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

  return { captureStableJob, extractJob, extractSalary, findCurrentJobDetail, isJobPage, isVisible, visibleTextFromFirst };
});
