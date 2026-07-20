export const CLASSIC_RESUME_TEMPLATE = "classic-blue";
export const DEFAULT_RESUME_THEME = "#24548f";

export function normalizeResumeDocument(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    fullName: text(source.fullName),
    politicalStatus: text(source.politicalStatus),
    email: text(source.email),
    birthDate: text(source.birthDate),
    phone: text(source.phone),
    summary: text(source.summary),
    sections: array(source.sections)
      .filter(isObject)
      .map(normalizeSection)
      .filter((section) => section.title),
    pendingConfirmations: array(source.pendingConfirmations)
      .filter(isObject)
      .map((item, index) => ({
        id: text(item.id) || `C${index + 1}`,
        text: text(item.text),
        reason: text(item.reason)
      }))
      .filter((item) => item.text)
  };
}

export function normalizeResumePresentation(value = {}) {
  const presentation = value && typeof value === "object" ? value : {};
  const photo = normalizePhoto(presentation.photo);
  return {
    templateId: CLASSIC_RESUME_TEMPLATE,
    photo,
    showPhoto: Boolean(photo && presentation.showPhoto !== false)
  };
}

export function createResumeSection() {
  return { title: "新建区块", kind: "standard", entries: [createResumeEntry()] };
}

export function createResumeEntry() {
  return { date: "", organization: "", position: "", bullets: [createResumeBullet()] };
}

export function createResumeBullet() {
  return { label: "", text: "" };
}

export function hasResumeContent(resume) {
  return array(resume?.sections).some((section) => array(section.entries).some((entry) => {
    return text(entry.date) || text(entry.organization) || text(entry.position)
      || array(entry.bullets).some((bullet) => text(bullet.label) || text(bullet.text));
  }));
}

function normalizeSection(section = {}) {
  const title = text(section.title);
  return {
    title,
    kind: section.kind === "awards" || inferResumeSectionKind(title) === "awards" ? "awards" : "standard",
    entries: array(section.entries).filter(isObject).map(normalizeEntry)
  };
}

export function inferResumeSectionKind(title) {
  return /荣誉|奖项|获奖/.test(text(title)) ? "awards" : "standard";
}

function normalizeEntry(entry = {}) {
  const bullets = array(entry.bullets)
    .filter((bullet) => bullet && typeof bullet === "object")
    .map((bullet) => ({ label: text(bullet.label), text: text(bullet.text) }));
  return {
    date: text(entry.date),
    organization: text(entry.organization),
    position: text(entry.position),
    bullets
  };
}

function normalizePhoto(value) {
  if (!value || typeof value !== "object") return null;
  const dataUrl = text(value.dataUrl);
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl)) return null;
  return {
    dataUrl,
    fileName: text(value.fileName),
    updatedAt: text(value.updatedAt)
  };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
