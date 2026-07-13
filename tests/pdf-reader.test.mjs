import test from "node:test";
import assert from "node:assert/strict";
import { groupItemsIntoLines } from "../src/features/resume/pdf-layout.mjs";

test("PDF text items are grouped by visual line and x position", () => {
  const items = [
    { str: "工程师", transform: [1, 0, 0, 1, 100, 700], width: 40 },
    { str: "AI", transform: [1, 0, 0, 1, 70, 700], width: 20 },
    { str: "Python", transform: [1, 0, 0, 1, 70, 680], width: 45 },
    { str: "RAG", transform: [1, 0, 0, 1, 125, 680], width: 25 }
  ];
  assert.deepEqual(groupItemsIntoLines(items), ["AI 工程师", "Python RAG"]);
});

test("empty PDF text items do not create blank lines", () => {
  assert.deepEqual(groupItemsIntoLines([{ str: "  ", transform: [1, 0, 0, 1, 0, 0] }]), []);
});
