import { MESSAGE_TYPES } from "../../shared/constants/message-types.mjs";

export async function requestAi(payload) {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.AI_REQUEST, payload });
  if (!response?.ok) throw new Error(response?.error || "AI 请求失败");
  return response.data;
}
