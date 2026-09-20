#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONFIGURATION="${CONFIGURATION:-Release}"
DERIVED="${DERIVED_DATA_PATH:-$ROOT/DerivedData}"
OUT="${1:-$ROOT/build/native-artifacts}"

mkdir -p "$OUT/PrivilegedHelperTools" "$OUT/LaunchDaemons" "$OUT/SystemExtensions"

copy_product() {
  product="$1"
  destination="$2"
  if [ ! -e "$product" ]; then
    echo "missing build product: $product" >&2
    exit 1
  fi
  rm -rf "$destination"
  cp -R "$product" "$destination"
}

xcodebuild \
  -workspace "$ROOT/StopScrollingMac.xcworkspace" \
  -scheme StopScrollingNative \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGN_STYLE=Automatic \
  build

PRODUCTS="$DERIVED/Build/Products/$CONFIGURATION"
copy_product "$PRODUCTS/libStopScrollingHostClient.dylib" "$OUT/libStopScrollingHostClient.dylib"
copy_product "$PRODUCTS/com.stopscrolling.helper" "$OUT/PrivilegedHelperTools/com.stopscrolling.helper"
copy_product "$ROOT/Resources/Helper/com.stopscrolling.helper.plist" "$OUT/LaunchDaemons/com.stopscrolling.helper.plist"

for extension in \
  "NetworkFilter.systemextension:com.stopscrolling.desktop.network-filter.systemextension" \
  "EndpointSecurity.systemextension:com.stopscrolling.desktop.endpoint-security.systemextension"
do
  source="${extension%%:*}"
  name="${extension#*:}"
  if [ -d "$PRODUCTS/$source" ]; then
    copy_product "$PRODUCTS/$source" "$OUT/SystemExtensions/$name"
  elif [ -d "$PRODUCTS/$name" ]; then
    copy_product "$PRODUCTS/$name" "$OUT/SystemExtensions/$name"
  else
    echo "missing system extension product $source" >&2
    exit 1
  fi
done

echo "Staged signed-ready native artifacts in $OUT"
echo "Pass this directory as STOPSCROLLING_MAC_NATIVE_ARTIFACT after codesigning."
