#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dockerfile="$repo_root/.github/docker/linux-musl.Dockerfile"
musl_cargo_config="$repo_root/.github/docker/linux-musl.cargo.toml"

if grep -qx 'Cargo.lock' "$repo_root/.dockerignore"; then
  echo "Cargo.lock must be included in reproducible musl builds" >&2
  exit 1
fi
if ! git -C "$repo_root" ls-files --error-unmatch Cargo.lock >/dev/null 2>&1; then
  echo "Cargo.lock must be tracked for reproducible musl builds" >&2
  exit 1
fi

grep -q 'AS verify-runtime' "$dockerfile"
grep -q 'verify-linux-musl-package.sh /artifacts' "$dockerfile"
grep -q 'COPY --from=verify-runtime /artifacts/ /' "$dockerfile"
grep -q '^TS_RS_EXPORT_DIR = ' "$musl_cargo_config"
grep -q '^TS_RS_LARGE_INT = "number"$' "$musl_cargo_config"

cargo_version=$(awk '
  /^\[package\]$/ { in_package = 1; next }
  in_package && /^version = / { gsub(/version = |"/, ""); print; exit }
' "$repo_root/src-tauri/Cargo.toml")
lock_version=$(awk '
  $0 == "name = \"dropout\"" { found_package = 1; next }
  found_package && /^version = / { gsub(/version = |"/, ""); print; exit }
' "$repo_root/Cargo.lock")
tauri_version=$(node -p "require(process.argv[1]).version" "$repo_root/src-tauri/tauri.conf.json")
if [ "$cargo_version" != "$lock_version" ] || [ "$cargo_version" != "$tauri_version" ]; then
  echo "release versions disagree: Cargo.toml=$cargo_version Cargo.lock=$lock_version tauri.conf.json=$tauri_version" >&2
  exit 1
fi

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

symlink_fixture="$fixture_root/symlink-fixture"
symlink_package_root="$symlink_fixture/$package_name"
symlink_artifacts="$symlink_fixture/artifacts"
mkdir -p "$symlink_package_root" "$symlink_artifacts"
printf '#!/bin/sh\nexit 0\n' >"$symlink_package_root/payload"
chmod +x "$symlink_package_root/payload"
ln -s payload "$symlink_package_root/dropout"
printf 'fixture readme\n' >"$symlink_package_root/README.md"
printf '[Desktop Entry]\nName=DropOut\n' >"$symlink_package_root/dropout.desktop"
printf 'fixture icon\n' >"$symlink_package_root/dropout.png"
tar -czf "$symlink_artifacts/$package_name.tar.gz" -C "$symlink_fixture" "$package_name"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$symlink_artifacts" && sha256sum "$package_name.tar.gz" >"$package_name.tar.gz.sha256")
else
  (cd "$symlink_artifacts" && shasum -a 256 "$package_name.tar.gz" >"$package_name.tar.gz.sha256")
fi
if "$repo_root/scripts/verify-linux-musl-package.sh" "$symlink_artifacts" archive-only >/dev/null 2>&1; then
  echo "musl archives containing symlinks must fail verification" >&2
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
