#!/bin/sh
set -eu

target=${1:?usage: smoke-install-macos.sh <rust-target>}
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bundle_root="$repo_root/target/$target/release/bundle"
dmg=$(find "$bundle_root/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)
app_archive=$(find "$bundle_root/macos" -maxdepth 1 -type f -name '*.app.tar.gz' -print -quit)

if [ -z "$dmg" ] || [ -z "$app_archive" ]; then
  echo "expected macOS disk image and application archive under $bundle_root" >&2
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

verify_app_bundle() {
  verified_app=$1
  verified_plist="$verified_app/Contents/Info.plist"

  if [ ! -f "$verified_plist" ]; then
    echo "application bundle is missing Info.plist" >&2
    exit 1
  fi

  if ! plutil -lint "$verified_plist" >/dev/null; then
    echo "application bundle has an invalid Info.plist" >&2
    exit 1
  fi

  if ! verified_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$verified_plist" 2>/dev/null); then
    echo "application bundle is missing CFBundleExecutable" >&2
    exit 1
  fi
  if [ -z "$verified_executable" ]; then
    echo "application bundle is missing CFBundleExecutable" >&2
    exit 1
  fi

  verified_binary="$verified_app/Contents/MacOS/$verified_executable"
  if [ ! -x "$verified_binary" ]; then
    echo "application bundle CFBundleExecutable '$verified_executable' is not present or not executable" >&2
    exit 1
  fi

  file "$verified_binary" | grep -q 'Mach-O'
  otool -L "$verified_binary" >/dev/null
}

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
verify_app_bundle "$installed_app"

archive_root="$smoke_root/archive"
mkdir -p "$archive_root"
tar -xzf "$app_archive" -C "$archive_root"
archive_app=$(find "$archive_root" -maxdepth 2 -type d -name '*.app' -print -quit)
if [ -z "$archive_app" ]; then
  echo "application archive does not contain an application bundle" >&2
  exit 1
fi
verify_app_bundle "$archive_app"

echo "Verified isolated macOS install for $target"
