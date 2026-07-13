export const ROUTES = Object.freeze({
  RESULTS: "src/entries/results/index.html",
  RESUME_EDITOR: "src/entries/resume-editor/index.html",
  RESUME_PRINT: "src/entries/resume-print/index.html",
  WORKBENCH: "src/entries/workbench/index.html"
});

export function resultRoute(taskId) {
  return `${ROUTES.RESULTS}?task=${encodeURIComponent(taskId)}`;
}
