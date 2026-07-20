import { normalizeResumeDocument, normalizeResumePresentation } from "../../features/resume/resume-document.mjs";
import { localStore } from "../../platform/chrome/storage.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { node } from "../../shared/ui/dom.mjs";
import { validThemeColor } from "../../shared/utils/value.mjs";

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  document.getElementById("print").addEventListener("click", () => window.print());
  const stored = await localStore.get(STORAGE_KEYS.PRINT_RESUME);
  const printResume = stored[STORAGE_KEYS.PRINT_RESUME];
  const root = document.getElementById("resume");
  if (!printResume?.resume) {
    root.append(node("p", "empty", "没有可导出的简历，请返回插件重新生成。"));
    return;
  }

  const resume = normalizeResumeDocument(printResume.resume);
  const presentation = normalizeResumePresentation(printResume.presentation);
  const themeColor = validThemeColor(printResume.themeColor) ? printResume.themeColor : "#24548f";
  document.documentElement.style.setProperty("--resume-accent", themeColor);
  document.title = [printResume.job?.company, printResume.job?.title || "定制简历"].filter(Boolean).join(" - ");

  await document.fonts?.ready;
  paginateResume(root, resume, presentation);
}

function paginateResume(root, resume, presentation) {
  root.replaceChildren();
  let pageContent = createPage(root);
  pageContent = appendStandalone(root, pageContent, renderHeader(resume, presentation));
  if (resume.summary) pageContent = appendStandalone(root, pageContent, renderSummary(resume.summary));
  resume.sections.forEach((section) => {
    pageContent = appendSection(root, pageContent, section);
  });
}

function createPage(root) {
  const page = node("section", "resume-page");
  page.dataset.page = String(root.childElementCount + 1);
  page.setAttribute("aria-label", `简历第 ${page.dataset.page} 页`);
  const content = node("div", "resume-page-content");
  page.append(content);
  root.append(page);
  return content;
}

function appendStandalone(root, pageContent, content) {
  pageContent.append(content);
  if (!overflows(pageContent) || pageContent.childElementCount === 1) return pageContent;
  content.remove();
  const nextPage = createPage(root);
  nextPage.append(content);
  return nextPage;
}

function appendSection(root, pageContent, section) {
  const entries = section.entries
    .map((entry) => section.kind === "awards" ? renderAwardEntry(entry) : renderEntry(entry))
    .filter(Boolean);
  if (!entries.length) return pageContent;

  let wrapper = sectionShell(section.title, section.kind === "awards" ? "awards-section" : "");
  let entriesOnPage = 0;
  pageContent.append(wrapper);
  entries.forEach((entry) => {
    wrapper.append(entry);
    if (!overflows(pageContent)) {
      entriesOnPage += 1;
      return;
    }
    entry.remove();
    const titleWasNotPlaced = entriesOnPage === 0;
    if (titleWasNotPlaced) wrapper.remove();
    pageContent = createPage(root);
    wrapper = titleWasNotPlaced
      ? sectionShell(section.title, section.kind === "awards" ? "awards-section" : "")
      : continuationShell(section.kind === "awards" ? "awards-section" : "");
    pageContent.append(wrapper);
    wrapper.append(entry);
    entriesOnPage = 1;
  });
  return pageContent;
}

function overflows(content) {
  return content.scrollHeight > content.clientHeight + 1;
}

function renderHeader(resume, presentation) {
  const showPhoto = Boolean(presentation.showPhoto && presentation.photo?.dataUrl);
  const header = node("header", `resume-header ${showPhoto ? "with-photo" : "without-photo"}`);
  const identity = node("div", "resume-identity");
  identity.append(node("h1", "", resume.fullName || "个人简历"));
  const details = node("div", "personal-details");
  appendPersonalDetail(details, "政治面貌", resume.politicalStatus, "political-status");
  appendPersonalDetail(details, "邮箱", resume.email, "email");
  appendPersonalDetail(details, "出生年月", resume.birthDate, "birth-date");
  appendPersonalDetail(details, "手机号", resume.phone, "phone");
  if (details.childElementCount) identity.append(details);
  header.append(identity);
  if (showPhoto) {
    const photo = document.createElement("img");
    photo.className = "resume-photo";
    photo.src = presentation.photo.dataUrl;
    photo.alt = "证件照";
    header.append(photo);
  }
  return header;
}

function renderSummary(summary) {
  const section = sectionShell("个人概述");
  section.append(node("p", "summary-copy", summary));
  return section;
}

function renderAwardEntry(entry) {
  if (!entry.organization) return null;
  const row = node("article", "award-entry");
  row.append(node("strong", "award-content", entry.organization));
  if (entry.date) row.append(node("strong", "award-date", entry.date));
  return row;
}

function renderEntry(entry) {
  const usefulBullets = entry.bullets.filter((bullet) => bullet.label || bullet.text);
  const hasMeta = Boolean(entry.date || entry.organization || entry.position);
  if (!hasMeta && !usefulBullets.length) return null;
  const article = node("article", "resume-entry");
  if (hasMeta) {
    const meta = node("div", "resume-entry-meta");
    meta.append(
      node("span", "entry-date", entry.date),
      node("strong", "entry-organization", entry.organization),
      node("strong", "entry-position", entry.position)
    );
    article.append(meta);
  }
  if (usefulBullets.length) {
    const list = node("ul", "resume-bullets");
    usefulBullets.forEach((bullet) => {
      const item = node("li");
      if (bullet.label) item.append(node("strong", "", `${bullet.label}：`));
      if (bullet.text) item.append(document.createTextNode(bullet.text));
      list.append(item);
    });
    article.append(list);
  }
  return article;
}

function sectionShell(title, className = "") {
  const section = node("section", `resume-section ${className}`.trim());
  section.append(node("h2", "", title));
  return section;
}

function continuationShell(className = "") {
  return node("section", `resume-section resume-section-continuation ${className}`.trim());
}

function appendPersonalDetail(container, label, value, className) {
  if (!value) return;
  const item = node("p", `personal-detail ${className}`);
  item.append(node("span", "personal-label", `${label}：`), node("span", "personal-value", value));
  container.append(item);
}
