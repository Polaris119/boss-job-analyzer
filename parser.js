(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JobResumeParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanLines(text) {
    return normalizeText(text)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line, index, lines) => index === 0 || line !== lines[index - 1]);
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

  function splitResumeSections(text) {
    const headings = ["个人信息", "个人优势", "求职期望", "工作经历", "项目经历", "教育经历", "资格证书", "专业技能"];
    const lines = cleanLines(text);
    const sections = [];
    let current = { title: "基本信息", lines: [] };

    for (const line of lines) {
      const heading = headings.find((item) => line === item || line.startsWith(`${item} `));
      if (heading) {
        if (current.lines.length) sections.push({ title: current.title, text: current.lines.join("\n") });
        current = { title: heading, lines: line === heading ? [] : [line.slice(heading.length).trim()] };
      } else {
        current.lines.push(line);
      }
    }
    if (current.lines.length) sections.push({ title: current.title, text: current.lines.join("\n") });
    return sections;
  }

  return { normalizeText, cleanLines, sliceByHeadings, splitResumeSections };
});
