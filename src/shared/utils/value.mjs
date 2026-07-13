export function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function formatDate(value, dateStyle = "medium") {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle, timeStyle: "short" }).format(new Date(value));
  } catch {
    return "";
  }
}

export function safeFilename(value) {
  return String(value || "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 100);
}

export function validThemeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}
