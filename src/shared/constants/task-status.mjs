export const TASK_STATUS = Object.freeze({
  CANCELED: "canceled",
  COMPLETED: "completed",
  FAILED: "failed",
  QUEUED: "queued",
  RUNNING: "running"
});

export const HISTORICAL_TASK_STATUSES = new Set([
  TASK_STATUS.COMPLETED,
  TASK_STATUS.FAILED,
  TASK_STATUS.CANCELED
]);
