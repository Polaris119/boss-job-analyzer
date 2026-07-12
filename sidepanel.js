import { extractPdfText } from "./pdf-reader.mjs";
import { createTask, findExactTask, getTaskStats, migrateLegacyHistory, subscribeToTaskChanges } from "./task-store.mjs";

const state = { baseResume: null, currentJob: null, config: null };
const ids = [
  "resume-status", "resume-detail", "resume-file", "resume-feedback", "edit-resume",
  "job-status", "job-detail", "queue-summary", "open-workbench", "provider-template",
  "base-url", "model", "api-key", "remember-key", "save-config", "test-config",
  "config-feedback", "analyze", "action-help", "action-feedback", "error",
  "delete-resume"
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  await migrateLegacyHistory();
  await loadState();
  await renderStatus();
  subscribeToTaskChanges(renderQueueStats);
}

function bindEvents() {
  elements["provider-template"].addEventListener("change", () => { applyProviderTemplate(); renderStatus(); });
  elements["resume-file"].addEventListener("change", handleResumeUpload);
  elements["edit-resume"].addEventListener("click", openResumeEditor);
  elements["save-config"].addEventListener("click", handleSaveConfig);
  elements["test-config"].addEventListener("click", testConnection);
  elements.analyze.addEventListener("click", enqueueCurrentJob);
  elements["open-workbench"].addEventListener("click", openWorkbench);
  elements["delete-resume"].addEventListener("click", deleteBaseResume);
  [elements["base-url"], elements.model, elements["api-key"]].forEach((input) => input.addEventListener("input", renderStatus));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.baseResume) state.baseResume = changes.baseResume.newValue || null;
    if (changes.currentJob) state.currentJob = changes.currentJob.newValue || null;
    renderStatus();
  });
}

async function loadState() {
  const local = await chrome.storage.local.get(["baseResume", "currentJob", "aiConfig"]);
  const session = await chrome.storage.session.get("sessionApiKey");
  state.baseResume = local.baseResume || null;
  state.currentJob = local.currentJob || null;
  state.config = local.aiConfig || null;
  if (state.config) {
    elements["provider-template"].value = state.config.provider || "custom";
    elements["base-url"].value = state.config.baseUrl || "";
    elements.model.value = state.config.model || "";
    elements["remember-key"].checked = Boolean(state.config.rememberKey);
    elements["api-key"].value = state.config.apiKey || session.sessionApiKey || "";
  } else applyProviderTemplate();
}

function applyProviderTemplate() {
  if (elements["provider-template"].value === "deepseek") {
    elements["base-url"].value = "https://api.deepseek.com";
    elements.model.value = "deepseek-chat";
  }
}

async function handleResumeUpload(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return showFeedback(elements["resume-feedback"], "请选择 PDF 文件。", false);
  if (file.size > 15 * 1024 * 1024) return showFeedback(elements["resume-feedback"], "PDF 不能超过 15 MB。", false);
  showFeedback(elements["resume-feedback"], "正在本地读取 PDF，请稍候…", true);
  try {
    const extracted = await extractPdfText(file);
    const sections = JobResumeParser.splitResumeSections(extracted.text);
    await chrome.storage.local.set({
      resumeDraft: {
        source: "pdf-upload", fileName: file.name, pageCount: extracted.pageCount,
        rawText: extracted.text,
        sections: sections.length ? sections : [{ title: "简历内容", text: extracted.text }],
        capturedAt: new Date().toISOString()
      }
    });
    hideFeedback(elements["resume-feedback"]);
    await chrome.tabs.create({ url: chrome.runtime.getURL("resume-editor.html") });
  } catch (error) {
    showFeedback(elements["resume-feedback"], error.message || String(error), false);
  }
}

async function openResumeEditor() {
  if (!state.baseResume) return;
  await chrome.storage.local.set({ resumeDraft: clone(state.baseResume) });
  await chrome.tabs.create({ url: chrome.runtime.getURL("resume-editor.html") });
}

async function handleSaveConfig() {
  clearError();
  hideFeedback(elements["config-feedback"]);
  setBusy(elements["save-config"], true, "保存中…");
  try { await saveConfig(); showFeedback(elements["config-feedback"], "配置保存成功。", true); }
  catch (error) { showFeedback(elements["config-feedback"], `保存失败：${error.message}`, false); }
  finally { setBusy(elements["save-config"], false, "保存配置"); }
}

async function saveConfig() {
  const config = readConfigForm();
  validateConfig(config);
  await ensureEndpointPermission(config.baseUrl);
  const storedConfig = {
    provider: config.provider, baseUrl: config.baseUrl, model: config.model,
    rememberKey: config.rememberKey, apiKey: config.rememberKey ? config.apiKey : ""
  };
  await chrome.storage.local.set({ aiConfig: storedConfig });
  if (config.rememberKey) await chrome.storage.session.remove("sessionApiKey");
  else await chrome.storage.session.set({ sessionApiKey: config.apiKey });
  state.config = storedConfig;
  await renderStatus();
  return config;
}

function readConfigForm() {
  return {
    provider: elements["provider-template"].value,
    baseUrl: elements["base-url"].value.trim().replace(/\/$/, ""),
    model: elements.model.value.trim(),
    apiKey: elements["api-key"].value.trim(),
    rememberKey: elements["remember-key"].checked
  };
}

function validateConfig(config) {
  if (!config.baseUrl || !config.model || !config.apiKey) throw new Error("请填写 Base URL、Model 和 API Key");
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new Error("Base URL 格式不正确"); }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("AI 接口必须使用 HTTPS（本地开发接口除外）");
}

async function ensureEndpointPermission(baseUrl) {
  const originPattern = `${new URL(baseUrl).origin}/*`;
  if (await chrome.permissions.contains({ origins: [originPattern] })) return;
  if (!await chrome.permissions.request({ origins: [originPattern] })) throw new Error("需要获得该 AI 接口域名的访问权限才能继续");
}

async function testConnection() {
  clearError();
  hideFeedback(elements["config-feedback"]);
  setBusy(elements["test-config"], true, "测试中…");
  try {
    const config = await saveConfig();
    const response = await chrome.runtime.sendMessage({
      type: "AI_REQUEST",
      payload: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, messages: [{ role: "user", content: "只回复：连接成功" }], jsonMode: false }
    });
    if (!response?.ok) throw new Error(response?.error || "AI 请求失败");
    showFeedback(elements["config-feedback"], `连接成功：${response.data.trim().slice(0, 40)}`, true);
  } catch (error) { showFeedback(elements["config-feedback"], `连接失败：${error.message}`, false); }
  finally { setBusy(elements["test-config"], false, "测试连接"); }
}

async function enqueueCurrentJob() {
  clearError();
  hideFeedback(elements["action-feedback"]);
  setBusy(elements.analyze, true, "正在加入…");
  try {
    const config = await saveConfig();
    const exact = await findExactTask(state.currentJob.jobKey || state.currentJob.id, state.currentJob.contentHash || state.currentJob.fingerprint);
    if (exact && ["queued", "running"].includes(exact.status)) {
      showFeedback(elements["action-feedback"], "该岗位版本已经在分析队列中。", true);
      await openWorkbench();
      return;
    }
    if (exact?.status === "completed") {
      const reanalyze = window.confirm("该岗位版本已经分析完成。确定要使用当前简历重新分析吗？\n\n选择“取消”将打开已有结果。");
      if (!reanalyze) {
        await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?task=${encodeURIComponent(exact.id)}`) });
        return;
      }
    }
    await createTask({ job: clone(state.currentJob), resumeSnapshot: clone(state.baseResume), aiConfig: config, sourceTaskId: exact?.id || null });
    showFeedback(elements["action-feedback"], "已加入分析队列，工作台将按并行设置执行。", true);
    await renderQueueStats();
    await openWorkbench();
  } catch (error) { showError(error); }
  finally { setBusy(elements.analyze, false, "加入分析队列"); await renderStatus(); }
}

async function openWorkbench() {
  const url = chrome.runtime.getURL("workbench.html");
  const { workbenchTabId } = await chrome.storage.session.get("workbenchTabId");
  if (workbenchTabId) {
    try {
      await chrome.tabs.update(workbenchTabId, { active: true });
      return;
    } catch {
      await chrome.storage.session.remove("workbenchTabId");
    }
  }
  const tab = await chrome.tabs.create({ url });
  await chrome.storage.session.set({ workbenchTabId: tab.id });
}

async function renderStatus() {
  if (state.baseResume) {
    setBadge(elements["resume-status"], "同步完成", "");
    elements["resume-detail"].textContent = `${state.baseResume.fileName || "PDF 简历"} · ${state.baseResume.sections?.length || 1} 个区块 · ${formatDate(state.baseResume.updatedAt || state.baseResume.capturedAt)}`;
    elements["edit-resume"].hidden = false;
    elements["delete-resume"].hidden = false;
  } else {
    setBadge(elements["resume-status"], "未上传", "muted");
    elements["resume-detail"].textContent = "上传文本型 PDF，在独立页面校对并保存。";
    elements["edit-resume"].hidden = true;
    elements["delete-resume"].hidden = true;
  }
  if (state.currentJob) {
    setBadge(elements["job-status"], "已读取", "");
    elements["job-detail"].textContent = [state.currentJob.company || "公司未识别", state.currentJob.title, formatDate(state.currentJob.capturedAt)].filter(Boolean).join(" · ");
  } else {
    setBadge(elements["job-status"], "未读取", "muted");
    elements["job-detail"].textContent = "请在岗位详情页点击“AI 分析当前岗位”。";
  }
  const configReady = Boolean(elements["base-url"].value.trim() && elements.model.value.trim() && elements["api-key"].value.trim());
  const ready = Boolean(state.baseResume && state.currentJob && configReady);
  elements.analyze.disabled = !ready;
  if (ready) setActionHelp("任务会冻结当前岗位与简历快照。", false);
  else {
    const missing = [];
    if (!state.baseResume) missing.push("已保存的 PDF 简历");
    if (!state.currentJob) missing.push("当前岗位");
    if (!configReady) missing.push("AI 配置");
    setActionHelp(`还需要：${missing.join("、")}`, false);
  }
  await renderQueueStats();
}

async function renderQueueStats() {
  const stats = await getTaskStats();
  const active = stats.queued + stats.running;
  if (!stats.total) setBadge(elements["queue-summary"], "暂无任务", "muted");
  else if (active) setBadge(elements["queue-summary"], `进行中 ${active} · 完成 ${stats.completed}`, "warning");
  else setBadge(elements["queue-summary"], `历史 ${stats.completed}`, "");
}

async function deleteBaseResume() {
  if (!window.confirm("确定删除本机保存的基础简历吗？历史任务中的简历快照不会删除。")) return;
  await chrome.storage.local.remove(["baseResume", "resumeDraft"]);
  state.baseResume = null;
  await renderStatus();
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function showFeedback(node, message, success) { node.textContent = message; node.className = `inline-feedback ${success ? "success" : "failure"}`; node.hidden = false; }
function hideFeedback(node) { node.hidden = true; node.textContent = ""; }
function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }
function showError(error) { elements.error.textContent = error?.message || String(error); elements.error.hidden = false; }
function clearError() { elements.error.hidden = true; elements.error.textContent = ""; }
function setActionHelp(message, success) { elements["action-help"].textContent = message; elements["action-help"].style.color = success ? "#087c45" : ""; }
function setBadge(node, text, className) { node.textContent = text; node.className = `badge ${className}`.trim(); }
function formatDate(value) { if (!value) return ""; try { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return ""; } }
