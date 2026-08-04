#!/bin/sh
set -eu

target=${1:?usage: smoke-install-macos.sh <rust-target>}
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bundle_root="$repo_root/target/$target/release/bundle"
dmg=$(find "$bundle_root/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)

if [ -z "$dmg" ]; then
  echo "expected a macOS disk image under $bundle_root" >&2
  exit 1
fi

smoke_root=$(mktemp -d)
mount_root="$smoke_root/mount"
install_root="$smoke_root/install"
attached=false
cleanup() {
  if [ "$attached" = true ]; then
    hdiutil detach "$mount_root" -quiet || true
  fi
  rm -rf "$smoke_root"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$mount_root" "$install_root"
hdiutil attach -readonly -nobrowse -mountpoint "$mount_root" "$dmg" >/dev/null
attached=true

source_app=$(find "$mount_root" -maxdepth 1 -type d -name '*.app' -print -quit)
if [ -z "$source_app" ]; then
  echo "disk image does not contain an application bundle" >&2
  exit 1
fi

cp -R "$source_app" "$install_root/"
installed_app="$install_root/$(basename "$source_app")"
info_plist="$installed_app/Contents/Info.plist"

if [ ! -f "$info_plist" ]; then
  echo "application bundle is missing Info.plist" >&2
  exit 1
fi

if ! plutil -lint "$info_plist" >/dev/null; then
  echo "application bundle has an invalid Info.plist" >&2
  exit 1
fi

if ! executable_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$info_plist" 2>/dev/null); then
  echo "application bundle is missing CFBundleExecutable" >&2
  exit 1
fi
if [ -z "$executable_name" ]; then
  echo "application bundle is missing CFBundleExecutable" >&2
  exit 1
fi

installed_binary="$installed_app/Contents/MacOS/$executable_name"

if [ ! -x "$installed_binary" ]; then
  echo "application bundle CFBundleExecutable '$executable_name' is not present or not executable" >&2
  exit 1
fi

file "$installed_binary" | grep -q 'Mach-O'
otool -L "$installed_binary" >/dev/null

echo "Verified isolated macOS install for $target"
