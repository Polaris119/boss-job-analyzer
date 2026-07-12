export function clampConcurrency(value) {
  return Math.min(3, Math.max(1, Number(value) || 2));
}

export function selectRunnableTasks(tasks, runningIds, concurrency) {
  const running = runningIds instanceof Set ? runningIds : new Set(runningIds);
  const available = Math.max(0, clampConcurrency(concurrency) - running.size);
  return tasks
    .filter((task) => task.status === "queued" && !running.has(task.id))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .slice(0, available);
}
