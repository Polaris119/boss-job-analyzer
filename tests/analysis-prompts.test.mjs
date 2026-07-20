import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisMessages, buildPreparationMessages, buildResumeMessages, buildRoleProfileMessages } from "../src/features/analysis/prompts.mjs";

const task = {
  job: { title: "产品运营", description: "负责用户增长和留存" },
  resumeSnapshot: { sections: [{ title: "经历", items: ["负责知识库项目"] }] }
};

test("role profiling only receives the job description", () => {
  const messages = buildRoleProfileMessages(task);
  assert.match(messages[1].content, /产品运营/);
  assert.doesNotMatch(messages[1].content, /负责知识库项目/);
});

test("gap diagnosis receives the role profile and permits an empty gap list", () => {
  const messages = buildAnalysisMessages(task, { specialty: "用户增长", expertLens: { perspective: "增长负责人" } });
  assert.match(messages[1].content, /增长负责人/);
  assert.match(messages[1].content, /负责知识库项目/);
  assert.match(messages[0].content, /高适配时允许 gaps 和 knowledgePoints 为空/);
});

test("preparation planning is constrained to diagnosed knowledge points", () => {
  const messages = buildPreparationMessages(task, { specialty: "用户增长" }, {
    readiness: { level: "near_ready" },
    gaps: [{ id: "G1", title: "留存分析" }],
    knowledgePoints: [{ id: "K1", topic: "留存指标" }]
  });
  assert.match(messages[1].content, /K1/);
  assert.match(messages[0].content, /不得新增或改写诊断结论/);
  assert.match(messages[0].content, /readiness 为 ready 或 near_ready/);
});

test("resume generation uses separate personal fields and a dedicated awards layout", () => {
  const messages = buildResumeMessages(task, { readiness: { level: "near_ready" } });
  assert.match(messages[1].content, /politicalStatus/);
  assert.match(messages[1].content, /birthDate/);
  assert.match(messages[1].content, /phone/);
  assert.match(messages[1].content, /email/);
  assert.match(messages[0].content, /荣誉奖项区块的 kind 必须为 awards/);
  assert.doesNotMatch(messages[1].content, /contactLine|headline/);
});
