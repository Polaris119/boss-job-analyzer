document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  document.getElementById("print").addEventListener("click", () => window.print());
  const { printResume } = await chrome.storage.local.get("printResume");
  const root = document.getElementById("resume");
  if (!printResume?.resume) {
    root.append(node("p", "没有可导出的简历，请返回插件重新生成。", "empty"));
    return;
  }

  const resume = printResume.resume;
  const themeColor = /^#[0-9a-f]{6}$/i.test(printResume.themeColor || "") ? printResume.themeColor : "#087f7c";
  document.documentElement.style.setProperty("--teal", themeColor);
  document.title = [printResume.job?.company, printResume.job?.title || "定制简历"].filter(Boolean).join(" - ");

  const header = node("header", "", "resume-header");
  header.append(node("h1", resume.fullName || "个人简历"));
  if (resume.headline) header.append(node("p", resume.headline, "headline"));
  if (resume.contactLine) header.append(node("p", resume.contactLine, "contact"));
  root.append(header);

  if (resume.summary) {
    const summary = node("section", "", "summary resume-section");
    summary.append(node("h2", "个人概述"), node("p", resume.summary));
    root.append(summary);
  }

  (resume.sections || []).forEach((section) => {
    const wrapper = node("section", "", "resume-section");
    wrapper.append(node("h2", section.title));
    const list = node("ul");
    (section.items || []).filter(Boolean).forEach((item) => list.append(node("li", item)));
    wrapper.append(list);
    root.append(wrapper);
  });
}

function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
