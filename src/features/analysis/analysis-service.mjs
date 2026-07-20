import { callAi } from "./ai-gateway.mjs";
import { buildAnalysisMessages, buildPreparationMessages, buildResumeMessages, buildRoleProfileMessages } from "./prompts.mjs";
import { normalizeAnalysis, normalizeOptimizedResume, normalizePreparation, normalizeRoleProfile, parseJsonResponse } from "./normalizers.mjs";

export async function profileJob(task, apiKey) {
  const text = await request(task.aiConfig, apiKey, buildRoleProfileMessages(task), true);
  return normalizeRoleProfile(parseJsonResponse(text));
}

export async function analyzeJobMatch(task, roleProfile, apiKey) {
  const text = await request(task.aiConfig, apiKey, buildAnalysisMessages(task, roleProfile), true);
  return normalizeAnalysis(parseJsonResponse(text));
}

export async function generatePreparationPlan(task, roleProfile, analysis, apiKey) {
  const text = await request(task.aiConfig, apiKey, buildPreparationMessages(task, roleProfile, analysis), true);
  const preparation = normalizePreparation(parseJsonResponse(text));
  preparation.interview.eligible = ["ready", "near_ready"].includes(analysis.readiness?.level);
  if (!preparation.interview.eligible) preparation.interview.questions = [];
  return preparation;
}

export async function generateOptimizedResume(task, analysis, apiKey) {
  const text = await request(task.aiConfig, apiKey, buildResumeMessages(task, analysis), true);
  return normalizeOptimizedResume(parseJsonResponse(text));
}

function request(config, apiKey, messages, jsonMode) {
  if (!config?.baseUrl || !config?.model || !apiKey) {
    throw new Error("任务缺少可用的 AI 配置或 API Key");
  }
  return callAi({
    baseUrl: config.baseUrl,
    apiKey,
    model: config.model,
    messages,
    jsonMode
  });
}
