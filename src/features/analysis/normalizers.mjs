export function parseJsonResponse(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
    throw new Error("模型没有返回合法的结构化 JSON，请更换兼容模型后重试");
  }
}

export function normalizeAnalysis(value) {
  if (!value || typeof value !== "object") throw new Error("岗位分析结果格式错误");
  return {
    jobSummary: string(value.jobSummary),
    requirements: array(value.requirements).map((item, index) => ({
      id: string(item.id) || `R${index + 1}`,
      requirement: string(item.requirement),
      priority: ["must", "plus"].includes(item.priority) ? item.priority : "must",
      status: ["met", "partial", "missing"].includes(item.status) ? item.status : "missing",
      evidence: array(item.evidence).map(string).filter(Boolean),
      rationale: string(item.rationale)
    })).filter((item) => item.requirement),
    suggestions: array(value.suggestions).map((item) => ({ title: string(item.title), detail: string(item.detail), evidence: string(item.evidence) })),
    skillGaps: array(value.skillGaps).map((item) => ({ skill: string(item.skill), priority: string(item.priority), reason: string(item.reason) })),
    roadmap: array(value.roadmap).map((item) => ({ stage: string(item.stage), duration: string(item.duration), goals: array(item.goals).map(string), deliverable: string(item.deliverable) })),
    interviewFocus: array(value.interviewFocus).map(string).filter(Boolean)
  };
}

export function normalizeOptimizedResume(value, jobTitle) {
  if (!value || typeof value !== "object") throw new Error("定制简历结果格式错误");
  const sections = array(value.sections)
    .map((section) => ({ title: string(section.title), items: array(section.items).map(string).filter(Boolean) }))
    .filter((section) => section.title && section.items.length);
  if (!sections.length) throw new Error("模型没有生成有效的简历章节");
  return {
    fullName: string(value.fullName),
    headline: string(value.headline) || jobTitle || "",
    contactLine: string(value.contactLine),
    summary: string(value.summary),
    sections,
    pendingConfirmations: array(value.pendingConfirmations).map((item, index) => ({
      id: string(item.id) || `C${index + 1}`,
      text: string(item.text),
      reason: string(item.reason)
    })).filter((item) => item.text)
  };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function string(value) {
  return value == null ? "" : String(value).trim();
}
