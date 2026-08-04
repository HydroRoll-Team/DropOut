import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { hasStagedChanges } from "./release-aur-helpers.mjs";

const releaseConfig = parseToml(
  readFileSync(new URL("../.changes/config.toml", import.meta.url), "utf8"),
);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
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

  const releaseGateIndex = aurJob.steps.findIndex(
    ({ id }) => id === "release-check",
  );
  assert.ok(releaseGateIndex > 0, "AUR release gate is missing");
  assert.match(
    aurJob.steps[releaseGateIndex].run ?? "",
    /gh release view "dropout-v\$version"/,
  );
  for (const step of aurJob.steps.slice(releaseGateIndex + 1)) {
    assert.equal(
      step.if,
      "steps.release-check.outputs.published == 'true'",
      `${step.name} must wait for a matching GitHub release`,
    );
  }
});

test("does not run AUR before Semifold creates the GitHub release", () => {
  assert.equal(releaseConfig.resolver.rust.publish, undefined);
});

test("post-version hook synchronizes every generated release manifest", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "dropout-release-manifests-"));
  mkdirSync(join(fixtureRoot, "src-tauri"), { recursive: true });
  mkdirSync(join(fixtureRoot, "packages", "ui"), { recursive: true });
  mkdirSync(join(fixtureRoot, "packages", "docs"), { recursive: true });

  writeFileSync(
    join(fixtureRoot, "src-tauri", "Cargo.toml"),
    '[package]\nname = "dropout"\nversion = "0.2.0-rc.1"\n',
  );
  writeFileSync(
    join(fixtureRoot, "src-tauri", "tauri.conf.json"),
    '{\n  "version": "0.2.0-rc.0"\n}\n',
  );
  writeFileSync(
    join(fixtureRoot, "Cargo.lock"),
    '# generated lockfile fixture\n[[package]]\nversion = "0.2.0-rc.0"\nsource = "registry+https://example.invalid/index"\n# package fields may be reordered\nname = "dropout"\n',
  );
  writeFileSync(
    join(fixtureRoot, "packages", "ui", "package.json"),
    '{\n  "name": "@dropout/ui",\n  "version": "0.1.0-rc.1"\n}',
  );
  writeFileSync(
    join(fixtureRoot, "packages", "docs", "package.json"),
    '{\n  "name": "@dropout/docs",\n  "version": "0.1.0-rc.1"\n}',
  );

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", join(repoRoot, "scripts", "bump-tauri.ts")],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DROPOUT_REPO_ROOT: fixtureRoot },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.match(
    readFileSync(join(fixtureRoot, "Cargo.lock"), "utf8"),
    /version = "0\.2\.0-rc\.1"/,
  );
  assert.equal(
    JSON.parse(
      readFileSync(join(fixtureRoot, "src-tauri", "tauri.conf.json"), "utf8"),
    ).version,
    "0.2.0-rc.1",
  );
  for (const packageName of ["ui", "docs"]) {
    assert.equal(
      readFileSync(
        join(fixtureRoot, "packages", packageName, "package.json"),
        "utf8",
      ).endsWith("\n"),
      true,
      `${packageName} package manifest must end with a newline`,
    );
  }
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

  const linuxSmoke = readFileSync(
    new URL("../scripts/smoke-install-linux.sh", import.meta.url),
    "utf8",
  );
  assert.match(linuxSmoke, /bundle_root\/rpm/);
  assert.match(linuxSmoke, /rpm2cpio/);

  const macSmoke = readFileSync(
    new URL("../scripts/smoke-install-macos.sh", import.meta.url),
    "utf8",
  );
  assert.match(macSmoke, /\.app\.tar\.gz/);
  assert.match(macSmoke, /tar -xzf/);
  assert.match(macSmoke, /dropout-macos-smoke\.XXXXXX/);
  assert.match(macSmoke, /application bundle is missing Info\.plist/);
  assert.match(macSmoke, /application bundle has an invalid Info\.plist/);
  assert.match(macSmoke, /application bundle is missing CFBundleExecutable/);
  assert.match(macSmoke, /is not present or not executable/);

  const windowsSmoke = readFileSync(
    new URL("../scripts/smoke-install-windows.ps1", import.meta.url),
    "utf8",
  );
  assert.match(windowsSmoke, /OpenRead/);
  assert.match(windowsSmoke, /\[byte\[\]\]::new\(2\)/);
  assert.doesNotMatch(windowsSmoke, /ReadAllBytes/);

  const linuxUpload =
    stepByName.get("Upload Artifact (Linux)")?.with?.path ?? "";
  assert.match(linuxUpload, /bundle\/rpm\/\*\.rpm/);
  const windowsUpload =
    stepByName.get("Upload Artifact (Windows)")?.with?.path ?? "";
  assert.doesNotMatch(windowsUpload, /\.msi/);

  const windowsBuilds = releaseWorkflow.jobs[
    "build-tauri"
  ].strategy.matrix.include.filter(({ platform }) =>
    platform.startsWith("windows"),
  );
  assert.equal(windowsBuilds.length, 2);
  assert.equal(
    windowsBuilds.every(({ args }) => args.includes("--bundles nsis")),
    true,
  );
});

test("treats an already-current AUR package as a successful no-op", () => {
  assert.equal(hasStagedChanges(""), false);
  assert.equal(hasStagedChanges("\n"), false);
  assert.equal(hasStagedChanges("PKGBUILD\n.SRCINFO\n"), true);
});
