const fs = require("fs");
const path = require("path");

console.log("CSS exists:", fs.existsSync("Code/renderer/styles/file-viewer.css"));

const html = fs.readFileSync("Code/renderer/index.html","utf8");
const linkMatch = html.match(/href="(\.\/styles\/file-viewer\.css)"/);
console.log("CSS link in HTML:", linkMatch ? linkMatch[1] : "NOT FOUND");

const tm = fs.readFileSync("Code/renderer/app_manager/toolsManager.js","utf8");
const importMatch = tm.match(/import \* as fileViewer\s+from\s+'([^']+)'/);
console.log("Import path:", importMatch ? importMatch[1] : "NOT FOUND");
if (importMatch) {
  const resolved = path.resolve("Code/renderer/app_manager", importMatch[1]);
  console.log("Resolved:", resolved, "exists:", fs.existsSync(resolved));
}

// Check diff viewer for comparison
console.log("\ndiffViewer.js size:", fs.statSync("Code/renderer/diffViewer.js").size, "bytes");
console.log("fileViewer.js size:", fs.statSync("Code/renderer/fileViewer.js").size, "bytes");
