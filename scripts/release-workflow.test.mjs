import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const releaseConfig = readFileSync(
  new URL("../.changes/config.toml", import.meta.url),
  "utf8",
);
const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/semifold-ci.yaml", import.meta.url),
  "utf8",
);
const aurPublisher = readFileSync(
  new URL("./release-aur.ts", import.meta.url),
  "utf8",
);

test("publishes AUR in a rerunnable job after the GitHub release", () => {
  const releaseJobStart = releaseWorkflow.indexOf("  release:\n");
  const aurJobStart = releaseWorkflow.indexOf("  publish-aur:\n");

  assert.notEqual(releaseJobStart, -1, "release job is missing");
  assert.ok(aurJobStart > releaseJobStart, "AUR job must follow release job");

  const releaseJob = releaseWorkflow.slice(releaseJobStart, aurJobStart);
  const aurJob = releaseWorkflow.slice(aurJobStart);

  assert.doesNotMatch(releaseJob, /makepkg|release-aur\.ts/);
  assert.match(aurJob, /needs: \[release\]/);
  assert.match(
    aurJob,
    /if: github\.event_name == 'push' && github\.ref_name == 'main'/,
  );
  assert.match(aurJob, /actions\/download-artifact@v6/);
  assert.match(aurJob, /tsx scripts\/release-aur\.ts/);
});

test("does not run AUR before Semifold creates the GitHub release", () => {
  assert.doesNotMatch(releaseConfig, /\[\[resolver\.rust\.publish\]\]/);
});

test("treats an already-current AUR package as a successful no-op", () => {
  assert.match(aurPublisher, /git diff --cached --quiet/);
  assert.match(aurPublisher, /AUR package is already up to date/);
});
