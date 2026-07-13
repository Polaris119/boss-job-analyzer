export async function callAi({ baseUrl, apiKey, model, messages, jsonMode = false }) {
  const endpoint = toChatCompletionsUrl(baseUrl);
  const body = { model, messages, temperature: 0.2 };
  if (jsonMode) body.response_format = { type: "json_object" };

  let response = await performRequest(endpoint, apiKey, body);
  if (!response.ok && jsonMode && response.status === 400) {
    delete body.response_format;
    response = await performRequest(endpoint, apiKey, body);
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`AI 接口返回了非 JSON 内容（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw new Error(`AI 接口调用失败：${detail}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("AI 接口没有返回可用内容");
  return content;
}

function performRequest(endpoint, apiKey, body) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
}

export function toChatCompletionsUrl(baseUrl) {
  const value = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!value) throw new Error("请填写 Base URL");

  const parsed = new URL(value);
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    throw new Error("AI 接口必须使用 HTTPS（本地开发地址除外）");
  }

  if (parsed.pathname.endsWith("/chat/completions")) return parsed.toString();
  return `${value}/chat/completions`;
}
