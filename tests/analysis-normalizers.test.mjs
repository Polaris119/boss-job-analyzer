import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnalysis, normalizeOptimizedResume, normalizePreparation, normalizeRoleProfile, parseJsonResponse } from "../src/features/analysis/normalizers.mjs";

test("parseJsonResponse accepts fenced and surrounding model output", () => {
  assert.deepEqual(parseJsonResponse("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(parseJsonResponse("说明文字 {\"ok\":true} 结束"), { ok: true });
});

test("normalizeRoleProfile applies controlled defaults", () => {
  const result = normalizeRoleProfile({ specialty: "产品运营", seniority: "unexpected", coreCriteria: [{ requirement: "留存增长", priority: "core" }] });
  assert.equal(result.primaryFamily, "general");
  assert.equal(result.seniority, "unknown");
  assert.equal(result.coreCriteria[0].id, "C1");
});

test("normalizeAnalysis keeps empty gaps for highly matched resumes", () => {
  const result = normalizeAnalysis({
    readiness: { level: "ready", oneLiner: "可以直接投递", confidence: "high" },
    strengths: [{ title: "项目匹配", resumeEvidence: ["知识库项目"] }],
    gaps: [],
    knowledgePoints: []
  });
  assert.equal(result.readiness.level, "ready");
  assert.equal(result.strengths[0].id, "S1");
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.nextActions, []);
});

test("normalizePreparation preserves conditional interview output", () => {
  const result = normalizePreparation({
    shortTermRoadmap: [{ title: "评测实践", concepts: ["召回率"] }],
    interview: { eligible: true, questions: [{ question: "如何评估 RAG？", answerOutline: ["定义指标"] }] }
  });
  assert.equal(result.shortTermRoadmap[0].id, "P1");
  assert.equal(result.interview.eligible, true);
  assert.equal(result.interview.questions[0].id, "Q1");
});

test("normalizeOptimizedResume rejects an empty formal resume", () => {
  assert.throws(() => normalizeOptimizedResume({ sections: [] }), /没有生成有效的简历章节/);
  assert.throws(() => normalizeOptimizedResume({ sections: [{ title: "旧版", items: ["旧版内容"] }] }), /没有生成有效的简历章节/);
});

test("normalizeOptimizedResume preserves structured resume entries", () => {
  const resume = normalizeOptimizedResume({
    fullName: "张三",
    politicalStatus: "中共党员",
    email: "example@example.com",
    birthDate: "2000.05",
    phone: "138-0000-0000",
    sections: [{
      title: "工作经历",
      entries: [{ date: "2024—至今", organization: "示例科技", position: "后端工程师", bullets: [{ label: "项目成果", text: "完成服务治理" }] }]
    }]
  });
  assert.equal(resume.politicalStatus, "中共党员");
  assert.equal(resume.email, "example@example.com");
  assert.equal(resume.birthDate, "2000.05");
  assert.equal(resume.phone, "138-0000-0000");
  assert.equal(resume.sections[0].entries[0].organization, "示例科技");
  assert.deepEqual(resume.sections[0].entries[0].bullets[0], { label: "项目成果", text: "完成服务治理" });
});
