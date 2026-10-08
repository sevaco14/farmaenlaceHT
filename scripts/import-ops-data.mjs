import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOCK = join(ROOT, "data", "mock");

const TABLES = [
  "catalogItems",
  "pharmacyBranches",
  "waDaily",
  "inventoryPositions",
  "promoCalendar",
  "newsItems",
  "opsMeta",
  "waMessages",
];

for (const table of TABLES) {
  const file = join(MOCK, `${table}.jsonl`);
  console.log(`Importing ${table}...`);
  const result = spawnSync(
    "npx",
    ["convex", "import", "--replace", "--yes", "--table", table, file],
    { cwd: ROOT, stdio: "inherit", shell: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Rebuilding insights from imported rows...");
const rebuilt = spawnSync(
  "npx",
  ["convex", "run", "insights:runRebuild", "{replaceRecommendations: true}"],
  { cwd: ROOT, stdio: "inherit", shell: true },
);
if (rebuilt.status !== 0) process.exit(rebuilt.status ?? 1);
