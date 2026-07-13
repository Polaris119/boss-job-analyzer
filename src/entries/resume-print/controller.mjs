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

  const resume = printResume.resume;
  const themeColor = validThemeColor(printResume.themeColor) ? printResume.themeColor : "#087f7c";
  document.documentElement.style.setProperty("--teal", themeColor);
  document.title = [printResume.job?.company, printResume.job?.title || "定制简历"].filter(Boolean).join(" - ");

  const header = node("header", "resume-header");
  header.append(node("h1", "", resume.fullName || "个人简历"));
  if (resume.headline) header.append(node("p", "headline", resume.headline));
  if (resume.contactLine) header.append(node("p", "contact", resume.contactLine));
  root.append(header);

  if (resume.summary) {
    const summary = node("section", "summary resume-section");
    summary.append(node("h2", "", "个人概述"), node("p", "", resume.summary));
    root.append(summary);
  }

  (resume.sections || []).forEach((section) => {
    const wrapper = node("section", "resume-section");
    wrapper.append(node("h2", "", section.title));
    const list = node("ul");
    (section.items || []).filter(Boolean).forEach((item) => list.append(node("li", "", item)));
    wrapper.append(list);
    root.append(wrapper);
  });
}
