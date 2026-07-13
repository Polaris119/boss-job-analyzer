function resumeForPrompt(resume) {
  return {
    sections: resume?.sections || [],
    rawText: resume?.sections?.length ? undefined : resume?.rawText || ""
  };
}

export function buildAnalysisMessages(task) {
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

export function buildResumeMessages(task, analysis) {
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
