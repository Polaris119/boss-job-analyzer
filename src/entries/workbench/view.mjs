import { HISTORICAL_TASK_STATUSES, TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { resultRoute } from "../../shared/constants/routes.mjs";
import { node } from "../../shared/ui/dom.mjs";
import { formatDate } from "../../shared/utils/value.mjs";

export function renderWorkbench(state, elements, actions) {
  const counts = { total: state.tasks.length, queued: 0, running: 0, completed: 0, failed: 0 };
  state.tasks.forEach((task) => {
    if (Object.hasOwn(counts, task.status)) counts[task.status] += 1;
  });
  Object.entries(counts).forEach(([key, value]) => {
    elements[`stat-${key}`].textContent = String(value);
  });
  renderTaskList(state, elements, actions);
  renderBatchControls(state, elements);
  renderRunnerStatus(state, elements);
}

export function renderRunnerStatus(state, elements) {
  const runningCount = state.tasks.filter((task) => task.status === TASK_STATUS.RUNNING).length;
  if (state.queuePaused) {
    elements["runner-status"].textContent = `已暂停启动新任务 · 当前运行 ${runningCount}`;
  } else {
    elements["runner-status"].textContent = `后台队列运行中 · 并行上限 ${state.concurrency} · 当前运行 ${runningCount}`;
  }
}

export function renderTaskList(state, elements, actions) {
  const tasks = state.tasks.filter((task) => matchesFilter(task, state.filter));
  elements["task-list"].replaceChildren();
  elements.empty.hidden = tasks.length > 0;
  tasks.forEach((task) => elements["task-list"].append(renderTaskCard(task, state, actions)));
}

export function selectableTaskIds(state) {
  return state.tasks
    .filter((task) => matchesFilter(task, state.filter) && HISTORICAL_TASK_STATUSES.has(task.status))
    .map((task) => task.id);
}

export function renderBatchControls(state, elements) {
  const visibleIds = selectableTaskIds(state);
  const selectedVisible = visibleIds.filter((taskId) => state.selected.has(taskId)).length;
  elements["select-all"].disabled = visibleIds.length === 0;
  elements["select-all"].checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  elements["select-all"].indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  elements["batch-reanalyze"].disabled = state.selected.size === 0;
  elements["batch-delete"].disabled = state.selected.size === 0;
  elements["batch-summary"].textContent = state.selected.size
    ? `已选择 ${state.selected.size} 条历史任务`
    : visibleIds.length
      ? `当前列表可选择 ${visibleIds.length} 条历史任务`
      : "当前列表没有可批量操作的历史任务";
}

function matchesFilter(task, filter) {
  if (filter === "all") return true;
  if (filter === "active") return [TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status);
  return task.status === filter;
}

function renderTaskCard(task, state, actions) {
  const card = node("article", "task-card");
  card.dataset.status = task.status;
  card.classList.toggle("selected", state.selected.has(task.id));
  const selection = node("div", "task-selection");
  if (HISTORICAL_TASK_STATUSES.has(task.status)) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(task.id);
    checkbox.setAttribute("aria-label", `选择 ${task.job?.company || "公司未识别"} ${task.job?.title || "未命名岗位"}`);
    checkbox.addEventListener("change", () => actions.toggleSelection(task.id, checkbox.checked));
    selection.append(checkbox);
  }
  const content = node("div");
  const title = node("div", "task-title");
  const companyAndJob = [task.job?.company || "公司未识别", task.job?.title || "未命名岗位"].join(" · ");
  title.append(node("h3", "", companyAndJob), node("span", `status-badge ${task.status}`, statusText(task)));
  content.append(title);
  content.append(node("p", "", [readableSalary(task.job?.salary), task.job?.jobMeta].filter(Boolean).join(" · ")));
  const outputMode = task.generateResume === false ? "仅分析报告" : "含定制简历";
  content.append(node("p", "", `版本 ${String(task.contentHash || "").slice(0, 8) || "未知"} · ${formatDate(task.createdAt)} · ${task.aiConfig?.model || "历史模型未知"} · ${outputMode}`));
  if (task.error) content.append(node("p", "", task.error));
  if (task.status === TASK_STATUS.RUNNING) {
    const progress = node("div", "phase-progress");
    const bar = node("span");
    bar.style.width = progressWidth(task.stage);
    progress.append(bar);
    content.append(progress);
  }
  const actionNode = node("div", "task-actions");
  appendTaskActions(actionNode, task, actions);
  card.append(selection, content, actionNode);
  return card;
}

function appendTaskActions(container, task, actions) {
  if (task.status === TASK_STATUS.COMPLETED) {
    container.append(resultAction(task.id), action("重新分析", () => actions.reanalyze(task)));
  } else if (task.status === TASK_STATUS.FAILED) {
    container.append(action("重试", () => actions.retryTask(task)));
  } else if (task.status === TASK_STATUS.CANCELED) {
    container.append(action("重新排队", () => actions.retryTask(task)));
  } else if ([TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status)) {
    container.append(action("取消", () => actions.cancelTask(task), true));
  }
  container.append(action("删除", () => actions.removeTask(task), true));
}

function resultAction(taskId) {
  const link = node("a", "", "查看结果");
  link.href = chrome.runtime.getURL(resultRoute(taskId));
  return link;
}

function action(text, handler, danger = false) {
  const button = node("button", danger ? "danger" : "", text);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function statusText(task) {
  if (task.status === TASK_STATUS.RUNNING) return ({
    profile: "正在识别岗位",
    analysis: "正在诊断差距",
    preparation: "正在生成准备计划",
    resume: "正在生成简历"
  })[task.stage] || "正在分析岗位";
  return ({ queued: "等待中", completed: "已完成", failed: "失败", canceled: "已取消" })[task.status] || task.status;
}

function progressWidth(stage) {
  return ({ profile: "18%", analysis: "42%", preparation: "68%", resume: "88%", complete: "100%" })[stage] || "10%";
}

function readableSalary(value) {
  return globalThis.JobSalaryParser ? JobSalaryParser.extractReadableSalary([value]) : value || "";
}
