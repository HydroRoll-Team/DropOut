import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const auditPath = resolve(repoRoot, "docs/release/rc1-parity.json");

const requiredRows = [
  "ui-onboarding",
  "ui-home-launch",
  "ui-instance-library",
  "ui-instance-creation",
  "ui-content-browsing",
  "ui-downloads",
  "ui-accounts",
  "ui-settings",
  "ui-logs",
  "ui-errors",
  "ui-updates",
  "ui-accessibility",
  "ui-performance",
  "function-authentication",
  "function-java-runtime",
  "function-loaders",
  "function-mods-packs",
  "function-instances",
  "function-repairs",
  "function-exports",
  "function-background-lifecycle",
  "function-assistant",
  "function-conversion",
  "function-platforms",
  "migration-pcl",
  "migration-hmcl",
  "migration-prism-multimc",
  "migration-archives",
  "migration-preview",
  "migration-conflicts",
  "migration-rollback",
  "migration-source-preservation",
  "distribution-installers",
  "distribution-updates",
  "distribution-release-notes",
  "distribution-provenance",
  "distribution-clean-install",
  "docs-install",
  "docs-migration",
  "docs-troubleshooting",
  "docs-features",
  "docs-release",
];

test("RC1 parity audit covers every required row with direct evidence", () => {
  assert.equal(existsSync(auditPath), true, "RC1 parity audit is missing");
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));

  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.release, "0.2.0-rc.1");
  assert.equal(audit.sourceIssue, 178);

  const actualRows = audit.rows.map(({ id }) => id);
  assert.equal(
    new Set(actualRows).size,
    actualRows.length,
    "row IDs must be unique",
  );
  assert.deepEqual([...actualRows].sort(), [...requiredRows].sort());

  for (const row of audit.rows) {
    assert.equal(row.status, "proven", `${row.id} is not proven`);
    assert.ok(row.requirement?.trim(), `${row.id} has no requirement text`);
    assert.ok(
      row.evidence.length >= 2,
      `${row.id} needs at least two evidence links`,
    );

    for (const evidence of row.evidence) {
      assert.ok(evidence.kind, `${row.id} has evidence without a kind`);
      assert.ok(evidence.path, `${row.id} has evidence without a path`);
      assert.ok(
        evidence.detail?.trim(),
        `${row.id} has evidence without a detail`,
      );

      const evidencePath = resolve(repoRoot, evidence.path);
      assert.equal(
        existsSync(evidencePath),
        true,
        `${row.id} points to missing evidence ${evidence.path}`,
      );
      if (evidence.match) {
        assert.ok(
          readFileSync(evidencePath, "utf8").includes(evidence.match),
          `${row.id} cannot find its evidence marker in ${evidence.path}`,
        );
      }
    }
  }
});

test("bilingual documentation rows link both current locales", () => {
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  for (const row of audit.rows.filter(({ id }) => id.startsWith("docs-"))) {
    const locales = new Set(
      row.evidence.map(({ locale }) => locale).filter(Boolean),
    );
    assert.deepEqual(
      [...locales].sort(),
      ["en", "zh"],
      `${row.id} must link English and Chinese evidence`,
    );
  }
});

test("required CI runs the parity evidence contract", () => {
  const prekWorkflow = readFileSync(
    resolve(repoRoot, ".github/workflows/prek.yml"),
    "utf8",
  );
  assert.match(prekWorkflow, /run: pnpm test:parity/);
});
