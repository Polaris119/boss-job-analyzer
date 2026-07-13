export function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1]);
}

export function sliceByHeadings(text, starts, ends) {
  let start = -1;
  for (const heading of starts) {
    const index = text.indexOf(heading);
    if (index >= 0 && (start < 0 || index < start)) start = index;
  }
  if (start < 0) return "";

  let end = text.length;
  for (const heading of ends) {
    const index = text.indexOf(heading, start + 1);
    if (index >= 0 && index < end) end = index;
  }
  return text.slice(start, end);
}
