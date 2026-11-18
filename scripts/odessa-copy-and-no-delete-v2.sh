#!/usr/bin/env bash
set -e
task_dir="$(mktemp -d)"
trap 'rm -rf "$task_dir"' EXIT
curl -fL https://raw.githubusercontent.com/dianakhron7-ai/odessa-online/33898c081aaa436d7f2c0dfdf0a3640ecb30e79e/scripts/odessa-copy-delay-fix-v2.cjs -o "$task_dir/copy.cjs"
curl -fL https://raw.githubusercontent.com/dianakhron7-ai/odessa-online/fd8a7d59c33026bd062d5215662388d7cf6e79cb/scripts/odessa-disable-autodelete.cjs -o "$task_dir/no-delete.cjs"
node "$task_dir/copy.cjs"
node "$task_dir/no-delete.cjs"
