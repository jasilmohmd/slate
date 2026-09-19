// One-off script: embed the hand-verified reference artifact HTML into
// src/lib/artifact/reference.ts as a template-literal export, escaping
// backslashes/backticks/${ so it round-trips exactly.
import { readFileSync, writeFileSync } from "node:fs";

const srcPath = process.argv[2];
if (!srcPath) {
  throw new Error("usage: node embed-reference-artifact.mjs <path-to-html>");
}

const html = readFileSync(srcPath, "utf8");
const backslashCount = (html.match(/\\/g) || []).length;
const dollarBraceCount = (html.match(/\$\{/g) || []).length;
console.log("backslashes:", backslashCount, "dollar-brace:", dollarBraceCount, "length:", html.length);

const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const header = `// Reference artifact (§6 step 2): hand-verified Band B, class 9,
// parallel/series circuits, satisfying §2/§2a/§2b/§2d in full. Drafted by
// Astra (gpt-6-astra), then repaired (a landscape scene/chrome stretch bug
// in the shared base CSS) and verified in-browser at 360x640, 1024x768 and
// 1920x1080 before being checked in. This is the structural template every
// later generation must match the shape of.
export const REFERENCE_ARTIFACT_HTML = \`${escaped}\`;
`;

writeFileSync("src/lib/artifact/reference.ts", header, "utf8");
console.log("wrote", header.length, "chars to src/lib/artifact/reference.ts");
