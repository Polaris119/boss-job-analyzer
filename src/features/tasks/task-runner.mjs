import { analyzeJobMatch, generateOptimizedResume } from "../analysis/analysis-service.mjs";
import { localStore, sessionStore } from "../../platform/chrome/storage.mjs";
import { putTask } from "../../platform/indexeddb/task-repository.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { TASK_STATUS } from "../../shared/constants/task-status.mjs";

export async function runTask(task, isCanceled) {
  try {
    const generateResume = task.generateResume !== false;
    const apiKey = await getApiKey(task);
    task.status = TASK_STATUS.RUNNING;
    task.startedAt ||= new Date().toISOString();
    task.attempts = (task.attempts || 0) + 1;
    task.error = "";

    if (!task.analysis) {
      task.stage = "match";
      task.phase = "matching";
      await putTask(task);
      const analysis = await analyzeJobMatch(task, apiKey);
      if (isCanceled()) return;
      task.analysis = analysis;
      if (generateResume) {
        task.stage = "resume";
        task.phase = "generating-resume";
      }
      await putTask(task);
    }

    if (generateResume && !task.optimizedResume) {
      task.stage = "resume";
      task.phase = "generating-resume";
      await putTask(task);
      const optimizedResume = await generateOptimizedResume(task, task.analysis, apiKey);
      if (isCanceled()) return;
      task.optimizedResume = optimizedResume;
    }

    task.status = TASK_STATUS.COMPLETED;
    task.stage = "complete";
    task.phase = "completed";
    task.completedAt = new Date().toISOString();
    task.error = "";
    await putTask(task);
  } catch (error) {
    if (isCanceled()) return;
    task.status = TASK_STATUS.FAILED;
    task.phase = "failed";
    task.error = error?.message || String(error);
    await putTask(task);
  }
}

async function getApiKey(task) {
  const local = await localStore.get(STORAGE_KEYS.AI_CONFIG);
  const session = await sessionStore.get(STORAGE_KEYS.SESSION_API_KEY);
  const aiConfig = local[STORAGE_KEYS.AI_CONFIG];
  if (aiConfig?.baseUrl && aiConfig.baseUrl !== task.aiConfig?.baseUrl) {
    throw new Error("AI 接口配置已在任务入队后变更，请使用当前配置重新分析该岗位");
  }
  const key = aiConfig?.apiKey || session[STORAGE_KEYS.SESSION_API_KEY];
  if (!key) throw new Error("没有可用的 API Key，请返回插件重新保存 AI 配置");
  return key;
}
