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

export function normalizeRoleProfile(value) {
  if (!value || typeof value !== "object") throw new Error("岗位画像结果格式错误");
  const lens = value.expertLens || {};
  return {
    primaryFamily: option(value.primaryFamily, ["engineering", "data_ai", "product", "design", "operations", "marketing", "sales", "customer_service", "human_resources", "finance", "legal", "administration", "manufacturing", "healthcare", "education", "general"], "general"),
    secondaryFamily: string(value.secondaryFamily),
    specialty: string(value.specialty),
    seniority: option(value.seniority, ["junior", "mid", "senior", "lead", "unknown"], "unknown"),
    hiringIntent: string(value.hiringIntent),
    coreCriteria: array(value.coreCriteria).map((item, index) => ({
      id: string(item.id) || `C${index + 1}`,
      requirement: string(item.requirement),
      priority: option(item.priority, ["core", "important", "plus"], "important"),
      expectedEvidence: string(item.expectedEvidence),
      jdEvidence: string(item.jdEvidence)
    })).filter((item) => item.requirement),
    expertLens: {
      perspective: string(lens.perspective),
      focusAreas: strings(lens.focusAreas),
      successSignals: strings(lens.successSignals),
      riskSignals: strings(lens.riskSignals)
    },
    confidence: option(value.confidence, ["high", "medium", "low"], "medium"),
    ambiguity: string(value.ambiguity)
  };
}

export function normalizeAnalysis(value) {
  if (!value || typeof value !== "object") throw new Error("岗位分析结果格式错误");
  const readiness = value.readiness || {};
  return {
    readiness: {
      level: option(readiness.level, ["ready", "near_ready", "stretch", "insufficient_information"], "insufficient_information"),
      oneLiner: string(readiness.oneLiner),
      rationale: string(readiness.rationale),
      confidence: option(readiness.confidence, ["high", "medium", "low"], "medium")
    },
    strengths: array(value.strengths).map((item, index) => ({
      id: string(item.id) || `S${index + 1}`,
      title: string(item.title),
      jobNeed: string(item.jobNeed),
      resumeEvidence: strings(item.resumeEvidence),
      impact: string(item.impact)
    })).filter((item) => item.title),
    gaps: array(value.gaps).map((item, index) => ({
      id: string(item.id) || `G${index + 1}`,
      type: option(item.type, ["expression", "evidence", "skill", "experience", "information"], "information"),
      title: string(item.title),
      jobNeed: string(item.jobNeed),
      jdEvidence: string(item.jdEvidence),
      resumeEvidence: strings(item.resumeEvidence),
      impact: string(item.impact),
      action: string(item.action)
    })).filter((item) => item.title),
    nextActions: array(value.nextActions).map((item, index) => ({
      id: string(item.id) || `A${index + 1}`,
      title: string(item.title),
      detail: string(item.detail),
      timing: option(item.timing, ["before_application", "before_interview", "long_term"], "before_application"),
      relatedGapIds: strings(item.relatedGapIds)
    })).filter((item) => item.title),
    knowledgePoints: array(value.knowledgePoints).map((item, index) => ({
      id: string(item.id) || `K${index + 1}`,
      topic: string(item.topic),
      mode: option(item.mode, ["learn", "review", "practice"], "learn"),
      reason: string(item.reason),
      currentState: string(item.currentState),
      targetDepth: string(item.targetDepth),
      relatedGapIds: strings(item.relatedGapIds)
    })).filter((item) => item.topic)
  };
}

export function normalizePreparation(value) {
  if (!value || typeof value !== "object") throw new Error("准备规划结果格式错误");
  return {
    shortTermRoadmap: normalizeRoadmap(value.shortTermRoadmap, "P"),
    longTermRoadmap: normalizeRoadmap(value.longTermRoadmap, "L"),
    interview: {
      eligible: value.interview?.eligible === true,
      reason: string(value.interview?.reason),
      questions: array(value.interview?.questions).map((item, index) => ({
        id: string(item.id) || `Q${index + 1}`,
        type: option(item.type, ["evidence", "core", "gap", "scenario", "pressure"], "core"),
        question: string(item.question),
        why: string(item.why),
        assesses: string(item.assesses),
        resumeAnchor: string(item.resumeAnchor),
        answerOutline: strings(item.answerOutline),
        followUps: strings(item.followUps)
      })).filter((item) => item.question)
    }
  };
}

export function normalizeOptimizedResume(value, jobTitle) {
  if (!value || typeof value !== "object") throw new Error("定制简历结果格式错误");
  const sections = array(value.sections)
    .map((section) => ({ title: string(section.title), items: strings(section.items) }))
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

function normalizeRoadmap(value, prefix) {
  return array(value).map((item, index) => ({
    id: string(item.id) || `${prefix}${index + 1}`,
    title: string(item.title),
    relatedKnowledgePointIds: strings(item.relatedKnowledgePointIds),
    duration: string(item.duration),
    objective: string(item.objective),
    concepts: strings(item.concepts),
    practice: string(item.practice),
    deliverable: string(item.deliverable),
    completionCriteria: string(item.completionCriteria)
  })).filter((item) => item.title || item.objective);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value) {
  return array(value).map(string).filter(Boolean);
}

function string(value) {
  return value == null ? "" : String(value).trim();
}

function option(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
