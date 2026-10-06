# MinIO object storage, built from source.
#
# MinIO stopped publishing community container images in 2025: minio/minio
# on Docker Hub and quay.io/minio/minio no longer resolve, and MinIO's own
# `make docker` starts FROM minio/minio:latest. Their release notes now say to
# build from source, so this does, with the same flags as the upstream
# Makefile's `build` target (CGO off, -tags kqueue, -trimpath, release
# ldflags). MinIO is AGPL-3.0; we run it unmodified.
#
# Each release is pinned by tag AND commit: the build fails if a tag ever
# points somewhere else. To upgrade, set both from
#   gh api 'repos/minio/minio/tags?per_page=5' --jq '.[] | "\(.name) \(.commit.sha)"'
#   gh api 'repos/minio/mc/tags?per_page=5'    --jq '.[] | "\(.name) \(.commit.sha)"'
# and read the release notes first (security releases are titled
# "Security/CVE"). Dependabot can't track these: check monthly.
#
# The image matches the old official one where the stack depends on it:
# `minio` is the entrypoint (compose passes `server /data …`), and `mc` and
# `curl` are installed (backup.sh and the healthcheck use them).

ARG GO_VERSION=1.24

FROM golang:${GO_VERSION}-alpine AS build
RUN apk add --no-cache git
ENV CGO_ENABLED=0 GOFLAGS=-trimpath

# RELEASE.2025-10-15T17-29-55Z: security release (GHSA-jjjj-jwhf-8rgr,
# privilege escalation via session-policy bypass in service accounts / STS).
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
RUN git clone --quiet --depth 1 --branch "$MINIO_RELEASE" https://github.com/minio/minio.git /src/minio \
 && cd /src/minio \
 && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT" \
      || { echo "minio tag $MINIO_RELEASE is not commit $MINIO_COMMIT" >&2; exit 1; } \
 && go build -tags kqueue -ldflags "$(go run buildscripts/gen-ldflags.go)" -o /out/minio . \
 && /out/minio --version

ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096
RUN git clone --quiet --depth 1 --branch "$MC_RELEASE" https://github.com/minio/mc.git /src/mc \
 && cd /src/mc \
 && test "$(git rev-parse HEAD)" = "$MC_COMMIT" \
      || { echo "mc tag $MC_RELEASE is not commit $MC_COMMIT" >&2; exit 1; } \
 && go build -tags kqueue -ldflags "$(go run buildscripts/gen-ldflags.go)" -o /out/mc . \
 && /out/mc --version

FROM alpine:3.22
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
LABEL org.opencontainers.image.title="MinIO (built from source for Vairiot)" \
      org.opencontainers.image.version="${MINIO_RELEASE}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/minio/minio"
RUN apk add --no-cache ca-certificates curl tzdata
COPY --from=build /out/minio /out/mc /usr/bin/
# mc keeps its aliases here; /tmp is writable whatever user runs the container.
ENV MC_CONFIG_DIR=/tmp/.mc
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
