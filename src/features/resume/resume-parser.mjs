import { cleanLines } from "../../shared/utils/text.mjs";

const RESUME_HEADINGS = [
  "个人信息", "个人优势", "求职期望", "工作经历",
  "项目经历", "教育经历", "资格证书", "专业技能"
];

export function splitResumeSections(text) {
  const lines = cleanLines(text);
  const sections = [];
  let current = { title: "基本信息", lines: [] };

  for (const line of lines) {
    const heading = RESUME_HEADINGS.find((item) => line === item || line.startsWith(`${item} `));
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
