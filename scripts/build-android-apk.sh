#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

if [[ -z "$android_sdk" || ! -d "$android_sdk/build-tools" ]]; then
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT to an Android SDK installation." >&2
  exit 1
fi

: "${ROOSTERPLAN_KEYSTORE_PATH:?Set ROOSTERPLAN_KEYSTORE_PATH to the private release keystore.}"
: "${ROOSTERPLAN_KEYSTORE_PASSWORD:?Set ROOSTERPLAN_KEYSTORE_PASSWORD in your shell environment.}"
: "${ROOSTERPLAN_KEY_PASSWORD:?Set ROOSTERPLAN_KEY_PASSWORD in your shell environment.}"
key_alias="${ROOSTERPLAN_KEY_ALIAS:-roosterplan}"

apksigner="$(find "$android_sdk/build-tools" -mindepth 2 -maxdepth 2 -type f -name apksigner -print | sort -V | tail -n 1)"
if [[ -z "$apksigner" ]]; then
  echo "Android build tools with apksigner were not found under $android_sdk/build-tools." >&2
  exit 1
fi
build_tools="$(dirname "$apksigner")"
zipalign="$build_tools/zipalign"
aapt="$build_tools/aapt"

npm --prefix "$project_root" run typecheck
npm --prefix "$project_root" run test:core
NODE_ENV=production "$project_root/android/gradlew" --project-dir "$project_root/android" :app:assembleRelease

release_apk="$project_root/android/app/build/outputs/apk/release/app-release.apk"
aligned_apk="$project_root/dist/RoosterPlan-aligned.apk"
signed_apk="$project_root/dist/RoosterPlan.apk"
mkdir -p "$project_root/dist"
rm -f "$aligned_apk" "$signed_apk"
"$zipalign" -f -P 16 4 "$release_apk" "$aligned_apk"
"$apksigner" sign \
  --ks "$ROOSTERPLAN_KEYSTORE_PATH" \
  --ks-key-alias "$key_alias" \
  --ks-pass env:ROOSTERPLAN_KEYSTORE_PASSWORD \
  --key-pass env:ROOSTERPLAN_KEY_PASSWORD \
  --out "$signed_apk" \
  "$aligned_apk"
rm -f "$aligned_apk"

"$zipalign" -c -P 16 4 "$signed_apk"
"$apksigner" verify --verbose --print-certs "$signed_apk"
"$aapt" dump badging "$signed_apk" | sed -n '1p'
sha256sum "$signed_apk"
