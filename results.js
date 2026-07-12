import { getTask, migrateLegacyHistory, putTask } from "./task-store.mjs";

const state = { record: null };
const ids = ["job-title", "job-meta", "report-panel", "resume-panel", "match-section", "suggestion-section", "roadmap-section", "resume-fields", "resume-theme-color", "add-resume-section", "download-markdown", "save-result", "export-pdf", "empty", "toast"];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  await migrateLegacyHistory();
  const parameters = new URLSearchParams(location.search);
  const recordId = parameters.get("task") || parameters.get("record");
  state.record = globalThis.__RESULTS_PREVIEW_RECORD__ || await getTask(recordId) || null;
  if (!state.record) {
    elements.empty.hidden = false;
    document.querySelector(".top-tabs").hidden = true;
    elements["report-panel"].hidden = true;
    return;
  }
  state.record.resumeThemeColor = validThemeColor(state.record.resumeThemeColor) ? state.record.resumeThemeColor : "#087f7c";
  render();
}

function bindEvents() {
  document.querySelectorAll(".top-tab").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  elements["download-markdown"].addEventListener("click", downloadMarkdown);
  elements["save-result"].addEventListener("click", saveRecord);
  elements["export-pdf"].addEventListener("click", exportPdf);
  elements["add-resume-section"].addEventListener("click", addResumeSection);
  elements["resume-theme-color"].addEventListener("input", (event) => {
    state.record.resumeThemeColor = event.target.value;
    applyResumeTheme();
  });
}

function render() {
  const { job, analysis } = state.record;
  const companyAndJob = [job.company, job.title || "岗位分析结果"].filter(Boolean).join(" · ");
  elements["job-title"].textContent = companyAndJob;
  const salary = JobSalaryParser.extractReadableSalary([job.salary]);
  elements["job-meta"].textContent = [salary, formatDate(state.record.createdAt)].filter(Boolean).join(" · ");
  document.title = `${companyAndJob} - 分析结果`;
  renderMatch(analysis);
  renderSuggestions(analysis);
  renderRoadmap(analysis);
  renderResume();
  elements["resume-theme-color"].value = state.record.resumeThemeColor;
  applyResumeTheme();
}

function renderMatch(analysis) {
  const panel = elements["match-section"];
  panel.replaceChildren(node("h2", "", "岗位匹配"), node("p", "summary", analysis.jobSummary));
  const list = node("ul", "result-list");
  analysis.requirements.forEach((requirement) => {
    const item = node("li", "result-item");
    item.append(node("strong", "", requirement.requirement));
    if (requirement.rationale) item.append(node("p", "", requirement.rationale));
    if (requirement.evidence.length) item.append(node("p", "", `证据：${requirement.evidence.join("；")}`));
    const meta = node("div", "meta");
    meta.append(node("span", `pill ${requirement.status}`, statusLabel(requirement.status)));
    meta.append(node("span", "pill", requirement.priority === "must" ? "必须项" : "加分项"));
    item.append(meta);
    list.append(item);
  });
  panel.append(list);
}

function renderSuggestions(analysis) {
  const panel = elements["suggestion-section"];
  panel.replaceChildren(node("h2", "", "简历优化建议"));
  const list = node("ul", "result-list");
  analysis.suggestions.forEach((suggestion) => {
    const item = node("li", "result-item");
    item.append(node("strong", "", suggestion.title), node("p", "", suggestion.detail));
    if (suggestion.evidence) item.append(node("p", "", `依据：${suggestion.evidence}`));
    list.append(item);
  });
  panel.append(list);
  if (analysis.interviewFocus.length) {
    panel.append(node("h3", "", "面试准备重点"), simpleList(analysis.interviewFocus));
  }
}

function renderRoadmap(analysis) {
  const panel = elements["roadmap-section"];
  panel.replaceChildren(node("h2", "", "能力缺口与学习路线"));
  if (analysis.skillGaps.length) {
    panel.append(node("h3", "", "能力缺口"));
    const gaps = node("ul", "result-list");
    analysis.skillGaps.forEach((gap) => {
      const item = node("li", "result-item");
      item.append(node("strong", "", gap.skill), node("p", "", gap.reason), node("span", "pill", `优先级：${gap.priority}`));
      gaps.append(item);
    });
    panel.append(gaps);
  }
  panel.append(node("h3", "", "学习阶段"));
  const stages = node("ul", "result-list");
  analysis.roadmap.forEach((stage) => {
    const item = node("li", "result-item");
    item.append(node("strong", "", [stage.stage, stage.duration].filter(Boolean).join(" · ")));
    if (stage.goals.length) item.append(simpleList(stage.goals));
    if (stage.deliverable) item.append(node("p", "", `验收产出：${stage.deliverable}`));
    stages.append(item);
  });
  panel.append(stages);
}

function renderResume() {
  const resume = state.record.optimizedResume;
  const container = elements["resume-fields"];
  container.replaceChildren();
  [["姓名", "fullName"], ["目标定位", "headline"], ["联系方式", "contactLine"], ["个人概述", "summary"]].forEach(([labelText, key]) => {
    const label = node("label", "field");
    label.append(node("span", "", labelText));
    const control = document.createElement(key === "summary" ? "textarea" : "input");
    control.value = resume[key] || "";
    control.addEventListener("input", () => { resume[key] = control.value; });
    label.append(control);
    container.append(label);
  });
  resume.sections.forEach((section, sectionIndex) => {
    const sectionEditor = node("section", "resume-section-editor");
    const sectionHead = node("div", "section-editor-head");
    const title = document.createElement("input");
    title.className = "section-title";
    title.value = section.title;
    title.setAttribute("aria-label", "简历章节标题");
    title.addEventListener("input", () => { section.title = title.value; });
    const sectionActions = node("div", "edit-actions");
    sectionActions.append(
      actionButton("上移", sectionIndex === 0, () => moveSection(sectionIndex, -1)),
      actionButton("下移", sectionIndex === resume.sections.length - 1, () => moveSection(sectionIndex, 1)),
      actionButton("删除区块", false, () => { resume.sections.splice(sectionIndex, 1); renderResume(); })
    );
    sectionHead.append(title, sectionActions);
    sectionEditor.append(sectionHead);
    section.items.forEach((item, itemIndex) => {
      const itemEditor = node("div", "resume-item-editor");
      const textarea = document.createElement("textarea");
      textarea.className = "resume-item";
      textarea.value = item;
      textarea.setAttribute("aria-label", `${section.title}第 ${itemIndex + 1} 条`);
      textarea.addEventListener("input", () => { section.items[itemIndex] = textarea.value; });
      const itemActions = node("div", "edit-actions item-actions");
      itemActions.append(
        actionButton("上移", itemIndex === 0, () => moveItem(sectionIndex, itemIndex, -1)),
        actionButton("下移", itemIndex === section.items.length - 1, () => moveItem(sectionIndex, itemIndex, 1)),
        actionButton("删除", false, () => { section.items.splice(itemIndex, 1); renderResume(); })
      );
      itemEditor.append(textarea, itemActions);
      sectionEditor.append(itemEditor);
    });
    const addItem = actionButton("+ 添加条目", false, () => { section.items.push(""); renderResume(); });
    addItem.classList.add("add-item-button");
    sectionEditor.append(addItem);
    container.append(sectionEditor);
  });
}

function addResumeSection() {
  state.record.optimizedResume.sections.push({ title: "新建区块", items: [""] });
  renderResume();
  elements["resume-fields"].lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function moveSection(index, offset) {
  const sections = state.record.optimizedResume.sections;
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= sections.length) return;
  [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
  renderResume();
}

function moveItem(sectionIndex, itemIndex, offset) {
  const items = state.record.optimizedResume.sections[sectionIndex].items;
  const nextIndex = itemIndex + offset;
  if (nextIndex < 0 || nextIndex >= items.length) return;
  [items[itemIndex], items[nextIndex]] = [items[nextIndex], items[itemIndex]];
  renderResume();
}

function actionButton(text, disabled, handler) {
  const button = node("button", "edit-button", text);
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function applyResumeTheme() {
  elements["resume-fields"].style.setProperty("--resume-accent", state.record.resumeThemeColor);
}

function activateTab(name) {
  document.querySelectorAll(".top-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  elements["report-panel"].hidden = name !== "report";
  elements["resume-panel"].hidden = name !== "resume";
}

async function saveRecord(showMessage = true) {
  await putTask(state.record);
  if (showMessage) showToast("修改已保存在本机。", true);
}

function downloadMarkdown() {
  const markdown = buildMarkdown();
  downloadBlob(markdown, safeFilename(`${state.record.job.company || "公司"}-${state.record.job.title || "岗位"}-分析报告.md`), "text/markdown;charset=utf-8");
}

async function exportPdf() {
  await saveRecord(false);
  await chrome.storage.local.set({ printResume: { job: state.record.job, resume: state.record.optimizedResume, themeColor: state.record.resumeThemeColor, generatedAt: new Date().toISOString() } });
  await chrome.tabs.create({ url: chrome.runtime.getURL("resume.html") });
}

function buildMarkdown() {
  const { job, analysis, optimizedResume } = state.record;
  const salary = JobSalaryParser.extractReadableSalary([job.salary]);
  return [
    `# ${[job.company, job.title || "岗位"].filter(Boolean).join("｜")}分析报告`, "", `- 公司：${job.company || "未识别"}`, `- 薪资：${salary || "未识别"}`, `- 原始页面：${job.url}`, "",
    "## 1. 岗位概述", "", analysis.jobSummary, "",
    "## 2. 岗位要求与简历证据矩阵", "", "| 要求 | 类型 | 状态 | 简历证据 | 判断依据 |", "| --- | --- | --- | --- | --- |",
    ...analysis.requirements.map((item) => `| ${md(item.requirement)} | ${item.priority === "must" ? "必须项" : "加分项"} | ${statusLabel(item.status)} | ${md(item.evidence.join("；") || "无")} | ${md(item.rationale)} |`),
    "", "## 3. 简历优化建议", "", ...analysis.suggestions.flatMap((item, index) => [`### ${index + 1}. ${item.title}`, "", item.detail, "", `依据：${item.evidence || "无"}`, ""]),
    "## 4. 能力缺口", "", ...analysis.skillGaps.map((item) => `- **${item.skill}**（${item.priority}）：${item.reason}`),
    "", "## 5. 学习路线", "", ...analysis.roadmap.flatMap((item, index) => [`### ${index + 1}. ${item.stage}${item.duration ? `（${item.duration}）` : ""}`, "", ...item.goals.map((goal) => `- ${goal}`), "", `验收产出：${item.deliverable}`, ""]),
    "## 6. 面试准备重点", "", ...analysis.interviewFocus.map((item) => `- ${item}`), "",
    "## 7. 待用户确认的信息", "", ...(optimizedResume.pendingConfirmations.length ? optimizedResume.pendingConfirmations.map((item) => `- ${item.text}${item.reason ? `：${item.reason}` : ""}`) : ["- 无；仍建议人工复核全部事实。"]), ""
  ].join("\n");
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message, success) {
  elements.toast.textContent = message;
  elements.toast.style.background = success ? "#087c45" : "#b42318";
  elements.toast.hidden = false;
  setTimeout(() => { elements.toast.hidden = true; }, 3000);
}
function simpleList(items) { const list = node("ul"); items.forEach((item) => list.append(node("li", "", item))); return list; }
function node(tag, className = "", text = "") { const element = document.createElement(tag); if (className) element.className = className; if (text) element.textContent = text; return element; }
function statusLabel(value) { return ({ met: "已满足", partial: "部分满足", missing: "缺失" })[value] || "缺失"; }
function md(value) { return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>"); }
function safeFilename(value) { return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 100); }
function formatDate(value) { try { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return ""; } }
function validThemeColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")); }
