#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
ICON_DIR="$ROOT_DIR/desktop/icons"
SVG_PATH="$ICON_DIR/app-icon.svg"
MASTER_PNG="$ICON_DIR/icon.png"
ICONSET_DIR="$ICON_DIR/icon.iconset"
ICNS_PATH="$ICON_DIR/icon.icns"

mkdir -p "$ICON_DIR"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

sips -s format png "$SVG_PATH" --out "$MASTER_PNG" >/dev/null

render() {
  size="$1"
  name="$2"
  sips -z "$size" "$size" "$MASTER_PNG" --out "$ICONSET_DIR/$name" >/dev/null
}

render 16 icon_16x16.png
render 32 icon_16x16@2x.png
render 32 icon_32x32.png
render 64 icon_32x32@2x.png
render 128 icon_128x128.png
render 256 icon_128x128@2x.png
render 256 icon_256x256.png
render 512 icon_256x256@2x.png
render 512 icon_512x512.png
render 1024 icon_512x512@2x.png

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH"
echo "Built $ICNS_PATH"
