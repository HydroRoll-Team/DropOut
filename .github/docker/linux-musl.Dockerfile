# syntax=docker/dockerfile:1.7

ARG RUST_IMAGE=rust:1.97-alpine3.22@sha256:df4efa4e0cdfb5245fa06e3f431387b2bcc96782ce5681b7fb6b0297d745bc29
FROM ${RUST_IMAGE} AS build

RUN apk add --no-cache \
      binutils \
      build-base \
      dbus-x11 \
      file \
      git \
      gtk+3.0-dev \
      libayatana-appindicator-dev \
      librsvg-dev \
      nodejs \
      npm \
      openssl-dev \
      pkgconf \
      pnpm \
      tar \
      webkit2gtk-4.1-dev \
      xvfb-run

ENV CI=true \
    CARGO_BUILD_JOBS=1 \
    PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /workspace
COPY . .
RUN mkdir -p /workspace/.cargo \
    && cp .github/docker/linux-musl.cargo.toml /workspace/.cargo/config.toml

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/workspace/target \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile \
    && pnpm -C packages/ui --lockfile-dir /workspace install --frozen-lockfile \
    && pnpm exec tauri build --target x86_64-unknown-linux-musl --no-bundle \
    && scripts/verify-linux-musl.sh target/x86_64-unknown-linux-musl/release/dropout \
    && scripts/package-linux-musl.sh target/x86_64-unknown-linux-musl/release/dropout artifacts

FROM scratch AS artifact
COPY --from=build /workspace/artifacts/ /
