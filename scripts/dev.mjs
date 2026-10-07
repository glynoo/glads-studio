import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = process.env.GLADS_PYTHON || "python3";
const children = [
  spawn(python, ["server/app.py"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  }),
  spawn(resolve(root, "node_modules/.bin/vite"), ["--host", "127.0.0.1"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  }),
];
let ending = false;
function stop(code = 0) {
  if (ending) return;
  ending = true;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) child.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
