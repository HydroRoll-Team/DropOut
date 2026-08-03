#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dockerfile="$repo_root/.github/docker/linux-musl.Dockerfile"

if grep -qx 'Cargo.lock' "$repo_root/.dockerignore"; then
  echo "Cargo.lock must be included in reproducible musl builds" >&2
  exit 1
fi

grep -q 'AS verify-runtime' "$dockerfile"
grep -q 'verify-linux-musl-package.sh /artifacts' "$dockerfile"
grep -q 'COPY --from=verify-runtime /artifacts/ /' "$dockerfile"

fixture_root=$(mktemp -d)
cleanup() {
  rm -rf "$fixture_root"
}
trap cleanup EXIT HUP INT TERM

package_name='Dropout_0.0.0_linux_x86_64-musl'
package_root="$fixture_root/$package_name"
artifact_dir="$fixture_root/artifacts"
mkdir -p "$package_root" "$artifact_dir"

printf '#!/bin/sh\nexit 0\n' >"$package_root/dropout"
chmod +x "$package_root/dropout"
printf 'fixture readme\n' >"$package_root/README.md"
printf '[Desktop Entry]\nName=DropOut\n' >"$package_root/dropout.desktop"
printf 'fixture icon\n' >"$package_root/dropout.png"

archive="$artifact_dir/$package_name.tar.gz"
tar -czf "$archive" -C "$fixture_root" "$package_name"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$artifact_dir" && sha256sum "$package_name.tar.gz" >"$package_name.tar.gz.sha256")
else
  (cd "$artifact_dir" && shasum -a 256 "$package_name.tar.gz" >"$package_name.tar.gz.sha256")
fi

"$repo_root/scripts/verify-linux-musl-package.sh" "$artifact_dir" archive-only

printf 'corrupt\n' >>"$archive"
if "$repo_root/scripts/verify-linux-musl-package.sh" "$artifact_dir" archive-only >/dev/null 2>&1; then
  echo "corrupted musl archives must fail verification" >&2
  exit 1
fi

mock_bin="$fixture_root/mock-bin"
mkdir -p "$mock_bin"
printf '#!/bin/sh\nprintf "ELF 64-bit fixture\\n"\nexit 7\n' >"$mock_bin/file"
printf '#!/bin/sh\nprintf "interpreter /lib/ld-musl-x86_64.so.1\\n"\n' >"$mock_bin/readelf"
printf '#!/bin/sh\nprintf "libfixture.so => /lib/libfixture.so\\n"\n' >"$mock_bin/ldd"
printf '#!/bin/sh\nexit 124\n' >"$mock_bin/timeout"
chmod +x "$mock_bin/file" "$mock_bin/readelf" "$mock_bin/ldd" "$mock_bin/timeout"

fake_binary="$fixture_root/fake-dropout"
printf '#!/bin/sh\nexit 0\n' >"$fake_binary"
chmod +x "$fake_binary"
if PATH="$mock_bin:$PATH" "$repo_root/scripts/verify-linux-musl.sh" "$fake_binary" >/dev/null 2>&1; then
  echo "musl verification must preserve failed inspection commands" >&2
  exit 1
fi

printf '%s\n' \
  '#!/bin/sh' \
  'archive_path=' \
  'while [ "$#" -gt 0 ]; do' \
  '  if [ "$1" = "-czf" ]; then' \
  '    shift' \
  '    archive_path=$1' \
  '  fi' \
  '  shift' \
  'done' \
  '[ -n "$archive_path" ]' \
  ': >"$archive_path"' >"$mock_bin/tar"
printf '#!/bin/sh\nprintf "%%064d  %%s\\n" 0 "$1"\n' >"$mock_bin/sha256sum"
chmod +x "$mock_bin/tar" "$mock_bin/sha256sum"

portable_artifacts="$fixture_root/portable-artifacts"
if ! (cd "$fixture_root" && PATH="$mock_bin:$PATH" "$repo_root/scripts/package-linux-musl.sh" "$fake_binary" "$portable_artifacts"); then
  echo "musl packaging must resolve repository assets outside the checkout directory" >&2
  exit 1
fi
set -- "$portable_artifacts"/Dropout_*_linux_x86_64-musl.tar.gz
test "$#" -eq 1
test -f "$1"
test -f "$1.sha256"

echo "musl release contract passed"
