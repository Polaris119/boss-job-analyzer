import { createTask } from "../../features/tasks/task-service.mjs";
import { localStore, sessionStore } from "../../platform/chrome/storage.mjs";
import { findExactTask } from "../../platform/indexeddb/task-repository.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { clone } from "../../shared/utils/value.mjs";

export async function enqueueStoredCurrentJob({ force = false } = {}) {
  const local = await localStore.get([
    STORAGE_KEYS.AI_CONFIG,
    STORAGE_KEYS.BASE_RESUME,
    STORAGE_KEYS.CURRENT_JOB,
    STORAGE_KEYS.GENERATE_RESUME
  ]);
  const session = await sessionStore.get(STORAGE_KEYS.SESSION_API_KEY);
  const aiConfig = local[STORAGE_KEYS.AI_CONFIG];
  const baseResume = local[STORAGE_KEYS.BASE_RESUME];
  const currentJob = local[STORAGE_KEYS.CURRENT_JOB];
  const generateResume = local[STORAGE_KEYS.GENERATE_RESUME] !== false;
  const apiKey = aiConfig?.apiKey || session[STORAGE_KEYS.SESSION_API_KEY];

  if (!baseResume) return needsSetup("还差一份基础简历。先在首页上传并确认简历，之后就可以直接分析岗位了。");
  if (!aiConfig?.baseUrl || !aiConfig?.model) return needsSetup("AI 服务还没有配置好。先在首页完成设置，之后点击岗位按钮就能直接分析。");
  if (!apiKey) return needsSetup("AI Key 已失效或尚未保存。重新打开首页补充 Key 后就能继续分析。");
  let originPattern;
  try { originPattern = `${new URL(aiConfig.baseUrl).origin}/*`; }
  catch { return needsSetup("AI 服务地址看起来不正确。请回到首页检查 Base URL 后再试。"); }
  if (!await chrome.permissions.contains({ origins: [originPattern] })) {
    return needsSetup("AI 服务的访问授权已经失效。回到首页重新保存配置后就能继续分析。");
  }
  if (!currentJob?.jobKey && !currentJob?.id) {
    return { ok: false, message: "暂时没能读取到这个岗位，请刷新岗位详情页后再试一次。" };
  }

  const jobKey = currentJob.jobKey || currentJob.id;
  const contentHash = currentJob.contentHash || currentJob.fingerprint;
  const exact = await findExactTask(jobKey, contentHash, generateResume);
  if (!force && exact && [TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(exact.status)) {
    return {
      ok: true,
      status: "active",
      taskId: exact.id,
      message: "这个岗位已经在分析中了，不用重复添加。你可以放心继续浏览其他岗位。"
    };
  }
  if (!force && exact?.status === TASK_STATUS.COMPLETED) {
    return {
      ok: true,
      status: "completed",
      taskId: exact.id,
      message: "这个岗位已经有分析结果了。你可以直接查看，也可以结合当前简历重新分析一次。"
    };
  }

  const task = await createTask({
    job: clone(currentJob),
    resumeSnapshot: clone(baseResume),
    aiConfig,
    generateResume,
    roleProfile: exact?.roleProfile ? clone(exact.roleProfile) : null,
    sourceTaskId: exact?.id || null
  });
  const requeued = exact && [TASK_STATUS.FAILED, TASK_STATUS.CANCELED].includes(exact.status);
  return {
    ok: true,
    status: requeued ? "requeued" : "queued",
    taskId: task.id,
    message: requeued
      ? "已经重新加入分析队列，我们会接着处理这个岗位。你可以继续浏览其他机会。"
      : generateResume
        ? "已经为你加入分析队列。完成岗位分析后，还会生成一份定制简历。"
        : "已经为你加入分析队列。这次只生成岗位分析报告，不会额外生成简历。"
  };
}

function needsSetup(message) {
  return { ok: false, needsSetup: true, message };
}
