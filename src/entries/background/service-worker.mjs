import { callAi } from "../../features/analysis/ai-gateway.mjs";
import { withExtensionKeepAlive } from "../../platform/chrome/service-worker-keepalive.mjs";
import { getAllTasks } from "../../platform/indexeddb/task-repository.mjs";
import { MESSAGE_TYPES } from "../../shared/constants/message-types.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { hasActiveQueueTasks, wakeQueue } from "./queue-controller.mjs";

const QUEUE_RECOVERY_ALARM = "job-analysis-queue-recovery";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  kickQueueSafely();
});

chrome.runtime.onStartup.addListener(kickQueueSafely);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_RECOVERY_ALARM) kickQueueSafely();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEYS.QUEUE_CONCURRENCY] || changes[STORAGE_KEYS.QUEUE_PAUSED]) kickQueueSafely();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.OPEN_SIDE_PANEL) {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "无法识别当前标签页" });
      return;
    }

    chrome.sidePanel.open({ tabId })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_TYPES.AI_REQUEST) {
    withExtensionKeepAlive(() => callAi(message.payload))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_TYPES.WAKE_TASK_QUEUE) {
    kickQueue()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function kickQueue() {
  await wakeQueue();
  if (await hasActiveQueueTasks()) {
    chrome.alarms.create(QUEUE_RECOVERY_ALARM, { delayInMinutes: 1 });
  } else {
    await chrome.alarms.clear(QUEUE_RECOVERY_ALARM);
  }
}

function kickQueueSafely() {
  void kickQueue().catch((error) => console.error("后台队列唤醒失败", error));
}

void recoverQueueWhenWorkerStarts().catch((error) => console.error("后台队列恢复失败", error));

async function recoverQueueWhenWorkerStarts() {
  const tasks = await getAllTasks();
  if (tasks.some((task) => [TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status))) await kickQueue();
}
