import { clampConcurrency, selectRunnableTasks } from "../../features/tasks/queue-policy.mjs";
import { runTask as executeTask } from "../../features/tasks/task-runner.mjs";
import { clearHistoricalTasks, createTask, migrateLegacyHistory, recoverInterruptedTasks } from "../../features/tasks/task-service.mjs";
import { localStore, sessionStore } from "../../platform/chrome/storage.mjs";
import { getCurrentTab, openExtensionPage } from "../../platform/chrome/tabs.mjs";
import { claimQueuedTask, deleteTask, getAllTasks, getTask, putTask, subscribeToTaskChanges } from "../../platform/indexeddb/task-repository.mjs";
import { resultRoute } from "../../shared/constants/routes.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { HISTORICAL_TASK_STATUSES, TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { showToast as showToastMessage } from "../../shared/ui/toast.mjs";
import { clone } from "../../shared/utils/value.mjs";
import { renderRunnerStatus, renderTaskList, renderWorkbench } from "./view.mjs";

const state = {
  tasks: [], filter: "all", concurrency: 2, queuePaused: false,
  running: new Map(), canceled: new Set(), scheduling: false,
  isRunner: false, releaseRunnerLock: null
};
const elements = Object.fromEntries(["concurrency","toggle-queue","clear-history","recovery-notice","stat-total","stat-queued","stat-running","stat-completed","stat-failed","runner-status","task-list","empty","toast"].map((id) => [id, document.getElementById(id)]));
const actions = { cancelTask, openResult, reanalyze, removeTask, retryTask };

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  if (Array.isArray(globalThis.__WORKBENCH_PREVIEW_TASKS__)) {
    state.tasks = globalThis.__WORKBENCH_PREVIEW_TASKS__;
    state.concurrency = 2;
    state.isRunner = true;
    elements.concurrency.value = "2";
    renderWorkbench(state, elements, actions);
    return;
  }
  const currentTab = await getCurrentTab();
  if (currentTab?.id) await sessionStore.set({ [STORAGE_KEYS.WORKBENCH_TAB_ID]: currentTab.id });
  await migrateLegacyHistory();
  state.isRunner = await acquireRunnerLock();
  const recovered = state.isRunner ? await recoverInterruptedTasks() : 0;
  const stored = await localStore.get(STORAGE_KEYS.QUEUE_CONCURRENCY);
  const queueConcurrency = stored[STORAGE_KEYS.QUEUE_CONCURRENCY] ?? 2;
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
    await localStore.set({ [STORAGE_KEYS.QUEUE_CONCURRENCY]: state.concurrency });
    await schedule();
  });
  elements["toggle-queue"].addEventListener("click", async () => {
    state.queuePaused = !state.queuePaused;
    elements["toggle-queue"].textContent = state.queuePaused ? "继续启动任务" : "暂停启动新任务";
    renderRunnerStatus(state, elements);
    if (!state.queuePaused) await schedule();
  });
  elements["clear-history"].addEventListener("click", clearHistory);
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderTaskList(state, elements, actions);
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
  renderWorkbench(state, elements, actions);
  await schedule();
}

async function clearHistory() {
  const historicalCount = state.tasks.filter((task) => HISTORICAL_TASK_STATUSES.has(task.status)).length;
  if (!historicalCount) return showToast("当前没有可清空的历史记录。", false);
  if (!window.confirm(`确定清空 ${historicalCount} 条已完成、失败或取消的历史记录吗？\n\n等待中和运行中的任务会保留。`)) return;
  const deleted = await clearHistoricalTasks();
  showToast(`已清空 ${deleted} 条历史记录。`, true);
  await refreshAndSchedule();
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
    renderRunnerStatus(state, elements);
  }
}

function startTask(task) {
  const promise = (async () => {
    const claimed = await claimQueuedTask(task.id);
    if (claimed) await executeTask(claimed, () => state.canceled.has(task.id));
  })().finally(async () => {
    state.running.delete(task.id);
    state.canceled.delete(task.id);
    await refreshAndSchedule();
  });
  state.running.set(task.id, promise);
  renderRunnerStatus(state, elements);
}

async function retryTask(task) {
  task.status = TASK_STATUS.QUEUED;
  task.phase = "waiting";
  task.error = "";
  await putTask(task);
  await refreshAndSchedule();
}

async function cancelTask(task) {
  state.canceled.add(task.id);
  const latest = await getTask(task.id);
  if (!latest) return;
  latest.status = TASK_STATUS.CANCELED;
  latest.phase = "canceled";
  latest.error = task.status === TASK_STATUS.RUNNING ? "请求已标记取消；服务商可能仍会完成并计费当前请求。" : "";
  await putTask(latest);
  await refreshAndSchedule();
}

async function removeTask(task) {
  if (task.status === TASK_STATUS.RUNNING) return showToast("请先取消运行中的任务。", false);
  const companyAndJob = [task.job?.company, task.job?.title || "该岗位"].filter(Boolean).join(" · ");
  if (!window.confirm(`确定删除“${companyAndJob}”的任务和历史结果吗？`)) return;
  await deleteTask(task.id);
  await refreshAndSchedule();
}

async function reanalyze(task) {
  const stored = await localStore.get([STORAGE_KEYS.BASE_RESUME, STORAGE_KEYS.AI_CONFIG]);
  const baseResume = stored[STORAGE_KEYS.BASE_RESUME];
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG];
  if (!baseResume || !aiConfig) return showToast("请先在插件中保存基础简历和 AI 配置。", false);
  await createTask({ job: clone(task.job), resumeSnapshot: clone(baseResume), aiConfig, sourceTaskId: task.id });
  showToast("已使用当前基础简历加入新任务。", true);
  await refreshAndSchedule();
}

async function openResult(taskId) {
  await openExtensionPage(resultRoute(taskId));
}
function showToast(message, success) { showToastMessage(elements.toast, message, success); }
