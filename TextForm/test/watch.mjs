// npm run test:watch: runs the tests again whenever something they depend on changes, and that
// includes git. A commit is where a golden gets approved, so it's a reason to run again, like
// saving a file is. Watched: src/ and test/, and git's record of HEAD (a commit, checkout, reset).
// The tests write test/golden/ themselves; a change there counts only when it isn't from a run
// (a golden thrown away in git, say).
import { spawn, execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gitLog = join(execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim(), "logs", "HEAD");

let child = null, timer = null, quietUntil = 0;

function run(why) {
  if (child) child.kill();
  console.log(`\n—— ${new Date().toLocaleTimeString()}  ${why} ——`);
  child = spawn(process.execPath, ["--test", "test/*.test.js"], { cwd: root, stdio: "inherit" });
  child.on("exit", () => { child = null; quietUntil = Date.now() + 300; });
}
// changes come in bursts (an editor saving, git writing several files): run once, after the burst
const soon = (why) => { clearTimeout(timer); timer = setTimeout(() => run(why), 150); };

for (const dir of ["src", "test"]) watch(join(root, dir), { recursive: true }, (_, file) => {
  if (!file) return;
  const golden = file.startsWith("golden" + sep);
  if (golden && (child || Date.now() < quietUntil)) return; // written by the run itself
  soon(`${dir}/${file} changed`);
});
watch(gitLog, () => soon("git: HEAD moved (commit, checkout, reset)"));

run("start");
