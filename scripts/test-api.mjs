import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const python =
  process.env.GLADS_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "server", "-p", "test_*.py"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
    env: process.env,
  },
);
if (result.error)
  console.error(`Unable to run API tests: ${result.error.message}`);
process.exitCode = result.status ?? 1;
