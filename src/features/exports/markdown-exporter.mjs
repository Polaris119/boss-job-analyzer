import { requirementStatusLabel } from "../analysis/labels.mjs";

export function buildAnalysisMarkdown(record, salary) {
  const { job, analysis, optimizedResume } = record;
  const confirmationLines = !optimizedResume
    ? ["- 本次任务未生成定制简历。"]
    : optimizedResume.pendingConfirmations?.length
      ? optimizedResume.pendingConfirmations.map((item) => `- ${item.text}${item.reason ? `：${item.reason}` : ""}`)
      : ["- 无；仍建议人工复核全部事实。"];
  return [
    `# ${[job.company, job.title || "岗位"].filter(Boolean).join("｜")}分析报告`, "", `- 公司：${job.company || "未识别"}`, `- 薪资：${salary || "未识别"}`, `- 原始页面：${job.url}`, "",
    "## 1. 岗位概述", "", analysis.jobSummary, "",
    "## 2. 岗位要求与简历证据矩阵", "", "| 要求 | 类型 | 状态 | 简历证据 | 判断依据 |", "| --- | --- | --- | --- | --- |",
    ...analysis.requirements.map((item) => `| ${markdownCell(item.requirement)} | ${item.priority === "must" ? "必须项" : "加分项"} | ${requirementStatusLabel(item.status)} | ${markdownCell(item.evidence.join("；") || "无")} | ${markdownCell(item.rationale)} |`),
    "", "## 3. 简历优化建议", "", ...analysis.suggestions.flatMap((item, index) => [`### ${index + 1}. ${item.title}`, "", item.detail, "", `依据：${item.evidence || "无"}`, ""]),
    "## 4. 能力缺口", "", ...analysis.skillGaps.map((item) => `- **${item.skill}**（${item.priority}）：${item.reason}`),
    "", "## 5. 学习路线", "", ...analysis.roadmap.flatMap((item, index) => [`### ${index + 1}. ${item.stage}${item.duration ? `（${item.duration}）` : ""}`, "", ...item.goals.map((goal) => `- ${goal}`), "", `验收产出：${item.deliverable}`, ""]),
    "## 6. 面试准备重点", "", ...analysis.interviewFocus.map((item) => `- ${item}`), "",
    "## 7. 待用户确认的信息", "", ...confirmationLines, ""
  ].join("\n");
}

function markdownCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
