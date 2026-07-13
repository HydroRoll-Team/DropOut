import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { version as pkgver } from "../src-tauri/tauri.conf.json";

function getSHA256Sum(filePath: string) {
  const response = execSync(`sha256sum ${filePath}`);
  return response.toString().split(" ")[0];
}

const projectRoot = path.resolve(__dirname, "..");

execSync("mkdir -p release", { stdio: "inherit" });
process.chdir("release");

const basePath = process.cwd();
const homePath = process.env.HOME ?? basePath;
const sshPath = path.resolve(homePath, ".ssh");
if (!existsSync(sshPath)) {
  mkdirSync(sshPath, { recursive: true });
}

const url = "https://github.com/HydroRoll-Team/DropOut";
const x86_64Url = `${url}/releases/download/dropout-v${pkgver}/Dropout_${pkgver}_amd64.deb`;
const aarch64Url = `${url}/releases/download/dropout-v${pkgver}/Dropout_${pkgver}_arm64.deb`;
const PKGBUILD = `\
# Maintainer: HsiangNianian <i@jyunko.cn>
# Contributor: 苏向夜 <fu050409@163.com>
pkgname=dropout-bin
pkgver=${pkgver.replace("-", "_")}
pkgrel=1
pkgdesc="A modern, reproducible, and developer-grade Minecraft launcher"
arch=('x86_64' 'aarch64')
url="${url}"
license=('MIT')
depends=('cairo' 'desktop-file-utils' 'gdk-pixbuf2' 'glib2' 'gtk3' 'hicolor-icon-theme' 'libsoup' 'pango' 'webkit2gtk-4.1')
options=('!strip' '!debug')
install=dropout-bin.install
source_x86_64=("${x86_64Url}")
source_aarch64=("${aarch64Url}")
sha256sums_x86_64=('${getSHA256Sum(path.resolve(projectRoot, "artifacts/deb", `Dropout_${pkgver}_amd64.deb`))}')
sha256sums_aarch64=('${getSHA256Sum(path.resolve(projectRoot, "artifacts/deb", `Dropout_${pkgver}_arm64.deb`))}')
package() {
  # Extract package data
  tar -xvf data.tar.gz -C "\${pkgdir}"
}
`;
console.log(PKGBUILD);
const INSTALL = `\
post_install() {
  gtk-update-icon-cache -q -t -f usr/share/icons/hicolor
  update-desktop-database -q
}

post_upgrade() {
  post_install
}

post_remove() {
  gtk-update-icon-cache -q -t -f usr/share/icons/hicolor
  update-desktop-database -q
}`;
console.log(INSTALL);

// Check if AUR_SSH_KEY environment variable is set
const AUR_SSH_KEY = process.env.AUR_SSH_KEY;
if (!AUR_SSH_KEY) {
  console.error("AUR_SSH_KEY environment variable is not set.");
  process.exit(1);
}

// Remove old SSH key file if it exists
const aurSSHKeyPath = path.resolve(sshPath, "aur");
if (existsSync(aurSSHKeyPath)) {
  unlinkSync(aurSSHKeyPath);
}

// Write new SSH key file
writeFileSync(aurSSHKeyPath, `${AUR_SSH_KEY}\n`);
execSync(`chmod 400 ${aurSSHKeyPath}`);

// Add aur to known hosts
const knownHostsPath = path.resolve(sshPath, "known_hosts");
if (existsSync(knownHostsPath)) {
  const knownHosts = readFileSync(knownHostsPath, {
    encoding: "utf-8",
  });
  if (!knownHosts.includes("aur.archlinux.org")) {
    execSync(
      `ssh-keyscan -v -t "rsa,ecdsa,ed25519" aur.archlinux.org >> ~/.ssh/known_hosts`,
      { stdio: "inherit" },
    );
  }
} else {
  execSync(
    `ssh-keyscan -v -t "rsa,ecdsa,ed25519" aur.archlinux.org > ~/.ssh/known_hosts`,
    { stdio: "inherit" },
  );
}

// Clone AUR repository if not exists
if (!existsSync("aur")) {
  execSync(
    `git -c init.defaultBranch=master -c core.sshCommand="ssh -i ${aurSSHKeyPath}" clone ssh://aur@aur.archlinux.org/dropout-bin.git aur`,
    { stdio: "inherit" },
  );
}
execSync(`git -C aur config core.sshCommand "ssh -i ${aurSSHKeyPath}"`, {
  stdio: "inherit",
});

// Write PKGBUILD and .install files
const pkgbuildPath = path.resolve("aur", "PKGBUILD");
const installPath = path.resolve("aur", "dropout-bin.install");
writeFileSync(pkgbuildPath, PKGBUILD);
writeFileSync(installPath, INSTALL);

// Generate .SRCINFO file
execSync("makepkg --printsrcinfo > .SRCINFO", {
  cwd: "aur",
  stdio: "inherit",
});

// Setup Git repository
execSync("git add PKGBUILD .SRCINFO dropout-bin.install", {
  stdio: "inherit",
  cwd: "aur",
});
execSync(`git -C aur config user.name "HsiangNianian"`, { stdio: "inherit" });
execSync(`git -C aur config user.email "i@jyunko.cn"`, {
  stdio: "inherit",
});

// Test AUR package (skip in CI)
if (!process.env.CI) {
  execSync("makepkg -f", {
    stdio: "inherit",
    cwd: "aur",
  });
}

// Publish to AUR
execSync(`git commit -m "release: release v${pkgver}"`, {
  stdio: "inherit",
  cwd: "aur",
});
execSync(`git push origin master`, {
  stdio: "inherit",
  cwd: "aur",
});
