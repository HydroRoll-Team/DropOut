import { spawnSync } from "node:child_process";

const isCi = process.env.CI === "true" || process.env.WORKERS_CI === "1";

if (isCi) {
  console.log("Skipping prek Git hook installation in CI.");
} else {
  const command = process.platform === "win32" ? "prek.cmd" : "prek";
  const result = spawnSync(command, ["install"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}
