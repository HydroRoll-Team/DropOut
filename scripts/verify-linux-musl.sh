#!/bin/sh
set -eu

binary_path="${1:-target/x86_64-unknown-linux-musl/release/dropout}"

if [ ! -x "$binary_path" ]; then
  echo "musl binary is missing or not executable: $binary_path" >&2
  exit 1
fi

file "$binary_path" | tee /tmp/dropout-file.txt
grep -q 'ELF 64-bit' /tmp/dropout-file.txt

readelf -l "$binary_path" | tee /tmp/dropout-readelf.txt
grep -q '/lib/ld-musl-x86_64.so.1' /tmp/dropout-readelf.txt

ldd "$binary_path" | tee /tmp/dropout-ldd.txt
if grep -q 'not found' /tmp/dropout-ldd.txt; then
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
