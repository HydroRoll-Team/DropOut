#!/bin/sh
set -eu

target=${1:?usage: smoke-install-linux.sh <rust-target>}
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bundle_root="$repo_root/target/$target/release/bundle"

appimage=$(find "$bundle_root/appimage" -maxdepth 1 -type f -name '*.AppImage' -print -quit)
deb=$(find "$bundle_root/deb" -maxdepth 1 -type f -name '*.deb' -print -quit)
rpm=$(find "$bundle_root/rpm" -maxdepth 1 -type f -name '*.rpm' -print -quit)

if [ -z "$appimage" ] || [ -z "$deb" ] || [ -z "$rpm" ]; then
  echo "expected AppImage, Debian, and RPM artifacts under $bundle_root" >&2
  exit 1
fi

smoke_root=$(mktemp -d)
cleanup() {
  rm -rf "$smoke_root"
}
trap cleanup EXIT HUP INT TERM

appimage_root="$smoke_root/appimage"
mkdir -p "$appimage_root"
chmod +x "$appimage"
(
  cd "$appimage_root"
  "$appimage" --appimage-extract >/dev/null
)

test -x "$appimage_root/squashfs-root/AppRun"
find "$appimage_root/squashfs-root" -type f -name '*.desktop' -print -quit | grep -q .

deb_root="$smoke_root/debian"
mkdir -p "$deb_root"
dpkg-deb --extract "$deb" "$deb_root"
find "$deb_root/usr/bin" -maxdepth 1 -type f -perm -u+x -print -quit | grep -q .
find "$deb_root/usr/share/applications" -type f -name '*.desktop' -print -quit | grep -q .

rpm_root="$smoke_root/rpm"
mkdir -p "$rpm_root"
(
  cd "$rpm_root"
  rpm2cpio "$rpm" | cpio -idm --quiet
)
find "$rpm_root/usr/bin" -maxdepth 1 -type f -perm -u+x -print -quit | grep -q .
find "$rpm_root/usr/share/applications" -type f -name '*.desktop' -print -quit | grep -q .

echo "Verified isolated Linux installs for $target"
