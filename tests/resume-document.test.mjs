import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASSIC_RESUME_TEMPLATE,
  hasResumeContent,
  normalizeResumeDocument,
  normalizeResumePresentation
} from "../src/features/resume/resume-document.mjs";
import { centeredCrop } from "../src/features/resume/photo-processor.mjs";

test("resume document only accepts the new structured entry format", () => {
  const resume = normalizeResumeDocument({
    fullName: "张三",
    sections: [{ title: "项目经历", items: ["旧版简历内容"] }]
  });
  assert.deepEqual(resume.sections[0].entries, []);
  assert.equal(hasResumeContent(resume), false);
});

test("honor sections use the dedicated awards layout", () => {
  const resume = normalizeResumeDocument({
    sections: [{ title: "荣誉奖项", entries: [{ date: "2024.07", organization: "全国创新竞赛一等奖", bullets: [] }] }]
  });
  assert.equal(resume.sections[0].kind, "awards");
  assert.equal(resume.sections[0].entries[0].organization, "全国创新竞赛一等奖");
});

test("resume photo presentation only accepts local image data and hides missing photos", () => {
  assert.deepEqual(normalizeResumePresentation(null), {
    templateId: CLASSIC_RESUME_TEMPLATE,
    photo: null,
    showPhoto: false
  });
  const empty = normalizeResumePresentation({ showPhoto: true, photo: { dataUrl: "https://example.com/photo.jpg" } });
  assert.equal(empty.templateId, CLASSIC_RESUME_TEMPLATE);
  assert.equal(empty.photo, null);
  assert.equal(empty.showPhoto, false);

  const withPhoto = normalizeResumePresentation({ showPhoto: true, photo: { dataUrl: "data:image/jpeg;base64,AAAA", fileName: "me.jpg" } });
  assert.equal(withPhoto.photo.fileName, "me.jpg");
  assert.equal(withPhoto.showPhoto, true);
});

test("photo processing calculates a centered 3:4 crop", () => {
  assert.deepEqual(centeredCrop(1200, 800), { x: 300, y: 0, width: 600, height: 800 });
  assert.deepEqual(centeredCrop(600, 1200), { x: 0, y: 200, width: 600, height: 800 });
});
