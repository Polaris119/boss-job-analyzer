import { requestAi } from "../../platform/chrome/messaging.mjs";
import { buildAnalysisMessages, buildResumeMessages } from "./prompts.mjs";
import { normalizeAnalysis, normalizeOptimizedResume, parseJsonResponse } from "./normalizers.mjs";

export async function analyzeJobMatch(task, apiKey) {
  const text = await request(task.aiConfig, apiKey, buildAnalysisMessages(task), true);
  return normalizeAnalysis(parseJsonResponse(text));
}

export async function generateOptimizedResume(task, analysis, apiKey) {
  const text = await request(task.aiConfig, apiKey, buildResumeMessages(task, analysis), true);
  return normalizeOptimizedResume(parseJsonResponse(text), task.job?.title);
}

function request(config, apiKey, messages, jsonMode) {
  if (!config?.baseUrl || !config?.model || !apiKey) {
    throw new Error("任务缺少可用的 AI 配置或 API Key");
  }
  return requestAi({
    baseUrl: config.baseUrl,
    apiKey,
    model: config.model,
    messages,
    jsonMode
  });
}
