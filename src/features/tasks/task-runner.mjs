import { analyzeJobMatch, generateOptimizedResume, generatePreparationPlan, profileJob } from "../analysis/analysis-service.mjs";
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

    if (!task.roleProfile) {
      await setStage(task, "profile", "profiling");
      const roleProfile = await profileJob(task, apiKey);
      if (isCanceled()) return;
      task.roleProfile = roleProfile;
      await putTask(task);
    }

    if (!task.analysis) {
      await setStage(task, "analysis", "analyzing");
      const analysis = await analyzeJobMatch(task, task.roleProfile, apiKey);
      if (isCanceled()) return;
      task.analysis = analysis;
      await putTask(task);
    }

    if (!task.preparation) {
      await setStage(task, "preparation", "planning");
      const preparation = await generatePreparationPlan(task, task.roleProfile, task.analysis, apiKey);
      if (isCanceled()) return;
      task.preparation = preparation;
      await putTask(task);
    }

    if (generateResume && !task.optimizedResume) {
      await setStage(task, "resume", "generating-resume");
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

async function setStage(task, stage, phase) {
  task.stage = stage;
  task.phase = phase;
  await putTask(task);
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
