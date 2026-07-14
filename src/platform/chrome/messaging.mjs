import { MESSAGE_TYPES } from "../../shared/constants/message-types.mjs";

export async function requestAi(payload) {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.AI_REQUEST, payload });
  if (!response?.ok) throw new Error(response?.error || "AI 请求失败");
  return response.data;
}

export async function wakeTaskQueue() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.WAKE_TASK_QUEUE });
  if (!response?.ok) throw new Error(response?.error || "无法启动后台分析队列");
}
