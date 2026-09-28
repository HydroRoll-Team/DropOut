import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes } from "../../src/lib/format-bytes";

test("formats migration byte counts without losing integer precision", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1_023), "1023 B");
  assert.equal(formatBytes(1_536), "2 KB");
  assert.equal(formatBytes(1_572_864), "1.5 MB");
  assert.equal(formatBytes(Number.MAX_SAFE_INTEGER), "8192.0 TB");
});
