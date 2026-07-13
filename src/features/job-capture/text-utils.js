(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JobCaptureText = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sliceByHeadings(text, starts, ends) {
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

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  return { hash, normalizeText, sliceByHeadings };
});
