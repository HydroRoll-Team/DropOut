import fs from "node:fs";
import path from "node:path";
import consola from "consola";
import toml from "toml";

const tauriJsonPath = path.join(
  __dirname,
  "..",
  "src-tauri",
  "tauri.conf.json",
);
consola.debug("tauriJsonPath:", tauriJsonPath);
const tauriTomlPath = path.join(__dirname, "..", "src-tauri", "Cargo.toml");
consola.debug("tauriTomlPath:", tauriTomlPath);

const getCurrentVersion = () => {
  const tauriJsonData = fs.readFileSync(tauriJsonPath, "utf8");
  const tauriJson = JSON.parse(tauriJsonData);
  const version = tauriJson.version;
  if (!version) throw new Error("Version field not found in tauri.conf.json");
  return version;
};

const getBumpVersion = () => {
  const tauriTomlData = fs.readFileSync(tauriTomlPath, "utf8");
  const tauriToml = toml.parse(tauriTomlData);
  const version = tauriToml.package.version;
  if (!version) throw new Error("Version field not found in Cargo.toml");
  return version;
};

const replaceVersion = (content: string, version: string) => {
  const newJson = content.replace(
    /"version": "[^"]+"/,
    `"version": "${version}"`,
  );
  return newJson;
};

const tauriJsonData = fs.readFileSync(tauriJsonPath, "utf8");
const currentVersion = getCurrentVersion();
const bumpVersion = getBumpVersion();
consola.debug("currentVersion:", currentVersion);
consola.debug("bumpVersion:", bumpVersion);

if (currentVersion !== bumpVersion) {
  const replacedData = replaceVersion(tauriJsonData, bumpVersion);
  consola.info(`Bumped version from ${currentVersion} to ${bumpVersion}`);
  fs.writeFileSync(tauriJsonPath, replacedData);
} else {
  consola.info(`Version ${currentVersion} is already up-to-date`);
}
