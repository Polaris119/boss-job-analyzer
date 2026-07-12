const DB_NAME = "job-resume-assistant";
const DB_VERSION = 1;
const TASK_STORE = "tasks";
const CHANNEL_NAME = "job-analysis-tasks";
let databasePromise;

export function openTaskDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(TASK_STORE, { keyPath: "id" });
      store.createIndex("status", "status", { unique: false });
      store.createIndex("jobKey", "jobKey", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开任务数据库"));
  });
  return databasePromise;
}

export async function createTask({ job, resumeSnapshot, aiConfig, sourceTaskId = null }) {
  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    jobKey: job.jobKey || job.id,
    contentHash: job.contentHash || job.fingerprint || "",
    job,
    resumeSnapshot,
    aiConfig: {
      provider: aiConfig.provider,
      baseUrl: aiConfig.baseUrl,
      model: aiConfig.model
    },
    status: "queued",
    phase: "waiting",
    stage: "match",
    analysis: null,
    optimizedResume: null,
    resumeThemeColor: "#087f7c",
    error: "",
    attempts: 0,
    recoveryCount: 0,
    sourceTaskId,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null
  };
  await putTask(task);
  return task;
}

export async function putTask(task) {
  const database = await openTaskDatabase();
  task.updatedAt = new Date().toISOString();
  await requestPromise(database.transaction(TASK_STORE, "readwrite").objectStore(TASK_STORE).put(task));
  broadcast({ type: "tasks-changed", taskId: task.id });
  return task;
}

export async function getTask(taskId) {
  const database = await openTaskDatabase();
  return requestPromise(database.transaction(TASK_STORE, "readonly").objectStore(TASK_STORE).get(taskId));
}

export async function claimQueuedTask(taskId) {
  const database = await openTaskDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    const store = transaction.objectStore(TASK_STORE);
    let claimed = null;
    const request = store.get(taskId);
    request.onsuccess = () => {
      const task = request.result;
      if (!task || task.status !== "queued") return;
      task.status = "running";
      task.phase = task.analysis ? "generating-resume" : "matching";
      task.updatedAt = new Date().toISOString();
      store.put(task);
      claimed = task;
    };
    transaction.oncomplete = () => {
      if (claimed) broadcast({ type: "tasks-changed", taskId });
      resolve(claimed);
    };
    transaction.onerror = () => reject(transaction.error || new Error("无法认领队列任务"));
    transaction.onabort = () => reject(transaction.error || new Error("认领队列任务已中止"));
  });
}

export async function getAllTasks() {
  const database = await openTaskDatabase();
  const tasks = await requestPromise(database.transaction(TASK_STORE, "readonly").objectStore(TASK_STORE).getAll());
  return tasks.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteTask(taskId) {
  const database = await openTaskDatabase();
  await requestPromise(database.transaction(TASK_STORE, "readwrite").objectStore(TASK_STORE).delete(taskId));
  broadcast({ type: "tasks-changed", taskId });
}

export async function clearTasks() {
  const database = await openTaskDatabase();
  await requestPromise(database.transaction(TASK_STORE, "readwrite").objectStore(TASK_STORE).clear());
  broadcast({ type: "tasks-cleared" });
}

export async function clearHistoricalTasks() {
  const historicalStatuses = new Set(["completed", "failed", "canceled"]);
  const tasks = await getAllTasks();
  const historical = tasks.filter((task) => historicalStatuses.has(task.status));
  if (!historical.length) return 0;
  const database = await openTaskDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    const store = transaction.objectStore(TASK_STORE);
    historical.forEach((task) => store.delete(task.id));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("清空历史记录失败"));
    transaction.onabort = () => reject(transaction.error || new Error("清空历史记录已中止"));
  });
  broadcast({ type: "tasks-changed" });
  return historical.length;
}

export async function findExactTask(jobKey, contentHash) {
  const tasks = await getAllTasks();
  return tasks.find((task) => task.jobKey === jobKey && task.contentHash === contentHash) || null;
}

export async function getTaskStats() {
  const tasks = await getAllTasks();
  const stats = { total: tasks.length, queued: 0, running: 0, completed: 0, failed: 0, canceled: 0 };
  tasks.forEach((task) => {
    if (Object.hasOwn(stats, task.status)) stats[task.status] += 1;
  });
  return stats;
}

export async function recoverInterruptedTasks() {
  const tasks = await getAllTasks();
  const interrupted = tasks.filter((task) => task.status === "running");
  for (const task of interrupted) {
    task.status = "queued";
    task.phase = "waiting";
    task.recoveryCount = (task.recoveryCount || 0) + 1;
    task.error = "上次工作台关闭导致任务中断，已从最近完成阶段恢复排队。";
    await putTask(task);
  }
  return interrupted.length;
}

export async function migrateLegacyHistory() {
  const { legacyHistoryMigratedV1, analysisHistory = [] } = await chrome.storage.local.get(["legacyHistoryMigratedV1", "analysisHistory"]);
  if (legacyHistoryMigratedV1) return 0;
  const existing = await getAllTasks();
  const existingIds = new Set(existing.map((task) => task.id));
  let migrated = 0;
  for (const record of analysisHistory) {
    if (!record?.id || existingIds.has(record.id)) continue;
    const completedAt = record.createdAt || new Date().toISOString();
    await putTask({
      id: record.id,
      jobKey: record.job?.jobKey || record.job?.id || `legacy-${record.id}`,
      contentHash: record.job?.contentHash || record.job?.fingerprint || "legacy",
      job: record.job || {},
      resumeSnapshot: null,
      aiConfig: null,
      status: "completed",
      phase: "completed",
      stage: "complete",
      analysis: record.analysis,
      optimizedResume: record.optimizedResume,
      resumeThemeColor: record.resumeThemeColor || "#087f7c",
      error: "",
      attempts: 1,
      recoveryCount: 0,
      sourceTaskId: null,
      createdAt: completedAt,
      updatedAt: completedAt,
      startedAt: completedAt,
      completedAt
    });
    migrated += 1;
  }
  await chrome.storage.local.set({ legacyHistoryMigratedV1: true });
  return migrated;
}

export function subscribeToTaskChanges(callback) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", callback);
  return () => channel.close();
}

function broadcast(message) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地数据库操作失败"));
  });
}
