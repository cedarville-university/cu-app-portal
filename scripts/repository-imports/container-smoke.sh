#!/bin/sh
set -eu

image="${1:-cu-launch-repository-import-worker:test}"

docker run --rm --network none --entrypoint sh "$image" -eu -c '
  git --version
  root=/tmp/repository-import/container-smoke
  mkdir -p "$root/source"
  cd "$root/source"
  git init -b main
  git config user.name "CU Launch Smoke Test"
  git config user.email "cu-launch-smoke@example.invalid"
  printf "%s\n" "repository import worker" > README.md
  git add README.md
  git commit -m "initial"
  git tag v1.0.0
  git clone --mirror "$root/source" "$root/target.git"
  git --git-dir="$root/target.git" show-ref --verify refs/heads/main
  git --git-dir="$root/target.git" show-ref --verify refs/tags/v1.0.0
'
