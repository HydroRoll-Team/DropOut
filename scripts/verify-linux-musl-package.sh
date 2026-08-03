#!/bin/sh
set -eu

artifact_dir="${1:-artifacts}"
mode="${2:-full}"

set -- "$artifact_dir"/Dropout_*_linux_x86_64-musl.tar.gz
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo "expected exactly one musl archive in $artifact_dir" >&2
  exit 1
fi

archive=$1
checksum="$archive.sha256"
if [ ! -f "$checksum" ]; then
  echo "musl checksum is missing: $checksum" >&2
  exit 1
fi

archive_dir=$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd)
archive_name=$(basename -- "$archive")
checksum_name=$(basename -- "$checksum")
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$archive_dir" && sha256sum -c "$checksum_name")
else
  expected=$(awk 'NR == 1 { print $1 }' "$checksum")
  actual=$(shasum -a 256 "$archive" | awk '{ print $1 }')
  if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then
    echo "$archive_name: checksum mismatch" >&2
    exit 1
  fi
  echo "$archive_name: OK"
fi

if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "musl archive contains an unsafe path" >&2
  exit 1
fi

staging_root=$(mktemp -d)
cleanup() {
  rm -rf "$staging_root"
}
trap cleanup EXIT HUP INT TERM

tar -xzf "$archive" -C "$staging_root"
set -- "$staging_root"/Dropout_*_linux_x86_64-musl
if [ "$#" -ne 1 ] || [ ! -d "$1" ]; then
  echo "musl archive must contain exactly one package directory" >&2
  exit 1
fi

package_root=$1
for required_path in dropout README.md dropout.desktop dropout.png; do
  if [ ! -f "$package_root/$required_path" ]; then
    echo "musl archive is missing $required_path" >&2
    exit 1
  fi
done
if [ ! -x "$package_root/dropout" ]; then
  echo "packaged musl binary is not executable" >&2
  exit 1
fi

case "$mode" in
  archive-only) ;;
  full)
    script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
    "$script_dir/verify-linux-musl.sh" "$package_root/dropout"
    ;;
  *)
    echo "unknown musl verification mode: $mode" >&2
    exit 1
    ;;
esac

echo "Verified packaged musl release: $archive_name"
