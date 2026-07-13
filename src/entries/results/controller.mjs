import { buildAnalysisMarkdown } from "../../features/exports/markdown-exporter.mjs";
import { localStore } from "../../platform/chrome/storage.mjs";
import { openExtensionPage } from "../../platform/chrome/tabs.mjs";
import { getTask, putTask } from "../../platform/indexeddb/task-repository.mjs";
import { ROUTES } from "../../shared/constants/routes.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { node } from "../../shared/ui/dom.mjs";
import { showToast as showToastMessage } from "../../shared/ui/toast.mjs";
import { downloadBlob } from "../../shared/utils/download.mjs";
import { formatDate, safeFilename, validThemeColor } from "../../shared/utils/value.mjs";
import { renderReport } from "./report-view.mjs";

const state = { record: null };
const ids = ["job-title", "job-meta", "report-panel", "resume-panel", "overview-section", "strengths-section", "gaps-section", "actions-section", "knowledge-section", "short-term-section", "long-term-section", "interview-section", "resume-fields", "resume-theme-color", "add-resume-section", "download-markdown", "save-result", "export-pdf", "empty", "toast"];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
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
  setupReportNavigation();
}

function render() {
  const { job, analysis } = state.record;
  const companyAndJob = [job.company, job.title || "岗位分析结果"].filter(Boolean).join(" · ");
  elements["job-title"].textContent = companyAndJob;
  const salary = JobSalaryParser.extractReadableSalary([job.salary]);
  elements["job-meta"].textContent = [salary, formatDate(state.record.createdAt)].filter(Boolean).join(" · ");
  document.title = `${companyAndJob} - 分析结果`;
  renderReport(state.record, elements);
  const hasResume = Boolean(state.record.optimizedResume);
  document.querySelector(".top-tabs").classList.toggle("single-tab", !hasResume);
  document.querySelector('[data-tab="resume"]').hidden = !hasResume;
  elements["resume-panel"].hidden = true;
  if (hasResume) {
    renderResume();
    elements["resume-theme-color"].value = state.record.resumeThemeColor;
    applyResumeTheme();
  }
}

function setupReportNavigation() {
  const links = [...document.querySelectorAll("#report-nav a")];
  let lockedUntil = 0;
  const setCurrent = (targetId) => links.forEach((link) => link.setAttribute("aria-current", String(link.dataset.target === targetId)));
  links.forEach((link) => link.addEventListener("click", () => {
    lockedUntil = Date.now() + 900;
    setCurrent(link.dataset.target);
  }));
  if (!globalThis.IntersectionObserver) return;
  const observer = new IntersectionObserver((entries) => {
    if (Date.now() < lockedUntil) return;
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    setCurrent(visible.target.id);
  }, { rootMargin: "-18% 0px -68%", threshold: [0, 0.2, 0.6] });
  document.querySelectorAll("[data-report-section]").forEach((section) => observer.observe(section));
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
  const salary = JobSalaryParser.extractReadableSalary([state.record.job.salary]);
  const markdown = buildAnalysisMarkdown(state.record, salary);
  downloadBlob(markdown, safeFilename(`${state.record.job.company || "公司"}-${state.record.job.title || "岗位"}-分析报告.md`), "text/markdown;charset=utf-8");
}

async function exportPdf() {
  await saveRecord(false);
  await localStore.set({ [STORAGE_KEYS.PRINT_RESUME]: { job: state.record.job, resume: state.record.optimizedResume, themeColor: state.record.resumeThemeColor, generatedAt: new Date().toISOString() } });
  await openExtensionPage(ROUTES.RESUME_PRINT);
}

function showToast(message, success) { showToastMessage(elements.toast, message, success); }
