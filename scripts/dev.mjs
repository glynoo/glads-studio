import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python =
  process.env.GLADS_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const webPort = process.env.GLADS_WEB_PORT || "5173";
const children = [
  spawn(python, ["server/app.py"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    process.execPath,
    [
      resolve(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      webPort,
      "--strictPort",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  ),
];
let ending = false;
function stop(code = 0) {
  if (ending) return;
  ending = true;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("exit", (code) => stop(code || 0));
  child.on("error", (error) => {
    console.error(`Unable to start local service: ${error.message}`);
    stop(1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
