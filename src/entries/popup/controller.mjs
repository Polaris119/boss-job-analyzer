import { clampConcurrency, clampHistoryLimit } from "../../features/tasks/queue-policy.mjs";
import { localStore } from "../../platform/chrome/storage.mjs";
import { openExtensionPage, openWorkbench } from "../../platform/chrome/tabs.mjs";
import { ROUTES } from "../../shared/constants/routes.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { clone } from "../../shared/utils/value.mjs";

const elements = Object.fromEntries(["open-home", "open-workbench", "open-resume", "generate-resume", "generate-resume-help", "queue-concurrency", "history-limit", "history-limit-help", "feedback"].map((id) => [id, document.getElementById(id)]));
const state = { historyLimit: 20 };

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  const stored = await localStore.get([STORAGE_KEYS.GENERATE_RESUME, STORAGE_KEYS.HISTORY_LIMIT, STORAGE_KEYS.QUEUE_CONCURRENCY]);
  elements["generate-resume"].checked = stored[STORAGE_KEYS.GENERATE_RESUME] !== false;
  elements["queue-concurrency"].value = String(clampConcurrency(stored[STORAGE_KEYS.QUEUE_CONCURRENCY]));
  state.historyLimit = clampHistoryLimit(stored[STORAGE_KEYS.HISTORY_LIMIT]);
  elements["history-limit"].value = String(state.historyLimit);
  renderResumeOption();
  renderHistoryLimit();
  elements["open-home"].addEventListener("click", openHome);
  elements["open-workbench"].addEventListener("click", async () => { await openWorkbench(); window.close(); });
  elements["open-resume"].addEventListener("click", openResume);
  elements["generate-resume"].addEventListener("change", saveResumeOption);
  elements["queue-concurrency"].addEventListener("change", saveConcurrency);
  elements["history-limit"].addEventListener("change", saveHistoryLimit);
}

async function openHome() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return showFeedback("暂时无法识别当前标签页，请稍后再试。");
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } catch (error) {
    showFeedback(error?.message || "暂时无法打开首页，请稍后再试。");
  }
}

async function openResume() {
  const stored = await localStore.get(STORAGE_KEYS.BASE_RESUME);
  const baseResume = stored[STORAGE_KEYS.BASE_RESUME];
  if (!baseResume) return showFeedback("还没有基础简历，请先打开首页上传 PDF 简历。");
  await localStore.set({ [STORAGE_KEYS.RESUME_DRAFT]: clone(baseResume) });
  await openExtensionPage(ROUTES.RESUME_EDITOR);
  window.close();
}

async function saveResumeOption(event) {
  await localStore.set({ [STORAGE_KEYS.GENERATE_RESUME]: event.target.checked });
  renderResumeOption();
}

async function saveConcurrency(event) {
  const concurrency = clampConcurrency(event.target.value);
  event.target.value = String(concurrency);
  await localStore.set({ [STORAGE_KEYS.QUEUE_CONCURRENCY]: concurrency });
  showFeedback(`并行任务已调整为 ${concurrency} 个。`);
}

async function saveHistoryLimit(event) {
  const nextLimit = clampHistoryLimit(event.target.value);
  if (nextLimit < state.historyLimit && !window.confirm(`改为保留最近 ${nextLimit} 条后，更早的历史记录会被自动删除，且无法恢复。确定继续吗？`)) {
    event.target.value = String(state.historyLimit);
    return;
  }
  state.historyLimit = nextLimit;
  event.target.value = String(nextLimit);
  await localStore.set({ [STORAGE_KEYS.HISTORY_LIMIT]: nextLimit });
  renderHistoryLimit();
  showFeedback(`以后最多保留最近 ${nextLimit} 条历史记录。`);
}

function renderResumeOption() {
  elements["generate-resume-help"].textContent = elements["generate-resume"].checked
    ? "岗位分析完成后继续生成简历"
    : "仅生成岗位分析报告，减少一次 AI 调用";
}

function renderHistoryLimit() {
  elements["history-limit-help"].textContent = `超过 ${state.historyLimit} 条后自动删除最早记录`;
}

function showFeedback(message) {
  elements.feedback.textContent = message;
  elements.feedback.hidden = false;
}
