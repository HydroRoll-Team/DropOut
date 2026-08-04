import assert from "node:assert/strict";
import test from "node:test";
import { baseGameVersion } from "../../src/lib/version-id";

test("extracts stable and hyphenated Minecraft versions from launcher IDs", () => {
  assert.equal(baseGameVersion("1.21.1"), "1.21.1");
  assert.equal(baseGameVersion("1.20.1-forge-47.1.0"), "1.20.1");
  assert.equal(baseGameVersion("fabric-loader-0.16.14-1.21.1"), "1.21.1");
  assert.equal(
    baseGameVersion("fabric-loader-0.16.14-1.21.2-pre1"),
    "1.21.2-pre1",
  );
});
