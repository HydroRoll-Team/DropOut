import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { hasStagedChanges } from "./release-aur-helpers.mjs";

const releaseConfig = parseToml(
  readFileSync(new URL("../.changes/config.toml", import.meta.url), "utf8"),
);
const releaseWorkflow = yaml.load(
  readFileSync(
    new URL("../.github/workflows/semifold-ci.yaml", import.meta.url),
    "utf8",
  ),
);

test("publishes AUR in a rerunnable job after the GitHub release", () => {
  const releaseJob = releaseWorkflow.jobs.release;
  const aurJob = releaseWorkflow.jobs["publish-aur"];

  assert.ok(releaseJob, "release job is missing");
  assert.ok(aurJob, "AUR job is missing");
  assert.deepEqual(aurJob.needs, ["release"]);
  assert.equal(
    aurJob.if,
    "github.event_name == 'push' && github.ref_name == 'main'",
  );
  assert.equal(
    releaseJob.steps.some(
      ({ name, run }) =>
        name === "Install Makepkg" || run?.includes("release-aur.ts"),
    ),
    false,
  );
  assert.equal(
    aurJob.steps.some(({ uses }) => uses === "actions/download-artifact@v6"),
    true,
  );
  assert.equal(
    aurJob.steps.some(({ run }) => run?.includes("tsx scripts/release-aur.ts")),
    true,
  );
});

test("does not run AUR before Semifold creates the GitHub release", () => {
  assert.equal(releaseConfig.resolver.rust.publish, undefined);
});

test("smoke tests every packaged desktop artifact in an isolated install", () => {
  const buildSteps = releaseWorkflow.jobs["build-tauri"].steps;
  const stepByName = new Map(buildSteps.map((step) => [step.name, step]));

  assert.match(
    stepByName.get("Smoke isolated install (Linux)")?.run ?? "",
    /smoke-install-linux\.sh/,
  );
  assert.match(
    stepByName.get("Smoke isolated install (macOS)")?.run ?? "",
    /smoke-install-macos\.sh/,
  );
  assert.match(
    stepByName.get("Smoke isolated install (Windows)")?.run ?? "",
    /smoke-install-windows\.ps1/,
  );

  const uploadIndexes = buildSteps
    .map((step, index) =>
      step.name?.startsWith("Upload Artifact") ? index : -1,
    )
    .filter((index) => index >= 0);
  const smokeIndexes = buildSteps
    .map((step, index) =>
      step.name?.startsWith("Smoke isolated install") ? index : -1,
    )
    .filter((index) => index >= 0);

  assert.equal(smokeIndexes.length, 3);
  assert.ok(
    Math.max(...smokeIndexes) < Math.min(...uploadIndexes),
    "all isolated-install smoke checks must run before artifacts are uploaded",
  );
});

test("treats an already-current AUR package as a successful no-op", () => {
  assert.equal(hasStagedChanges(""), false);
  assert.equal(hasStagedChanges("\n"), false);
  assert.equal(hasStagedChanges("PKGBUILD\n.SRCINFO\n"), true);
});
