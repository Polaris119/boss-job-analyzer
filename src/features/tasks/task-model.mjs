import { TASK_STATUS } from "../../shared/constants/task-status.mjs";

export const DEFAULT_RESUME_THEME = "#087f7c";

export function createTaskRecord({ job, resumeSnapshot, aiConfig, sourceTaskId = null }) {
  const now = new Date().toISOString();
  return {
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
    status: TASK_STATUS.QUEUED,
    phase: "waiting",
    stage: "match",
    analysis: null,
    optimizedResume: null,
    resumeThemeColor: DEFAULT_RESUME_THEME,
    error: "",
    attempts: 0,
    recoveryCount: 0,
    sourceTaskId,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null
  };
}

export function createLegacyTask(record) {
  const completedAt = record.createdAt || new Date().toISOString();
  return {
    id: record.id,
    jobKey: record.job?.jobKey || record.job?.id || `legacy-${record.id}`,
    contentHash: record.job?.contentHash || record.job?.fingerprint || "legacy",
    job: record.job || {},
    resumeSnapshot: null,
    aiConfig: null,
    status: TASK_STATUS.COMPLETED,
    phase: "completed",
    stage: "complete",
    analysis: record.analysis,
    optimizedResume: record.optimizedResume,
    resumeThemeColor: record.resumeThemeColor || DEFAULT_RESUME_THEME,
    error: "",
    attempts: 1,
    recoveryCount: 0,
    sourceTaskId: null,
    createdAt: completedAt,
    updatedAt: completedAt,
    startedAt: completedAt,
    completedAt
  };
}
