import { clampConcurrency } from "../../features/tasks/queue-policy.mjs";
import { clearHistoricalTasks, createTask } from "../../features/tasks/task-service.mjs";
import { wakeTaskQueue } from "../../platform/chrome/messaging.mjs";
import { localStore, sessionStore, subscribeToLocalStorage } from "../../platform/chrome/storage.mjs";
import { getCurrentTab } from "../../platform/chrome/tabs.mjs";
import { deleteTask, deleteTasks, getAllTasks, getTask, putTask, subscribeToTaskChanges } from "../../platform/indexeddb/task-repository.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { HISTORICAL_TASK_STATUSES, TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { showToast as showToastMessage } from "../../shared/ui/toast.mjs";
import { clone } from "../../shared/utils/value.mjs";
import { renderBatchControls, renderRunnerStatus, renderTaskList, renderWorkbench, selectableTaskIds } from "./view.mjs";

const state = {
  tasks: [], filter: "all", concurrency: 2, queuePaused: false, selected: new Set()
};
const elements = Object.fromEntries(["toggle-queue","clear-history","select-all","batch-summary","batch-reanalyze","batch-delete","stat-total","stat-queued","stat-running","stat-completed","stat-failed","runner-status","task-list","empty","toast"].map((id) => [id, document.getElementById(id)]));
const actions = { cancelTask, reanalyze, removeTask, retryTask, toggleSelection };

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  if (Array.isArray(globalThis.__WORKBENCH_PREVIEW_TASKS__)) {
    state.tasks = globalThis.__WORKBENCH_PREVIEW_TASKS__;
    state.concurrency = 2;
    renderWorkbench(state, elements, actions);
    return;
  }
  const currentTab = await getCurrentTab();
  if (currentTab?.id) await sessionStore.set({ [STORAGE_KEYS.WORKBENCH_TAB_ID]: currentTab.id });
  const stored = await localStore.get([STORAGE_KEYS.QUEUE_CONCURRENCY, STORAGE_KEYS.QUEUE_PAUSED]);
  const queueConcurrency = stored[STORAGE_KEYS.QUEUE_CONCURRENCY] ?? 2;
  state.concurrency = clampConcurrency(queueConcurrency);
  state.queuePaused = stored[STORAGE_KEYS.QUEUE_PAUSED] === true;
  elements["toggle-queue"].textContent = state.queuePaused ? "继续启动任务" : "暂停启动新任务";
  subscribeToTaskChanges(refreshTasks);
  subscribeToLocalStorage(handleQueueSettingsChange);
  await refreshTasks();
  await wakeTaskQueue();
}

function bindEvents() {
  elements["toggle-queue"].addEventListener("click", async () => {
    state.queuePaused = !state.queuePaused;
    await localStore.set({ [STORAGE_KEYS.QUEUE_PAUSED]: state.queuePaused });
    elements["toggle-queue"].textContent = state.queuePaused ? "继续启动任务" : "暂停启动新任务";
    renderRunnerStatus(state, elements);
    if (!state.queuePaused) await wakeTaskQueue();
  });
  elements["clear-history"].addEventListener("click", clearHistory);
  elements["select-all"].addEventListener("change", toggleVisibleSelection);
  elements["batch-reanalyze"].addEventListener("click", batchReanalyze);
  elements["batch-delete"].addEventListener("click", batchDelete);
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    state.selected.clear();
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderTaskList(state, elements, actions);
    renderBatchControls(state, elements);
  }));
}

function handleQueueSettingsChange(changes) {
  if (changes[STORAGE_KEYS.QUEUE_CONCURRENCY]) {
    state.concurrency = clampConcurrency(changes[STORAGE_KEYS.QUEUE_CONCURRENCY].newValue);
  }
  if (changes[STORAGE_KEYS.QUEUE_PAUSED]) {
    state.queuePaused = changes[STORAGE_KEYS.QUEUE_PAUSED].newValue === true;
    elements["toggle-queue"].textContent = state.queuePaused ? "继续启动任务" : "暂停启动新任务";
  }
  renderRunnerStatus(state, elements);
}

async function refreshTasks() {
  state.tasks = await getAllTasks();
  const available = new Set(state.tasks.filter((task) => HISTORICAL_TASK_STATUSES.has(task.status)).map((task) => task.id));
  [...state.selected].forEach((taskId) => { if (!available.has(taskId)) state.selected.delete(taskId); });
  renderWorkbench(state, elements, actions);
}

function toggleSelection(taskId, selected) {
  if (selected) state.selected.add(taskId);
  else state.selected.delete(taskId);
  renderTaskList(state, elements, actions);
  renderBatchControls(state, elements);
}

function toggleVisibleSelection(event) {
  selectableTaskIds(state).forEach((taskId) => {
    if (event.target.checked) state.selected.add(taskId);
    else state.selected.delete(taskId);
  });
  renderTaskList(state, elements, actions);
  renderBatchControls(state, elements);
}

async function clearHistory() {
  const historicalCount = state.tasks.filter((task) => HISTORICAL_TASK_STATUSES.has(task.status)).length;
  if (!historicalCount) return showToast("当前没有可清空的历史记录。", false);
  if (!window.confirm(`确定清空 ${historicalCount} 条已完成、失败或取消的历史记录吗？\n\n等待中和运行中的任务会保留。`)) return;
  const deleted = await clearHistoricalTasks();
  state.selected.clear();
  showToast(`已清空 ${deleted} 条历史记录。`, true);
  await refreshTasks();
}

async function retryTask(task) {
  task.status = TASK_STATUS.QUEUED;
  task.phase = "waiting";
  task.error = "";
  await putTask(task);
  await refreshTasks();
  await wakeTaskQueue();
}

async function cancelTask(task) {
  const latest = await getTask(task.id);
  if (!latest) return;
  latest.status = TASK_STATUS.CANCELED;
  latest.phase = "canceled";
  latest.error = task.status === TASK_STATUS.RUNNING ? "请求已标记取消；服务商可能仍会完成并计费当前请求。" : "";
  await putTask(latest);
  await refreshTasks();
  await wakeTaskQueue();
}

async function removeTask(task) {
  if (task.status === TASK_STATUS.RUNNING) return showToast("请先取消运行中的任务。", false);
  const companyAndJob = [task.job?.company, task.job?.title || "该岗位"].filter(Boolean).join(" · ");
  if (!window.confirm(`确定删除“${companyAndJob}”的任务和历史结果吗？`)) return;
  await deleteTask(task.id);
  state.selected.delete(task.id);
  await refreshTasks();
}

async function reanalyze(task) {
  const context = await getReanalysisContext();
  if (!context) return;
  await createReanalysisTask(task, context);
  showToast("已使用当前基础简历加入新任务。", true);
  await refreshTasks();
  await wakeTaskQueue();
}

async function batchReanalyze() {
  const tasks = selectedTasks();
  if (!tasks.length) return;
  const context = await getReanalysisContext();
  if (!context) return;
  if (!window.confirm(`确定重新分析选中的 ${tasks.length} 个岗位吗？\n\n每个岗位都会重新产生完整的 AI 调用和相应费用。`)) return;
  for (const task of tasks) await createReanalysisTask(task, context);
  state.selected.clear();
  showToast(`已将 ${tasks.length} 个岗位重新加入分析队列。`, true);
  await refreshTasks();
  await wakeTaskQueue();
}

async function batchDelete() {
  const tasks = selectedTasks();
  if (!tasks.length) return;
  if (!window.confirm(`确定删除选中的 ${tasks.length} 条历史任务吗？\n\n分析结果和任务中的简历快照也会一并删除，且无法恢复。`)) return;
  await deleteTasks(tasks.map((task) => task.id));
  state.selected.clear();
  showToast(`已删除 ${tasks.length} 条历史任务。`, true);
  await refreshTasks();
}

function selectedTasks() {
  return state.tasks.filter((task) => state.selected.has(task.id) && HISTORICAL_TASK_STATUSES.has(task.status));
}

async function getReanalysisContext() {
  const stored = await localStore.get([STORAGE_KEYS.BASE_RESUME, STORAGE_KEYS.AI_CONFIG]);
  const context = { baseResume: stored[STORAGE_KEYS.BASE_RESUME], aiConfig: stored[STORAGE_KEYS.AI_CONFIG] };
  if (!context.baseResume || !context.aiConfig) {
    showToast("请先在插件中保存基础简历和 AI 配置。", false);
    return null;
  }
  return context;
}

function createReanalysisTask(task, context) {
  return createTask({
    job: clone(task.job),
    resumeSnapshot: clone(context.baseResume),
    aiConfig: context.aiConfig,
    generateResume: task.generateResume !== false,
    roleProfile: task.roleProfile ? clone(task.roleProfile) : null,
    sourceTaskId: task.id
  });
}

function showToast(message, success) { showToastMessage(elements.toast, message, success); }
