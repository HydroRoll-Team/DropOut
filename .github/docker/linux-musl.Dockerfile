# syntax=docker/dockerfile:1.7

ARG RUST_IMAGE=rust:1.97-alpine3.22@sha256:df4efa4e0cdfb5245fa06e3f431387b2bcc96782ce5681b7fb6b0297d745bc29
ARG ALPINE_RUNTIME_IMAGE=alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
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
    && scripts/package-linux-musl.sh target/x86_64-unknown-linux-musl/release/dropout artifacts

FROM ${ALPINE_RUNTIME_IMAGE} AS verify-runtime

RUN apk add --no-cache \
      ca-certificates \
      gtk+3.0 \
      libayatana-appindicator \
      librsvg \
      openssl \
      webkit2gtk-4.1 \
    && apk add --no-cache --virtual .dropout-smoke-deps \
      binutils \
      dbus-x11 \
      file \
      musl-utils \
      xvfb-run

COPY --from=build /workspace/artifacts/ /artifacts/
COPY scripts/verify-linux-musl.sh scripts/verify-linux-musl-package.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/verify-linux-musl.sh /usr/local/bin/verify-linux-musl-package.sh \
    && verify-linux-musl-package.sh /artifacts

FROM scratch AS artifact
COPY --from=verify-runtime /artifacts/ /
