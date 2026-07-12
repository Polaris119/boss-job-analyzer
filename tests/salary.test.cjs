const test = require("node:test");
const assert = require("node:assert/strict");
const salary = require("../salary.js");

test("extracts and normalizes a readable salary range", () => {
  assert.equal(salary.extractReadableSalary(["薪资 15 - 25k · 13 薪"]), "15-25K·13薪");
});

test("falls back from private-font glyphs to metadata", () => {
  assert.equal(salary.extractReadableSalary(["\ue123-\ue456K·\ue789薪", "AI 工程师招聘，薪资20-35K"]), "20-35K");
});

test("does not return private-use glyphs as salary", () => {
  assert.equal(salary.extractReadableSalary(["\ue123-\ue456K·\ue789薪"]), "");
});
