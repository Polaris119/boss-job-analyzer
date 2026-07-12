import { analyzeJobMatch, generateOptimizedResume } from "./analysis-engine.mjs";
import { claimQueuedTask, clearHistoricalTasks, createTask, deleteTask, getAllTasks, getTask, migrateLegacyHistory, putTask, recoverInterruptedTasks, subscribeToTaskChanges } from "./task-store.mjs";
import { clampConcurrency, selectRunnableTasks } from "./queue-policy.mjs";

const state = {
  tasks: [], filter: "all", concurrency: 2, queuePaused: false,
  running: new Map(), canceled: new Set(), scheduling: false,
  isRunner: false, releaseRunnerLock: null
};
const elements = Object.fromEntries(["concurrency","toggle-queue","clear-history","recovery-notice","stat-total","stat-queued","stat-running","stat-completed","stat-failed","runner-status","task-list","empty","toast"].map((id) => [id, document.getElementById(id)]));

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  if (Array.isArray(globalThis.__WORKBENCH_PREVIEW_TASKS__)) {
    state.tasks = globalThis.__WORKBENCH_PREVIEW_TASKS__;
    state.concurrency = 2;
    state.isRunner = true;
    elements.concurrency.value = "2";
    render();
    return;
  }
  const currentTab = await chrome.tabs.getCurrent();
  if (currentTab?.id) await chrome.storage.session.set({ workbenchTabId: currentTab.id });
  await migrateLegacyHistory();
  state.isRunner = await acquireRunnerLock();
  const recovered = state.isRunner ? await recoverInterruptedTasks() : 0;
  const { queueConcurrency = 2 } = await chrome.storage.local.get("queueConcurrency");
  state.concurrency = clampConcurrency(queueConcurrency);
  elements.concurrency.value = String(state.concurrency);
  if (!state.isRunner) {
    state.queuePaused = true;
    elements.concurrency.disabled = true;
    elements["toggle-queue"].disabled = true;
    elements["clear-history"].disabled = true;
    elements["recovery-notice"].textContent = "另一个工作台标签页正在执行队列。此页面保持只读，关闭重复页面即可。";
    elements["recovery-notice"].hidden = false;
  }
  if (recovered) {
    elements["recovery-notice"].textContent = `已恢复 ${recovered} 个上次中断的任务，将从最近完成阶段重新执行。`;
    elements["recovery-notice"].hidden = false;
  }
  subscribeToTaskChanges(refreshAndSchedule);
  await refreshAndSchedule();
}

function bindEvents() {
  elements.concurrency.addEventListener("change", async (event) => {
    state.concurrency = clampConcurrency(event.target.value);
    await chrome.storage.local.set({ queueConcurrency: state.concurrency });
    await schedule();
  });
  elements["toggle-queue"].addEventListener("click", async () => {
    state.queuePaused = !state.queuePaused;
    elements["toggle-queue"].textContent = state.queuePaused ? "继续启动任务" : "暂停启动新任务";
    renderRunnerStatus();
    if (!state.queuePaused) await schedule();
  });
  elements["clear-history"].addEventListener("click", clearHistory);
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderTasks();
  }));
  window.addEventListener("beforeunload", (event) => {
    if (!state.running.size) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function acquireRunnerLock() {
  if (!navigator.locks?.request) return true;
  let resolveAcquired;
  const acquired = new Promise((resolve) => { resolveAcquired = resolve; });
  navigator.locks.request("job-analysis-runner", { ifAvailable: true }, async (lock) => {
    if (!lock) {
      resolveAcquired(false);
      return;
    }
    resolveAcquired(true);
    await new Promise((resolve) => { state.releaseRunnerLock = resolve; });
  });
  return acquired;
}

async function refreshAndSchedule() {
  state.tasks = await getAllTasks();
  render();
  await schedule();
}

function render() {
  const counts = { total: state.tasks.length, queued: 0, running: 0, completed: 0, failed: 0 };
  state.tasks.forEach((task) => { if (Object.hasOwn(counts, task.status)) counts[task.status] += 1; });
  Object.entries(counts).forEach(([key, value]) => { elements[`stat-${key}`].textContent = String(value); });
  renderTasks();
  renderRunnerStatus();
}

function renderRunnerStatus() {
  if (state.queuePaused) elements["runner-status"].textContent = `已暂停启动新任务 · 当前运行 ${state.running.size}`;
  else elements["runner-status"].textContent = `队列运行中 · 并行上限 ${state.concurrency} · 当前运行 ${state.running.size}`;
}

function renderTasks() {
  const tasks = state.tasks.filter(matchesFilter);
  elements["task-list"].replaceChildren();
  elements.empty.hidden = tasks.length > 0;
  tasks.forEach((task) => elements["task-list"].append(renderTaskCard(task)));
}

function matchesFilter(task) {
  if (state.filter === "all") return true;
  if (state.filter === "active") return ["queued", "running"].includes(task.status);
  return task.status === state.filter;
}

function renderTaskCard(task) {
  const card = node("article", "task-card");
  card.dataset.status = task.status;
  const content = node("div");
  const title = node("div", "task-title");
  const companyAndJob = [task.job?.company || "公司未识别", task.job?.title || "未命名岗位"].join(" · ");
  title.append(node("h3", "", companyAndJob), node("span", `status-badge ${task.status}`, statusText(task)));
  content.append(title);
  content.append(node("p", "", [readableSalary(task.job?.salary), task.job?.jobMeta].filter(Boolean).join(" · ")));
  content.append(node("p", "", `版本 ${String(task.contentHash || "").slice(0, 8) || "未知"} · ${formatDate(task.createdAt)} · ${task.aiConfig?.model || "历史模型未知"}`));
  if (task.error) content.append(node("p", "", task.error));
  if (task.status === "running") {
    const progress = node("div", "phase-progress");
    const bar = node("span");
    bar.style.width = task.stage === "resume" ? "75%" : "35%";
    progress.append(bar);
    content.append(progress);
  }
  const actions = node("div", "task-actions");
  appendTaskActions(actions, task);
  card.append(content, actions);
  return card;
}

async function clearHistory() {
  const historicalCount = state.tasks.filter((task) => ["completed", "failed", "canceled"].includes(task.status)).length;
  if (!historicalCount) return showToast("当前没有可清空的历史记录。", false);
  if (!window.confirm(`确定清空 ${historicalCount} 条已完成、失败或取消的历史记录吗？\n\n等待中和运行中的任务会保留。`)) return;
  const deleted = await clearHistoricalTasks();
  showToast(`已清空 ${deleted} 条历史记录。`, true);
  await refreshAndSchedule();
}

function appendTaskActions(container, task) {
  if (!state.isRunner) {
    if (task.status === "completed") container.append(action("查看结果", () => openResult(task.id)));
    return;
  }
  if (task.status === "completed") {
    container.append(action("查看结果", () => openResult(task.id)), action("重新分析", () => reanalyze(task)));
  } else if (task.status === "failed") {
    container.append(action("重试", () => retryTask(task)));
  } else if (task.status === "canceled") {
    container.append(action("重新排队", () => retryTask(task)));
  } else if (["queued", "running"].includes(task.status)) {
    container.append(action("取消", () => cancelTask(task), true));
  }
  container.append(action("删除", () => removeTask(task), true));
}

async function schedule() {
  if (!state.isRunner || state.scheduling || state.queuePaused) return;
  state.scheduling = true;
  try {
    state.tasks = await getAllTasks();
    const waiting = selectRunnableTasks(state.tasks, new Set(state.running.keys()), state.concurrency);
    waiting.forEach((task) => startTask(task));
  } finally {
    state.scheduling = false;
    renderRunnerStatus();
  }
}

function startTask(task) {
  const promise = (async () => {
    const claimed = await claimQueuedTask(task.id);
    if (claimed) await runTask(claimed);
  })().finally(async () => {
    state.running.delete(task.id);
    state.canceled.delete(task.id);
    await refreshAndSchedule();
  });
  state.running.set(task.id, promise);
  renderRunnerStatus();
}

async function runTask(task) {
  try {
    const apiKey = await getApiKey(task);
    task.status = "running";
    task.startedAt ||= new Date().toISOString();
    task.attempts = (task.attempts || 0) + 1;
    task.error = "";
    if (!task.analysis) {
      task.stage = "match";
      task.phase = "matching";
      await putTask(task);
      const analysis = await analyzeJobMatch(task, apiKey);
      if (state.canceled.has(task.id)) return;
      task.analysis = analysis;
      task.stage = "resume";
      task.phase = "generating-resume";
      await putTask(task);
    }
    if (!task.optimizedResume) {
      task.stage = "resume";
      task.phase = "generating-resume";
      await putTask(task);
      const optimizedResume = await generateOptimizedResume(task, task.analysis, apiKey);
      if (state.canceled.has(task.id)) return;
      task.optimizedResume = optimizedResume;
    }
    task.status = "completed";
    task.stage = "complete";
    task.phase = "completed";
    task.completedAt = new Date().toISOString();
    task.error = "";
    await putTask(task);
  } catch (error) {
    if (state.canceled.has(task.id)) return;
    task.status = "failed";
    task.phase = "failed";
    task.error = error?.message || String(error);
    await putTask(task);
  }
}

async function getApiKey(task) {
  const local = await chrome.storage.local.get("aiConfig");
  const session = await chrome.storage.session.get("sessionApiKey");
  if (local.aiConfig?.baseUrl && local.aiConfig.baseUrl !== task.aiConfig?.baseUrl) {
    throw new Error("AI 接口配置已在任务入队后变更，请使用当前配置重新分析该岗位");
  }
  const key = local.aiConfig?.apiKey || session.sessionApiKey;
  if (!key) throw new Error("没有可用的 API Key，请返回插件重新保存 AI 配置");
  return key;
}

async function retryTask(task) {
  task.status = "queued";
  task.phase = "waiting";
  task.error = "";
  await putTask(task);
  await refreshAndSchedule();
}

async function cancelTask(task) {
  state.canceled.add(task.id);
  const latest = await getTask(task.id);
  if (!latest) return;
  latest.status = "canceled";
  latest.phase = "canceled";
  latest.error = task.status === "running" ? "请求已标记取消；服务商可能仍会完成并计费当前请求。" : "";
  await putTask(latest);
  await refreshAndSchedule();
}

async function removeTask(task) {
  if (task.status === "running") return showToast("请先取消运行中的任务。", false);
  const companyAndJob = [task.job?.company, task.job?.title || "该岗位"].filter(Boolean).join(" · ");
  if (!window.confirm(`确定删除“${companyAndJob}”的任务和历史结果吗？`)) return;
  await deleteTask(task.id);
  await refreshAndSchedule();
}

async function reanalyze(task) {
  const { baseResume, aiConfig } = await chrome.storage.local.get(["baseResume", "aiConfig"]);
  if (!baseResume || !aiConfig) return showToast("请先在插件中保存基础简历和 AI 配置。", false);
  await createTask({ job: clone(task.job), resumeSnapshot: clone(baseResume), aiConfig, sourceTaskId: task.id });
  showToast("已使用当前基础简历加入新任务。", true);
  await refreshAndSchedule();
}

async function openResult(taskId) {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?task=${encodeURIComponent(taskId)}`) });
}

function action(text, handler, danger = false) {
  const button = node("button", danger ? "danger" : "", text);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function statusText(task) {
  if (task.status === "running") return task.stage === "resume" ? "正在生成简历" : "正在分析匹配";
  return ({ queued: "等待中", completed: "已完成", failed: "失败", canceled: "已取消" })[task.status] || task.status;
}
function readableSalary(value) { return globalThis.JobSalaryParser ? JobSalaryParser.extractReadableSalary([value]) : value || ""; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function node(tag, className = "", text = "") { const element = document.createElement(tag); if (className) element.className = className; if (text) element.textContent = text; return element; }
function formatDate(value) { try { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return ""; } }
function showToast(message, success) { elements.toast.textContent = message; elements.toast.style.background = success ? "#087c45" : "#b42318"; elements.toast.hidden = false; setTimeout(() => { elements.toast.hidden = true; }, 3000); }
