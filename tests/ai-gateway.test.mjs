import test from "node:test";
import assert from "node:assert/strict";
import { toChatCompletionsUrl } from "../src/features/analysis/ai-gateway.mjs";

test("AI gateway normalizes compatible Chat Completions URLs", () => {
  assert.equal(toChatCompletionsUrl("https://api.example.com/v1"), "https://api.example.com/v1/chat/completions");
  assert.equal(toChatCompletionsUrl("https://api.example.com/v1/chat/completions"), "https://api.example.com/v1/chat/completions");
  assert.equal(toChatCompletionsUrl("http://localhost:8000/v1"), "http://localhost:8000/v1/chat/completions");
  assert.throws(() => toChatCompletionsUrl("http://api.example.com/v1"), /必须使用 HTTPS/);
});
