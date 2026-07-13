import { requirementStatusLabel } from "../../features/analysis/labels.mjs";
import { node, simpleList } from "../../shared/ui/dom.mjs";

export function renderReport(analysis, elements) {
  renderMatch(analysis, elements["match-section"]);
  renderSuggestions(analysis, elements["suggestion-section"]);
  renderRoadmap(analysis, elements["roadmap-section"]);
}

function renderMatch(analysis, panel) {
  panel.replaceChildren(node("h2", "", "岗位匹配"), node("p", "summary", analysis.jobSummary));
  const list = node("ul", "result-list");
  analysis.requirements.forEach((requirement) => {
    const item = node("li", "result-item");
    item.append(node("strong", "", requirement.requirement));
    if (requirement.rationale) item.append(node("p", "", requirement.rationale));
    if (requirement.evidence.length) item.append(node("p", "", `证据：${requirement.evidence.join("；")}`));
    const meta = node("div", "meta");
    meta.append(node("span", `pill ${requirement.status}`, requirementStatusLabel(requirement.status)));
    meta.append(node("span", "pill", requirement.priority === "must" ? "必须项" : "加分项"));
    item.append(meta);
    list.append(item);
  });
  panel.append(list);
}

function renderSuggestions(analysis, panel) {
  panel.replaceChildren(node("h2", "", "简历优化建议"));
  const list = node("ul", "result-list");
  analysis.suggestions.forEach((suggestion) => {
    const item = node("li", "result-item");
    item.append(node("strong", "", suggestion.title), node("p", "", suggestion.detail));
    if (suggestion.evidence) item.append(node("p", "", `依据：${suggestion.evidence}`));
    list.append(item);
  });
  panel.append(list);
  if (analysis.interviewFocus.length) panel.append(node("h3", "", "面试准备重点"), simpleList(analysis.interviewFocus));
}

function renderRoadmap(analysis, panel) {
  panel.replaceChildren(node("h2", "", "能力缺口与学习路线"));
  if (analysis.skillGaps.length) {
    panel.append(node("h3", "", "能力缺口"));
    const gaps = node("ul", "result-list");
    analysis.skillGaps.forEach((gap) => {
      const item = node("li", "result-item");
      item.append(node("strong", "", gap.skill), node("p", "", gap.reason), node("span", "pill", `优先级：${gap.priority}`));
      gaps.append(item);
    });
    panel.append(gaps);
  }
  panel.append(node("h3", "", "学习阶段"));
  const stages = node("ul", "result-list");
  analysis.roadmap.forEach((stage) => {
    const item = node("li", "result-item");
    item.append(node("strong", "", [stage.stage, stage.duration].filter(Boolean).join(" · ")));
    if (stage.goals.length) item.append(simpleList(stage.goals));
    if (stage.deliverable) item.append(node("p", "", `验收产出：${stage.deliverable}`));
    stages.append(item);
  });
  panel.append(stages);
}
