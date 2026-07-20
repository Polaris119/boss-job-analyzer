const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const OUTPUT_WIDTH = 600;
const OUTPUT_HEIGHT = 800;

export async function prepareResumePhoto(file) {
  validatePhoto(file);
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("无法读取这张图片，请更换文件后重试。");
    const crop = centeredCrop(bitmap.width, bitmap.height, OUTPUT_WIDTH / OUTPUT_HEIGHT);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.88),
      fileName: file.name,
      updatedAt: new Date().toISOString()
    };
  } finally {
    bitmap.close?.();
  }
}

export function centeredCrop(width, height, targetRatio = 3 / 4) {
  const ratio = width / height;
  if (ratio > targetRatio) {
    const cropWidth = height * targetRatio;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / targetRatio;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}

function validatePhoto(file) {
  if (!file) throw new Error("请选择证件照文件。");
  const supportedType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  const supportedName = /\.(?:jpe?g|png|webp)$/i.test(file.name || "");
  if (!supportedType && !supportedName) throw new Error("证件照仅支持 JPG、PNG 或 WebP。");
  if (file.size > MAX_PHOTO_SIZE) throw new Error("证件照不能超过 5 MB。");
}
