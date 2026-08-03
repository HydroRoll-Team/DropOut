#!/bin/sh
set -eu

binary_path="${1:-target/x86_64-unknown-linux-musl/release/dropout}"

if [ ! -x "$binary_path" ]; then
  echo "musl binary is missing or not executable: $binary_path" >&2
  exit 1
fi

if ! file_output=$(file "$binary_path" 2>&1); then
  printf '%s\n' "$file_output" >&2
  echo "failed to inspect the musl binary format" >&2
  exit 1
fi
printf '%s\n' "$file_output"
printf '%s\n' "$file_output" | grep -q 'ELF 64-bit'

if ! readelf_output=$(readelf -l "$binary_path" 2>&1); then
  printf '%s\n' "$readelf_output" >&2
  echo "failed to inspect the musl ELF interpreter" >&2
  exit 1
fi
printf '%s\n' "$readelf_output"
printf '%s\n' "$readelf_output" | grep -q '/lib/ld-musl-x86_64.so.1'

if ! ldd_output=$(ldd "$binary_path" 2>&1); then
  printf '%s\n' "$ldd_output" >&2
  echo "failed to inspect musl runtime libraries" >&2
  exit 1
fi
printf '%s\n' "$ldd_output"
if printf '%s\n' "$ldd_output" | grep -q 'not found'; then
  echo "one or more musl runtime libraries are missing" >&2
  exit 1
fi

set +e
timeout 10s dbus-run-session -- xvfb-run -a "$binary_path" >/tmp/dropout-smoke.log 2>&1
smoke_status=$?
set -e

case "$smoke_status" in
  124 | 143) ;;
  *)
    cat /tmp/dropout-smoke.log >&2
    echo "DropOut exited unexpectedly during the musl smoke test (status $smoke_status)" >&2
    exit 1
    ;;
esac

echo "DropOut remained running for the 10-second musl smoke window."
