export async function analyzeJobMatch(task, apiKey) {
  const text = await requestAi(task.aiConfig, apiKey, buildAnalysisMessages(task), true);
  return normalizeAnalysis(parseJsonResponse(text));
}

export async function generateOptimizedResume(task, analysis, apiKey) {
  const text = await requestAi(task.aiConfig, apiKey, buildResumeMessages(task, analysis), true);
  return normalizeOptimizedResume(parseJsonResponse(text), task.job?.title);
}

function buildAnalysisMessages(task) {
  const schema = {
    jobSummary: "岗位概述",
    requirements: [{ id: "R1", requirement: "要求", priority: "must|plus", status: "met|partial|missing", evidence: ["简历原文证据"], rationale: "判断依据" }],
    suggestions: [{ title: "建议标题", detail: "具体建议", evidence: "依据；没有则写无" }],
    skillGaps: [{ skill: "缺口", priority: "high|medium|low", reason: "原因" }],
    roadmap: [{ stage: "阶段", duration: "时间", goals: ["目标"], deliverable: "可验收产出" }],
    interviewFocus: ["面试准备重点"]
  };
  return [
    { role: "system", content: "你是严谨的技术招聘分析师。只根据用户提供的职位和简历做判断。禁止虚构技能、项目、公司、年限、职责和量化数据。匹配结论必须给出简历原文证据；找不到证据时必须标记 missing。学习路线必须来自岗位与简历之间的真实差距。输出必须是一个合法 JSON 对象，不要使用 Markdown 代码块。" },
    { role: "user", content: `请按指定结构分析。\n\n职位：\n${JSON.stringify(task.job)}\n\n基础简历：\n${JSON.stringify(resumeForPrompt(task.resumeSnapshot))}\n\n输出结构：\n${JSON.stringify(schema)}` }
  ];
}

function buildResumeMessages(task, analysis) {
  const schema = {
    fullName: "姓名；无法确认则为空",
    headline: "目标职位标题",
    contactLine: "只使用简历已有联系方式",
    summary: "个人概述",
    sections: [{ title: "工作经历", items: ["完整条目"] }],
    pendingConfirmations: [{ id: "C1", text: "需要用户确认的内容", reason: "为什么不能直接采用" }]
  };
  return [
    { role: "system", content: "你是简历编辑，不是简历作者。只重新组织和改写已存在的事实。禁止新增原简历没有的技能、项目、公司、成果、数字或联系方式。无法确认但可能有价值的内容只能放入 pendingConfirmations，不能写入正式简历。保持时间、公司、职位和学校等事实一致。输出合法 JSON 对象，不要使用 Markdown 代码块。" },
    { role: "user", content: `请针对当前岗位生成一份结构完整的定制简历。\n\n基础简历：\n${JSON.stringify(resumeForPrompt(task.resumeSnapshot))}\n\n岗位分析：\n${JSON.stringify(analysis)}\n\n输出结构：\n${JSON.stringify(schema)}` }
  ];
}

function resumeForPrompt(resume) {
  return { sections: resume?.sections || [], rawText: resume?.sections?.length ? undefined : resume?.rawText || "" };
}

async function requestAi(config, apiKey, messages, jsonMode) {
  if (!config?.baseUrl || !config?.model || !apiKey) throw new Error("任务缺少可用的 AI 配置或 API Key");
  const response = await chrome.runtime.sendMessage({
    type: "AI_REQUEST",
    payload: { baseUrl: config.baseUrl, apiKey, model: config.model, messages, jsonMode }
  });
  if (!response?.ok) throw new Error(response?.error || "AI 请求失败");
  return response.data;
}

function parseJsonResponse(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
    throw new Error("模型没有返回合法的结构化 JSON，请更换兼容模型后重试");
  }
}

function normalizeAnalysis(value) {
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

function normalizeOptimizedResume(value, jobTitle) {
  if (!value || typeof value !== "object") throw new Error("定制简历结果格式错误");
  const sections = array(value.sections).map((section) => ({ title: string(section.title), items: array(section.items).map(string).filter(Boolean) }))
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

function array(value) { return Array.isArray(value) ? value : []; }
function string(value) { return value == null ? "" : String(value).trim(); }
