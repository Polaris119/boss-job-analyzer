import * as pdfjsLib from "./vendor/pdfjs/pdf.mjs";
import { groupItemsIntoLines } from "./pdf-text.mjs";

const extensionRuntime = globalThis.chrome?.runtime;
if (extensionRuntime) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = extensionRuntime.getURL("vendor/pdfjs/pdf.worker.mjs");
}

export async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjsLib.getDocument({ data, disableWorker: !extensionRuntime });
  const pdf = await documentTask.promise;
  const pageCount = pdf.numPages;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = groupItemsIntoLines(content.items);
    if (lines.length) pages.push(lines.join("\n"));
    page.cleanup();
  }
  await documentTask.destroy();

  const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) {
    throw new Error("PDF 中没有提取到足够文字。当前版本暂不支持扫描件，请使用文本型 PDF。");
  }
  return { text, pageCount };
}
