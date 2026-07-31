# DropOut for Alpine Linux

This archive contains the native x86_64 musl build of DropOut for Alpine Linux 3.22.

Install the runtime libraries:

```sh
sudo apk add ca-certificates gtk+3.0 libayatana-appindicator librsvg openssl webkit2gtk-4.1
```

Then start the launcher from the extracted directory:

```sh
./dropout
```

To integrate DropOut with your desktop environment, copy `dropout.desktop` to `~/.local/share/applications/`, copy `dropout.png` to `~/.local/share/icons/`, and adjust the `Exec` and `Icon` paths to their absolute locations.

This is a dynamically linked Alpine build. It is not a portable replacement for the glibc AppImage or Debian package.
