#!/bin/sh
set -eu

binary_path="${1:-target/x86_64-unknown-linux-musl/release/dropout}"
output_dir="${2:-artifacts}"

if [ ! -x "$binary_path" ]; then
  echo "musl binary is missing or not executable: $binary_path" >&2
  exit 1
fi

version=$(node -p "require('./src-tauri/tauri.conf.json').version")
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
install -m 644 packaging/linux-musl/README.md "$package_root/README.md"
install -m 644 packaging/linux-musl/dropout.desktop "$package_root/dropout.desktop"
install -m 644 src-tauri/icons/128x128.png "$package_root/dropout.png"

tar \
  --sort=name \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --mtime="@${SOURCE_DATE_EPOCH:-0}" \
  -C "$staging_root" \
  -czf "$archive_path" \
  "$package_name"

(cd "$output_dir" && sha256sum "${package_name}.tar.gz" >"${package_name}.tar.gz.sha256")
echo "Packaged $archive_path"
