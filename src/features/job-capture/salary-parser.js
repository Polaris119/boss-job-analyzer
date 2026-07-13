(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JobSalaryParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PRIVATE_GLYPH_PATTERN = /[\uE000-\uF8FF\uFFFD]/;
  const RANGE_PATTERN = /(?:¥|￥)?\s*\d{1,3}(?:\.\d+)?\s*[-–—~至]\s*\d{1,3}(?:\.\d+)?\s*(?:K|k|千|万)(?:\s*[·・]\s*\d{1,2}\s*薪)?/;
  const SINGLE_PATTERN = /(?:¥|￥)?\s*\d{1,3}(?:\.\d+)?\s*(?:K|k|千|万)(?:\s*[·・]\s*\d{1,2}\s*薪)?/;

  function extractReadableSalary(candidates) {
    for (const candidate of candidates) {
      const text = String(candidate || "").replace(/\\u([e-fE-F][0-9a-fA-F]{3})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
      const match = text.match(RANGE_PATTERN) || text.match(SINGLE_PATTERN);
      if (!match || PRIVATE_GLYPH_PATTERN.test(match[0])) continue;
      return normalizeSalary(match[0]);
    }
    return "";
  }

  function normalizeSalary(value) {
    return String(value)
      .replace(/\s+/g, "")
      .replace(/[–—~至]/g, "-")
      .replace(/・/g, "·")
      .replace(/k/g, "K");
  }

  function isReadableSalary(value) {
    return Boolean(value) && !PRIVATE_GLYPH_PATTERN.test(String(value)) && extractReadableSalary([value]) === normalizeSalary(value);
  }

  return { extractReadableSalary, isReadableSalary, normalizeSalary };
});
