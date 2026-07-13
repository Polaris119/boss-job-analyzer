const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

test("all relative JavaScript module references exist", () => {
  const scripts = filesUnder(path.join(root, "src")).filter((file) => /\.(?:js|mjs)$/.test(file));
  for (const file of scripts) {
    const source = fs.readFileSync(file, "utf8");
    const references = [
      ...source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g),
      ...source.matchAll(/\brequire\(["'](\.[^"']+)["']\)/g)
    ].map((match) => match[1]);
    for (const reference of references) {
      const target = path.resolve(path.dirname(file), reference);
      assert.equal(fs.existsSync(target), true, `${path.relative(root, file)} imports missing ${reference}`);
    }
  }
});

test("all shared CSS imports exist", () => {
  const styles = filesUnder(path.join(root, "src")).filter((file) => file.endsWith(".css"));
  for (const file of styles) {
    const source = fs.readFileSync(file, "utf8");
    const references = [...source.matchAll(/@import\s+url\(["']([^"']+)["']\)/g)].map((match) => match[1]);
    for (const reference of references) {
      const target = path.resolve(path.dirname(file), reference);
      assert.equal(fs.existsSync(target), true, `${path.relative(root, file)} imports missing ${reference}`);
    }
  }
});
