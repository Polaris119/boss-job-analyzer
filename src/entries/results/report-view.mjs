import { node, simpleList } from "../../shared/ui/dom.mjs";

const READINESS = {
  ready: ["可以直接投递", "ready"],
  near_ready: ["准备后更适合投递", "near-ready"],
  stretch: ["挑战型岗位", "stretch"],
  insufficient_information: ["信息不足", "unknown"]
};
const CONFIDENCE = { high: "高", medium: "中等", low: "低" };
const GAP_TYPES = { expression: "表达差距", evidence: "证据差距", skill: "技能差距", experience: "经历差距", information: "信息缺口" };
const ACTION_TIMING = { before_application: "投递前", before_interview: "面试前", long_term: "长期积累" };
const KNOWLEDGE_MODES = { learn: "需要学习", review: "建议复习", practice: "需要实践" };
const QUESTION_TYPES = { evidence: "经历验证", core: "岗位核心", gap: "差距追问", scenario: "情景题", pressure: "压力追问" };

export function renderReport(record, elements) {
  renderModernReport(record, elements);
}

function renderModernReport(record, elements) {
  const { analysis } = record;
  const roleProfile = record.roleProfile || {};
  const preparation = record.preparation || {};
  renderOverview(analysis.readiness, roleProfile, elements["overview-section"]);
  renderStrengths(analysis.strengths, elements["strengths-section"]);
  renderGaps(analysis.gaps, elements["gaps-section"]);
  renderActions(analysis.nextActions, elements["actions-section"]);
  renderKnowledge(analysis.knowledgePoints, elements["knowledge-section"]);
  renderRoadmap("短期学习路线", preparation.shortTermRoadmap || [], elements["short-term-section"]);
  renderRoadmap("长期学习路线", preparation.longTermRoadmap || [], elements["long-term-section"]);
  renderInterview(preparation.interview || {}, elements["interview-section"]);
  setOptionalSection(elements, "short-term-section", Boolean(preparation.shortTermRoadmap?.length));
  setOptionalSection(elements, "long-term-section", Boolean(preparation.longTermRoadmap?.length));
  setOptionalSection(elements, "interview-section", Boolean(preparation.interview?.eligible && preparation.interview?.questions?.length));
}

function renderOverview(readiness, roleProfile, panel) {
  const [label, className] = READINESS[readiness.level] || READINESS.insufficient_information;
  panel.dataset.readiness = readiness.level || "insufficient_information";
  const badge = node("span", `readiness-badge ${className}`, label);
  const headline = node("h2", "verdict", readiness.oneLiner || "暂时无法形成可靠判断");
  const topLine = node("div", "overview-topline");
  topLine.append(badge);
  const meta = node("div", "profile-meta");
  if (roleProfile.specialty) meta.append(labeledMeta("目标岗位", roleProfile.specialty));
  if (roleProfile.seniority && roleProfile.seniority !== "unknown") meta.append(labeledMeta("岗位职级", seniorityLabel(roleProfile.seniority)));
  if (readiness.confidence !== "high") meta.append(labeledMeta("判断置信度", CONFIDENCE[readiness.confidence] || CONFIDENCE.medium));
  if (meta.childElementCount) topLine.append(meta);
  panel.replaceChildren(topLine, headline);
  if (readiness.rationale) panel.append(node("p", "verdict-rationale", readiness.rationale));
  if (roleProfile.hiringIntent) {
    const intent = node("div", "hiring-intent");
    intent.append(node("strong", "", "岗位核心任务"), node("p", "", roleProfile.hiringIntent));
    panel.append(intent);
  }
}

function renderStrengths(items, panel) {
  panel.replaceChildren(sectionTitle("已有优势", "简历中已经能够支撑岗位判断的内容"));
  if (!items.length) return panel.append(emptyState("简历中暂未识别到足够明确的优势证据。"));
  const list = node("div", "insight-list");
  items.forEach((item) => {
    const card = insightCard(item.title, "strength");
    if (item.jobNeed) card.append(detail("岗位需要", item.jobNeed));
    if (item.resumeEvidence.length) card.append(detail("简历证据", item.resumeEvidence.join("；")));
    if (item.impact) card.append(detail("价值", item.impact));
    list.append(card);
  });
  panel.append(list);
}

function renderGaps(items, panel) {
  panel.replaceChildren(sectionTitle("关键差距", "只展示会影响筛选、面试判断或准备行动的真实问题"));
  if (!items.length) return panel.append(emptyState("没有发现会影响当前岗位投递的关键差距，AI 未额外挑刺。", "positive"));
  const list = node("div", "insight-list");
  items.forEach((item) => {
    const card = insightCard(item.title, "gap");
    card.prepend(node("span", "item-label", GAP_TYPES[item.type] || "关键差距"));
    if (item.jobNeed) card.append(detail("岗位需要", item.jobNeed));
    if (item.jdEvidence) card.append(detail("JD 依据", item.jdEvidence));
    if (item.resumeEvidence.length) card.append(detail("简历现状", item.resumeEvidence.join("；")));
    if (item.impact) card.append(detail("影响", item.impact));
    if (item.action) card.append(detail("建议", item.action));
    list.append(card);
  });
  panel.append(list);
}

function renderActions(items, panel) {
  panel.replaceChildren(sectionTitle("接下来要做的事", "按照投递、面试和长期积累的时间顺序准备"));
  if (!items.length) return panel.append(emptyState("当前没有额外准备动作，可以直接进入投递和面试准备。", "positive"));
  const list = node("ol", "action-list");
  items.forEach((item) => {
    const entry = node("li", "action-item");
    entry.append(node("span", "item-label", ACTION_TIMING[item.timing] || "下一步"), node("strong", "", item.title));
    if (item.detail) entry.append(node("p", "", item.detail));
    list.append(entry);
  });
  panel.append(list);
}

function renderKnowledge(items, panel) {
  panel.replaceChildren(sectionTitle("需要学习或复习的知识点", "区分新增学习、面试复习和实践举证"));
  if (!items.length) return panel.append(emptyState("当前没有需要额外补充的知识点。", "positive"));
  const list = node("div", "knowledge-grid");
  items.forEach((item) => {
    const card = node("article", "knowledge-item");
    card.append(node("span", "item-label", KNOWLEDGE_MODES[item.mode] || "知识准备"), node("h3", "", item.topic));
    if (item.reason) card.append(detail("原因", item.reason));
    if (item.currentState) card.append(detail("当前程度", item.currentState));
    if (item.targetDepth) card.append(detail("目标深度", item.targetDepth));
    list.append(card);
  });
  panel.append(list);
}

function renderRoadmap(title, items, panel) {
  panel.replaceChildren(sectionTitle(title, title.startsWith("短期") ? "围绕投递和面试前可以完成的准备" : "需要项目、职责或持续实践才能形成的能力"));
  const timeline = node("div", "roadmap-timeline");
  items.forEach((item, index) => {
    const card = node("article", "roadmap-item");
    const head = node("div", "roadmap-head");
    head.append(node("span", "roadmap-index", String(index + 1)), node("h3", "", item.title || item.objective));
    if (item.duration) head.append(node("span", "duration", item.duration));
    card.append(head);
    if (item.objective) card.append(detail("目标", item.objective));
    if (item.concepts.length) card.append(detail("核心概念", item.concepts.join("；")));
    if (item.practice) card.append(detail("实践任务", item.practice));
    if (item.deliverable) card.append(detail("验收产出", item.deliverable));
    if (item.completionCriteria) card.append(detail("完成标准", item.completionCriteria));
    timeline.append(card);
  });
  panel.append(timeline);
}

function renderInterview(interview, panel) {
  panel.replaceChildren(sectionTitle("针对性面试准备", "问题来自岗位要求与当前简历的交叉点"));
  const list = node("div", "question-list");
  (interview.questions || []).forEach((item, index) => {
    const details = document.createElement("details");
    details.className = "question-item";
    const summary = document.createElement("summary");
    summary.append(node("span", "question-number", `Q${index + 1}`), node("span", "question-type", QUESTION_TYPES[item.type] || "面试题"), node("strong", "", item.question));
    details.append(summary);
    const body = node("div", "question-body");
    if (item.why) body.append(detail("为什么可能会问", item.why));
    if (item.assesses) body.append(detail("主要考察", item.assesses));
    if (item.resumeAnchor) body.append(detail("简历回答锚点", item.resumeAnchor));
    if (item.answerOutline.length) body.append(node("strong", "", "回答组织思路"), simpleList(item.answerOutline));
    if (item.followUps.length) body.append(node("strong", "", "可能追问"), simpleList(item.followUps));
    details.append(body);
    list.append(details);
  });
  panel.append(list);
}

function setOptionalSection(elements, id, visible) {
  elements[id].hidden = !visible;
  const link = document.querySelector(`[data-target="${id}"]`);
  if (link) link.hidden = !visible;
}

function sectionTitle(title, subtitle) {
  const head = node("div", "section-heading");
  head.append(node("h2", "", title));
  if (subtitle) head.append(node("p", "", subtitle));
  return head;
}

function insightCard(title, type) {
  const card = node("article", `insight-item ${type}`);
  card.append(node("h3", "", title));
  return card;
}

function detail(label, value) {
  const row = node("p", "detail-row");
  row.append(node("strong", "", `${label}：`), document.createTextNode(value));
  return row;
}

function emptyState(message, type = "") {
  return node("p", `section-empty ${type}`, message);
}

function seniorityLabel(value) {
  return ({ junior: "初级", mid: "中级", senior: "高级", lead: "负责人" })[value] || value;
}

function labeledMeta(label, value) {
  const item = node("span", "profile-item");
  item.append(node("small", "", label), node("strong", "", value));
  return item;
}
