import { TASK_STATUS } from "../../shared/constants/task-status.mjs";
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
  renderRunnerStatus(state, elements);
}

export function renderRunnerStatus(state, elements) {
  if (state.queuePaused) {
    elements["runner-status"].textContent = `已暂停启动新任务 · 当前运行 ${state.running.size}`;
  } else {
    elements["runner-status"].textContent = `队列运行中 · 并行上限 ${state.concurrency} · 当前运行 ${state.running.size}`;
  }
}

export function renderTaskList(state, elements, actions) {
  const tasks = state.tasks.filter((task) => matchesFilter(task, state.filter));
  elements["task-list"].replaceChildren();
  elements.empty.hidden = tasks.length > 0;
  tasks.forEach((task) => elements["task-list"].append(renderTaskCard(task, state.isRunner, actions)));
}

function matchesFilter(task, filter) {
  if (filter === "all") return true;
  if (filter === "active") return [TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status);
  return task.status === filter;
}

function renderTaskCard(task, isRunner, actions) {
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
  if (task.status === TASK_STATUS.RUNNING) {
    const progress = node("div", "phase-progress");
    const bar = node("span");
    bar.style.width = task.stage === "resume" ? "75%" : "35%";
    progress.append(bar);
    content.append(progress);
  }
  const actionNode = node("div", "task-actions");
  appendTaskActions(actionNode, task, isRunner, actions);
  card.append(content, actionNode);
  return card;
}

function appendTaskActions(container, task, isRunner, actions) {
  if (!isRunner) {
    if (task.status === TASK_STATUS.COMPLETED) container.append(action("查看结果", () => actions.openResult(task.id)));
    return;
  }
  if (task.status === TASK_STATUS.COMPLETED) {
    container.append(action("查看结果", () => actions.openResult(task.id)), action("重新分析", () => actions.reanalyze(task)));
  } else if (task.status === TASK_STATUS.FAILED) {
    container.append(action("重试", () => actions.retryTask(task)));
  } else if (task.status === TASK_STATUS.CANCELED) {
    container.append(action("重新排队", () => actions.retryTask(task)));
  } else if ([TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status)) {
    container.append(action("取消", () => actions.cancelTask(task), true));
  }
  container.append(action("删除", () => actions.removeTask(task), true));
}

function action(text, handler, danger = false) {
  const button = node("button", danger ? "danger" : "", text);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function statusText(task) {
  if (task.status === TASK_STATUS.RUNNING) return task.stage === "resume" ? "正在生成简历" : "正在分析匹配";
  return ({ queued: "等待中", completed: "已完成", failed: "失败", canceled: "已取消" })[task.status] || task.status;
}

function readableSalary(value) {
  return globalThis.JobSalaryParser ? JobSalaryParser.extractReadableSalary([value]) : value || "";
}
