// scripts/refresh_search.mjs
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",          // ✅ 자식 stdout/stderr 그대로 보여줌
      shell: process.platform === "win32", // ✅ Windows 호환
      ...opts,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log("=== MoneyTree: Refresh Search Index ===");

  // [1/2] build
  console.log("\n[1/2] build search index...");
  await run("node", ["scripts/build_search_index.mjs"]);

  // [2/2] copy to public
  console.log("\n[2/2] copy to public for local dev...");

  const src = path.join(ROOT, "import_MT", "data", "search", "search_index.json");
  const destDir = path.join(ROOT, "public", "data", "search");
  const dest = path.join(destDir, "search_index.json");

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(src, dest);

  const stat = await fs.stat(dest);
  console.log(`✅ Copied: public\\data\\search\\search_index.json (${(stat.size / 1024).toFixed(1)} KB)`);
  console.log("✅ Done. Next step: git add/commit/push (import_MT repo) if you want prod.");
}

main().catch((err) => {
  console.error("⨯ refresh:search failed:", err?.message ?? err);
  process.exit(1);
});
