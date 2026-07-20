import { TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { DEFAULT_RESUME_THEME, normalizeResumePresentation } from "../resume/resume-document.mjs";

export { DEFAULT_RESUME_THEME };

export function createTaskRecord({ job, resumeSnapshot, aiConfig, generateResume = true, roleProfile = null, sourceTaskId = null }) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    jobKey: job.jobKey || job.id,
    contentHash: job.contentHash || job.fingerprint || "",
    job,
    resumeSnapshot,
    generateResume: generateResume !== false,
    aiConfig: {
      provider: aiConfig.provider,
      baseUrl: aiConfig.baseUrl,
      model: aiConfig.model
    },
    status: TASK_STATUS.QUEUED,
    phase: "waiting",
    stage: "profile",
    roleProfile: isReusableRoleProfile(roleProfile) ? roleProfile : null,
    analysis: null,
    preparation: null,
    optimizedResume: null,
    resumeThemeColor: DEFAULT_RESUME_THEME,
    resumePresentation: normalizeResumePresentation(),
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

function isReusableRoleProfile(value) {
  return Boolean(value?.coreCriteria && value?.expertLens);
}
