const READINESS = { ready: "可以直接投递", near_ready: "准备后更适合投递", stretch: "挑战型岗位", insufficient_information: "信息不足" };
const GAP_TYPES = { expression: "表达差距", evidence: "证据差距", skill: "技能差距", experience: "经历差距", information: "信息缺口" };
const KNOWLEDGE_MODES = { learn: "需要学习", review: "建议复习", practice: "需要实践" };

export function buildAnalysisMarkdown(record, salary) {
  return buildModernMarkdown(record, salary);
}

function buildModernMarkdown(record, salary) {
  const { job, analysis, optimizedResume } = record;
  const roleProfile = record.roleProfile || {};
  const preparation = record.preparation || {};
  const lines = [
    `# ${[job.company, job.title || "岗位"].filter(Boolean).join("｜")}岗位准备分析`, "",
    `- 公司：${job.company || "未识别"}`,
    `- 薪资：${salary || "未识别"}`,
    `- 原始页面：${job.url}`, "",
    "## 1. 准备度概览", "",
    `- 准备状态：${READINESS[analysis.readiness.level] || "信息不足"}`,
    `- 判断置信度：${analysis.readiness.confidence || "medium"}`,
    "", analysis.readiness.oneLiner, ""
  ];
  if (analysis.readiness.rationale) lines.push(analysis.readiness.rationale, "");
  if (roleProfile.hiringIntent) lines.push("### 岗位核心任务", "", roleProfile.hiringIntent, "");
  lines.push("## 2. 已有优势", "", ...insightLines(analysis.strengths, strengthLine));
  lines.push("## 3. 关键差距", "", ...(analysis.gaps.length ? insightLines(analysis.gaps, gapLine) : ["- 没有发现会影响当前岗位投递的关键差距。", ""]));
  lines.push("## 4. 接下来要做的事", "", ...insightLines(analysis.nextActions, actionLine));
  lines.push("## 5. 需要学习或复习的知识点", "", ...(analysis.knowledgePoints.length ? insightLines(analysis.knowledgePoints, knowledgeLine) : ["- 当前没有需要额外补充的知识点。", ""]));
  appendRoadmap(lines, "6", "短期学习路线", preparation.shortTermRoadmap || []);
  appendRoadmap(lines, "7", "长期学习路线", preparation.longTermRoadmap || []);
  appendInterview(lines, preparation.interview || {});
  lines.push("## 9. 待用户确认的信息", "", ...confirmationLines(optimizedResume), "");
  return lines.join("\n");
}

function insightLines(items, formatter) {
  if (!items?.length) return ["- 无", ""];
  return items.flatMap((item, index) => [`### ${index + 1}. ${item.title}`, "", formatter(item), ""]);
}

function strengthLine(item) {
  return [`- 岗位需要：${item.jobNeed || "未说明"}`, `- 简历证据：${item.resumeEvidence.join("；") || "无"}`, `- 价值：${item.impact || "未说明"}`].join("\n");
}

function gapLine(item) {
  return [`- 类型：${GAP_TYPES[item.type] || "关键差距"}`, `- 岗位需要：${item.jobNeed || "未说明"}`, `- JD 依据：${item.jdEvidence || "未说明"}`, `- 简历现状：${item.resumeEvidence.join("；") || "无明确证据"}`, `- 影响：${item.impact || "未说明"}`, `- 建议：${item.action || "未说明"}`].join("\n");
}

function actionLine(item) {
  return `${item.detail || ""}${item.relatedGapIds?.length ? `\n\n关联差距：${item.relatedGapIds.join("、")}` : ""}`;
}

function knowledgeLine(item) {
  return [`- 类型：${KNOWLEDGE_MODES[item.mode] || "知识准备"}`, `- 原因：${item.reason || "未说明"}`, `- 当前程度：${item.currentState || "无法判断"}`, `- 目标深度：${item.targetDepth || "未说明"}`].join("\n");
}

function appendRoadmap(lines, number, title, items) {
  lines.push(`## ${number}. ${title}`, "");
  if (!items.length) {
    lines.push("- 无需生成。", "");
    return;
  }
  items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title || item.objective}${item.duration ? `（${item.duration}）` : ""}`, "");
    if (item.objective) lines.push(`- 目标：${item.objective}`);
    if (item.concepts?.length) lines.push(`- 核心概念：${item.concepts.join("；")}`);
    if (item.practice) lines.push(`- 实践任务：${item.practice}`);
    if (item.deliverable) lines.push(`- 验收产出：${item.deliverable}`);
    if (item.completionCriteria) lines.push(`- 完成标准：${item.completionCriteria}`);
    lines.push("");
  });
}

function appendInterview(lines, interview) {
  lines.push("## 8. 针对性面试准备", "");
  if (!interview.eligible || !interview.questions?.length) {
    lines.push(`- ${interview.reason || "当前准备状态暂不生成面试题。"}`, "");
    return;
  }
  interview.questions.forEach((item, index) => {
    lines.push(`### Q${index + 1}. ${item.question}`, "", `- 为什么可能会问：${item.why || "未说明"}`, `- 主要考察：${item.assesses || "未说明"}`);
    if (item.resumeAnchor) lines.push(`- 简历回答锚点：${item.resumeAnchor}`);
    if (item.answerOutline?.length) lines.push(`- 回答组织思路：${item.answerOutline.join("；")}`);
    if (item.followUps?.length) lines.push(`- 可能追问：${item.followUps.join("；")}`);
    lines.push("");
  });
}

function confirmationLines(optimizedResume) {
  if (!optimizedResume) return ["- 本次任务未生成定制简历。"];
  return optimizedResume.pendingConfirmations?.length
    ? optimizedResume.pendingConfirmations.map((item) => `- ${item.text}${item.reason ? `：${item.reason}` : ""}`)
    : ["- 无；仍建议人工复核全部事实。"];
}
