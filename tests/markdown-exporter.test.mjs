import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisMarkdown } from "../src/features/exports/markdown-exporter.mjs";

test("Markdown export supports the role-aware preparation report", () => {
  const markdown = buildAnalysisMarkdown({
    job: { company: "示例公司", title: "AI 产品经理", url: "https://example.com/job" },
    roleProfile: { hiringIntent: "推动 AI 产品从需求到落地" },
    analysis: {
      readiness: { level: "near_ready", oneLiner: "基本匹配，需补足效果评估证据。", confidence: "high" },
      strengths: [{ title: "产品落地", jobNeed: "交付 AI 产品", resumeEvidence: ["知识库项目"], impact: "具备完整实践" }],
      gaps: [{ title: "评测证据", type: "evidence", jobNeed: "效果评估", jdEvidence: "建立评测体系", resumeEvidence: [], impact: "无法判断效果", action: "补充指标" }],
      nextActions: [],
      knowledgePoints: [{ title: "", topic: "RAG 评测", mode: "practice", reason: "补足证据", currentState: "有项目", targetDepth: "可解释指标" }]
    },
    preparation: {
      shortTermRoadmap: [{ title: "建立评测集", duration: "1 周", objective: "形成效果证据", concepts: ["召回率"], practice: "执行对比实验", deliverable: "评测报告", completionCriteria: "可复现" }],
      longTermRoadmap: [],
      interview: { eligible: true, questions: [{ question: "如何评估 RAG？", why: "岗位关注效果", assesses: "评测能力", answerOutline: ["说明指标"], followUps: [] }] }
    },
    optimizedResume: null
  }, "20-30K");
  assert.match(markdown, /准备状态：准备后更适合投递/);
  assert.match(markdown, /## 1\. 准备度概览/);
  assert.match(markdown, /### 岗位核心任务/);
  assert.match(markdown, /类型：证据差距/);
  assert.match(markdown, /## 6\. 短期学习路线/);
  assert.match(markdown, /如何评估 RAG/);
  assert.match(markdown, /本次任务未生成定制简历/);
});
