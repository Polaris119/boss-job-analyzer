import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText, sliceByHeadings } from "../src/shared/utils/text.mjs";
import { splitResumeSections } from "../src/features/resume/resume-parser.mjs";

test("normalizeText removes duplicate whitespace", () => {
  assert.equal(normalizeText("  Python\t  TypeScript\n\n\nRAG  "), "Python TypeScript\n\nRAG");
});

test("sliceByHeadings keeps only the requested job section", () => {
  const page = "导航\n职位描述\n开发 AI Agent\n熟悉 RAG\n公司介绍\n示例公司";
  assert.equal(sliceByHeadings(page, ["职位描述"], ["公司介绍"]), "职位描述\n开发 AI Agent\n熟悉 RAG\n");
});

test("splitResumeSections creates editable resume blocks", () => {
  const resume = [
    "张三 13800000000", "个人优势", "5 年后端经验", "工作经历", "示例公司",
    "负责平台开发", "项目经历", "智能问答项目", "教育经历", "示例大学 本科"
  ].join("\n");
  assert.deepEqual(splitResumeSections(resume), [
    { title: "基本信息", text: "张三 13800000000" },
    { title: "个人优势", text: "5 年后端经验" },
    { title: "工作经历", text: "示例公司\n负责平台开发" },
    { title: "项目经历", text: "智能问答项目" },
    { title: "教育经历", text: "示例大学 本科" }
  ]);
});

test("splitResumeSections removes adjacent duplicate page text", () => {
  assert.deepEqual(splitResumeSections("工作经历\n示例公司\n示例公司\n负责开发"), [
    { title: "工作经历", text: "示例公司\n负责开发" }
  ]);
});
