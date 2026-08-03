import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes } from "../../src/lib/format-bytes";

test("formats migration byte counts without leaving bigint arithmetic", () => {
  assert.equal(formatBytes(0n), "0 B");
  assert.equal(formatBytes(1_023n), "1023 B");
  assert.equal(formatBytes(1_536n), "2 KB");
  assert.equal(formatBytes(1_572_864n), "1.5 MB");
  assert.equal(formatBytes(18_446_744_073_709_551_615n), "16777216.0 TB");
});
