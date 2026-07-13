import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisMarkdown } from "../src/features/exports/markdown-exporter.mjs";

test("Markdown export keeps report sections and escapes table cells", () => {
  const markdown = buildAnalysisMarkdown({
    job: { company: "示例公司", title: "AI 工程师", url: "https://example.com/job" },
    analysis: {
      jobSummary: "岗位概述",
      requirements: [{ requirement: "Python | RAG", priority: "must", status: "partial", evidence: ["项目\n经历"], rationale: "部分匹配" }],
      suggestions: [], skillGaps: [], roadmap: [], interviewFocus: []
    },
    optimizedResume: { pendingConfirmations: [] }
  }, "20-30K");
  assert.match(markdown, /Python \\| RAG/);
  assert.match(markdown, /项目<br>经历/);
  assert.match(markdown, /部分满足/);
  assert.match(markdown, /## 7\. 待用户确认的信息/);
});
