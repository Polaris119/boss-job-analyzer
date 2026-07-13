import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnalysis, normalizeOptimizedResume, parseJsonResponse } from "../src/features/analysis/normalizers.mjs";

test("parseJsonResponse accepts fenced and surrounding model output", () => {
  assert.deepEqual(parseJsonResponse("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(parseJsonResponse("说明文字 {\"ok\":true} 结束"), { ok: true });
});

test("normalizeAnalysis applies safe defaults to model fields", () => {
  const result = normalizeAnalysis({
    jobSummary: "  后端岗位  ",
    requirements: [{ requirement: "Python", priority: "unexpected", status: "unexpected", evidence: [" 项目经历 "] }]
  });
  assert.deepEqual(result.requirements[0], {
    id: "R1",
    requirement: "Python",
    priority: "must",
    status: "missing",
    evidence: ["项目经历"],
    rationale: ""
  });
  assert.deepEqual(result.suggestions, []);
});

test("normalizeOptimizedResume rejects an empty formal resume", () => {
  assert.throws(() => normalizeOptimizedResume({ sections: [] }, "AI 工程师"), /没有生成有效的简历章节/);
});
