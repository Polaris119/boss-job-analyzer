export function groupItemsIntoLines(items) {
  const textItems = items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .map((item) => ({ text: item.str.trim(), x: item.transform?.[4] || 0, y: item.transform?.[5] || 0 }))
    .sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
  const lines = [];

  for (const item of textItems) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").trim())
    .filter(Boolean);
}
