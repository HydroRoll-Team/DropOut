#!/bin/sh
set -eu

binary_path="${1:-target/x86_64-unknown-linux-musl/release/dropout}"
output_dir="${2:-artifacts}"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)

if [ ! -x "$binary_path" ]; then
  echo "musl binary is missing or not executable: $binary_path" >&2
  exit 1
fi

tauri_conf="$repo_root/src-tauri/tauri.conf.json"
if ! command -v node >/dev/null 2>&1; then
  echo "node is required to read $tauri_conf" >&2
  exit 1
fi
version=$(node -p "require(process.argv[1]).version" "$tauri_conf")
package_name="Dropout_${version}_linux_x86_64-musl"
archive_path="$output_dir/${package_name}.tar.gz"
staging_root=$(mktemp -d)

cleanup() {
  rm -rf "$staging_root"
}
trap cleanup EXIT HUP INT TERM

package_root="$staging_root/$package_name"
mkdir -p "$package_root" "$output_dir"

install -m 755 "$binary_path" "$package_root/dropout"
install -m 644 "$repo_root/packaging/linux-musl/README.md" "$package_root/README.md"
install -m 644 "$repo_root/packaging/linux-musl/dropout.desktop" "$package_root/dropout.desktop"
install -m 644 "$repo_root/src-tauri/icons/128x128.png" "$package_root/dropout.png"

tar \
  --sort=name \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --mtime="@${SOURCE_DATE_EPOCH:-0}" \
  -C "$staging_root" \
  -czf "$archive_path" \
  "$package_name"

(
  cd "$output_dir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${package_name}.tar.gz" >"${package_name}.tar.gz.sha256"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${package_name}.tar.gz" >"${package_name}.tar.gz.sha256"
  else
    echo "sha256sum or shasum is required to checksum the musl archive" >&2
    exit 1
  fi
)
echo "Packaged $archive_path"
