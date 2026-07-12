const state = { draft: null };
const sectionsNode = document.getElementById("sections");
const toast = document.getElementById("toast");

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  document.getElementById("save-resume").addEventListener("click", saveResume);
  document.getElementById("add-section").addEventListener("click", addSection);
  const stored = await chrome.storage.local.get(["resumeDraft", "baseResume"]);
  state.draft = stored.resumeDraft || stored.baseResume || null;
  if (!state.draft) {
    document.getElementById("empty").hidden = false;
    document.getElementById("save-resume").disabled = true;
    return;
  }
  state.draft.sections = state.draft.sections?.length
    ? state.draft.sections
    : [{ title: "简历内容", text: state.draft.rawText || "" }];
  document.getElementById("file-meta").textContent = [
    state.draft.fileName || "基础简历",
    state.draft.pageCount ? `${state.draft.pageCount} 页` : "",
    `${state.draft.sections.length} 个区块`
  ].filter(Boolean).join(" · ");
  renderSections();
}

function renderSections() {
  sectionsNode.replaceChildren();
  state.draft.sections.forEach((section, index) => {
    const wrapper = node("section", "resume-section");
    const head = node("div", "section-head");
    const title = document.createElement("input");
    title.value = section.title || "未命名区块";
    title.setAttribute("aria-label", `第 ${index + 1} 个区块标题`);
    title.addEventListener("input", () => { state.draft.sections[index].title = title.value; });
    const remove = node("button", "delete-button", "删除");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.draft.sections.splice(index, 1);
      renderSections();
    });
    head.append(title, remove);
    const textarea = document.createElement("textarea");
    textarea.value = section.text || "";
    textarea.setAttribute("aria-label", `${section.title || "简历"}内容`);
    textarea.addEventListener("input", () => { state.draft.sections[index].text = textarea.value; });
    wrapper.append(head, textarea);
    sectionsNode.append(wrapper);
  });
}

function addSection() {
  if (!state.draft) return;
  state.draft.sections.push({ title: "新建区块", text: "" });
  renderSections();
  sectionsNode.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveResume() {
  const usableSections = state.draft.sections
    .map((section) => ({ title: section.title.trim(), text: section.text.trim() }))
    .filter((section) => section.title && section.text);
  if (!usableSections.length) {
    showToast("至少保留一个有内容的简历区块。", false);
    return;
  }
  state.draft.sections = usableSections;
  state.draft.rawText = usableSections.map((section) => `${section.title}\n${section.text}`).join("\n\n");
  state.draft.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ baseResume: state.draft });
  await chrome.storage.local.remove("resumeDraft");
  document.getElementById("file-meta").textContent = `${state.draft.fileName || "基础简历"} · 同步更新完成`;
  showToast("基础简历已保存，同步更新完成。", true);
}

function showToast(message, success) {
  toast.textContent = message;
  toast.style.background = success ? "#087c45" : "#b42318";
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 3200);
}

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
