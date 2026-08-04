import fs from "node:fs";
import path from "node:path";
import consola from "consola";
import toml from "toml";

const repoRoot = process.env.DROPOUT_REPO_ROOT ?? path.join(__dirname, "..");
const tauriJsonPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
consola.debug("tauriJsonPath:", tauriJsonPath);
const tauriTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
consola.debug("tauriTomlPath:", tauriTomlPath);
const cargoLockPath = path.join(repoRoot, "Cargo.lock");
const packageJsonPaths = [
  path.join(repoRoot, "packages", "ui", "package.json"),
  path.join(repoRoot, "packages", "docs", "package.json"),
];

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

const replaceLockedVersion = (content: string, version: string) => {
  const packagePattern =
    /(\[\[package\]\]\r?\nname = "dropout"\r?\nversion = ")[^"]+("\r?\n)/;
  if (!packagePattern.test(content)) {
    throw new Error("DropOut package entry not found in Cargo.lock");
  }
  return content.replace(packagePattern, `$1${version}$2`);
};

const writeIfChanged = (filePath: string, previous: string, next: string) => {
  if (previous !== next) {
    fs.writeFileSync(filePath, next);
  }
};

const tauriJsonData = fs.readFileSync(tauriJsonPath, "utf8");
const currentVersion = getCurrentVersion();
const bumpVersion = getBumpVersion();
consola.debug("currentVersion:", currentVersion);
consola.debug("bumpVersion:", bumpVersion);

if (currentVersion !== bumpVersion) {
  const replacedData = replaceVersion(tauriJsonData, bumpVersion);
  consola.info(`Bumped version from ${currentVersion} to ${bumpVersion}`);
  writeIfChanged(tauriJsonPath, tauriJsonData, replacedData);
} else {
  consola.info(`Version ${currentVersion} is already up-to-date`);
}

const cargoLockData = fs.readFileSync(cargoLockPath, "utf8");
const synchronizedLock = replaceLockedVersion(cargoLockData, bumpVersion);
writeIfChanged(cargoLockPath, cargoLockData, synchronizedLock);

for (const packageJsonPath of packageJsonPaths) {
  const packageJson = fs.readFileSync(packageJsonPath, "utf8");
  const normalizedPackageJson = packageJson.endsWith("\n")
    ? packageJson
    : `${packageJson}\n`;
  writeIfChanged(packageJsonPath, packageJson, normalizedPackageJson);
}
