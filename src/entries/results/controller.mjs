import { buildAnalysisMarkdown } from "../../features/exports/markdown-exporter.mjs";
import { prepareResumePhoto } from "../../features/resume/photo-processor.mjs";
import {
  createResumeBullet,
  createResumeEntry,
  createResumeSection,
  DEFAULT_RESUME_THEME,
  hasResumeContent,
  inferResumeSectionKind,
  normalizeResumeDocument,
  normalizeResumePresentation
} from "../../features/resume/resume-document.mjs";
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
const ids = ["job-title", "job-meta", "report-panel", "resume-panel", "overview-section", "strengths-section", "gaps-section", "actions-section", "knowledge-section", "short-term-section", "long-term-section", "interview-section", "resume-fields", "resume-theme-color", "add-resume-section", "download-markdown", "save-result", "export-pdf", "resume-photo-file", "resume-photo-preview", "resume-photo-empty", "resume-photo-upload-text", "show-resume-photo", "delete-resume-photo", "empty", "toast"];
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
  state.record.resumeThemeColor = validThemeColor(state.record.resumeThemeColor) ? state.record.resumeThemeColor : DEFAULT_RESUME_THEME;
  if (state.record.optimizedResume) {
    state.record.optimizedResume = normalizeResumeDocument(state.record.optimizedResume);
    if (!hasResumeContent(state.record.optimizedResume)) state.record.optimizedResume = null;
  }
  state.record.resumePresentation = normalizeResumePresentation(state.record.resumePresentation);
  render();
}

function bindEvents() {
  document.querySelectorAll(".top-tab").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  elements["download-markdown"].addEventListener("click", downloadMarkdown);
  elements["save-result"].addEventListener("click", saveRecord);
  elements["export-pdf"].addEventListener("click", exportPdf);
  elements["add-resume-section"].addEventListener("click", addResumeSection);
  elements["resume-photo-file"].addEventListener("change", uploadResumePhoto);
  elements["show-resume-photo"].addEventListener("change", toggleResumePhoto);
  elements["delete-resume-photo"].addEventListener("click", deleteResumePhoto);
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
  renderPhotoControls();
  [["姓名", "fullName"], ["政治面貌", "politicalStatus"], ["邮箱", "email"], ["出生年月", "birthDate"], ["手机号", "phone"], ["个人概述", "summary"]].forEach(([labelText, key]) => {
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
    title.addEventListener("input", () => {
      section.title = title.value;
      section.kind = inferResumeSectionKind(title.value);
    });
    title.addEventListener("change", () => renderResume());
    const sectionActions = node("div", "edit-actions");
    sectionActions.append(
      actionButton("上移", sectionIndex === 0, () => moveSection(sectionIndex, -1)),
      actionButton("下移", sectionIndex === resume.sections.length - 1, () => moveSection(sectionIndex, 1)),
      actionButton("删除区块", false, () => { resume.sections.splice(sectionIndex, 1); renderResume(); })
    );
    sectionHead.append(title, sectionActions);
    sectionEditor.append(sectionHead);
    section.entries.forEach((entry, entryIndex) => sectionEditor.append(renderResumeEntry(section, sectionIndex, entry, entryIndex)));
    const addItem = actionButton(section.kind === "awards" ? "+ 添加奖项" : "+ 添加经历", false, () => {
      const entry = createResumeEntry();
      if (section.kind === "awards") entry.bullets = [];
      section.entries.push(entry);
      renderResume();
    });
    addItem.classList.add("add-item-button");
    sectionEditor.append(addItem);
    container.append(sectionEditor);
  });
}

function addResumeSection() {
  state.record.optimizedResume.sections.push(createResumeSection());
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
  const items = state.record.optimizedResume.sections[sectionIndex].entries;
  const nextIndex = itemIndex + offset;
  if (nextIndex < 0 || nextIndex >= items.length) return;
  [items[itemIndex], items[nextIndex]] = [items[nextIndex], items[itemIndex]];
  renderResume();
}

function renderResumeEntry(section, sectionIndex, entry, entryIndex) {
  if (section.kind === "awards") return renderAwardEntry(section, sectionIndex, entry, entryIndex);
  const wrapper = node("article", "resume-experience-editor");
  const head = node("div", "experience-editor-head");
  head.append(node("strong", "", `经历 ${entryIndex + 1}`));
  const actions = node("div", "edit-actions");
  actions.append(
    actionButton("上移", entryIndex === 0, () => moveItem(sectionIndex, entryIndex, -1)),
    actionButton("下移", entryIndex === section.entries.length - 1, () => moveItem(sectionIndex, entryIndex, 1)),
    actionButton("删除经历", false, () => { section.entries.splice(entryIndex, 1); renderResume(); })
  );
  head.append(actions);
  const meta = node("div", "experience-meta-fields");
  [["时间", "date"], ["机构 / 项目", "organization"], ["职位 / 专业", "position"]].forEach(([labelText, key]) => {
    const label = node("label", "compact-field");
    label.append(node("span", "", labelText));
    const input = document.createElement("input");
    input.value = entry[key] || "";
    input.addEventListener("input", () => { entry[key] = input.value; });
    label.append(input);
    meta.append(label);
  });
  const bullets = node("div", "resume-bullet-editors");
  entry.bullets.forEach((bullet, bulletIndex) => bullets.append(renderResumeBullet(entry, bullet, bulletIndex)));
  const addBullet = actionButton("+ 添加内容", false, () => { entry.bullets.push(createResumeBullet()); renderResume(); });
  addBullet.classList.add("add-item-button", "compact-add-button");
  wrapper.append(head, meta, bullets, addBullet);
  return wrapper;
}

function renderAwardEntry(section, sectionIndex, entry, entryIndex) {
  const wrapper = node("article", "resume-experience-editor award-editor");
  const head = node("div", "experience-editor-head");
  head.append(node("strong", "", `奖项 ${entryIndex + 1}`));
  const actions = node("div", "edit-actions");
  actions.append(
    actionButton("上移", entryIndex === 0, () => moveItem(sectionIndex, entryIndex, -1)),
    actionButton("下移", entryIndex === section.entries.length - 1, () => moveItem(sectionIndex, entryIndex, 1)),
    actionButton("删除奖项", false, () => { section.entries.splice(entryIndex, 1); renderResume(); })
  );
  head.append(actions);
  const fields = node("div", "experience-meta-fields award-meta-fields");
  [["奖项内容", "organization"], ["获奖时间", "date"]].forEach(([labelText, key]) => {
    const label = node("label", "compact-field");
    label.append(node("span", "", labelText));
    const input = document.createElement("input");
    input.value = entry[key] || "";
    input.addEventListener("input", () => { entry[key] = input.value; });
    label.append(input);
    fields.append(label);
  });
  wrapper.append(head, fields);
  return wrapper;
}

function renderResumeBullet(entry, bullet, bulletIndex) {
  const row = node("div", "resume-bullet-editor");
  const label = document.createElement("input");
  label.className = "bullet-label-input";
  label.placeholder = "加粗标签（可空）";
  label.value = bullet.label || "";
  label.setAttribute("aria-label", `第 ${bulletIndex + 1} 条内容标签`);
  label.addEventListener("input", () => { bullet.label = label.value; });
  const text = document.createElement("textarea");
  text.placeholder = "具体内容";
  text.value = bullet.text || "";
  text.setAttribute("aria-label", `第 ${bulletIndex + 1} 条具体内容`);
  text.addEventListener("input", () => { bullet.text = text.value; });
  const remove = actionButton("删除", false, () => { entry.bullets.splice(bulletIndex, 1); renderResume(); });
  row.append(label, text, remove);
  return row;
}

function renderPhotoControls() {
  const presentation = state.record.resumePresentation;
  const hasPhoto = Boolean(presentation.photo?.dataUrl);
  elements["resume-photo-preview"].hidden = !hasPhoto;
  elements["resume-photo-empty"].hidden = hasPhoto;
  elements["delete-resume-photo"].hidden = !hasPhoto;
  elements["resume-photo-upload-text"].textContent = hasPhoto ? "替换照片" : "上传证件照";
  elements["show-resume-photo"].disabled = !hasPhoto;
  elements["show-resume-photo"].checked = hasPhoto && presentation.showPhoto;
  elements["resume-photo-preview"].src = hasPhoto ? presentation.photo.dataUrl : "";
}

async function uploadResumePhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const photo = await prepareResumePhoto(file);
    state.record.resumePresentation.photo = photo;
    state.record.resumePresentation.showPhoto = true;
    renderPhotoControls();
    await saveRecord(false);
    showToast("证件照已在本机处理并保存。", true);
  } catch (error) {
    showToast(error?.message || String(error), false);
  }
}

async function toggleResumePhoto(event) {
  state.record.resumePresentation.showPhoto = Boolean(state.record.resumePresentation.photo && event.target.checked);
  await saveRecord(false);
  showToast(event.target.checked ? "导出时会显示证件照。" : "导出时将使用无照片排版。", true);
}

async function deleteResumePhoto() {
  if (!window.confirm("确定删除本机保存的这张证件照吗？")) return;
  state.record.resumePresentation.photo = null;
  state.record.resumePresentation.showPhoto = false;
  renderPhotoControls();
  await saveRecord(false);
  showToast("证件照已删除，将使用无照片排版。", true);
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
  await localStore.set({ [STORAGE_KEYS.PRINT_RESUME]: { job: state.record.job, resume: state.record.optimizedResume, presentation: state.record.resumePresentation, themeColor: state.record.resumeThemeColor, generatedAt: new Date().toISOString() } });
  await openExtensionPage(ROUTES.RESUME_PRINT);
}

function showToast(message, success) { showToastMessage(elements.toast, message, success); }
