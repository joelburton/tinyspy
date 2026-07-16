#!/usr/bin/env bash
# ============================================================
# Home-screen / touch icon generator
# ============================================================
# The browser favicon (public/favicon.svg) runs the logo edge-to-edge on a
# transparent ground — right for a browser tab, but iOS/iPadOS rasterize that
# into a BLURRY home-screen icon (and paint transparency black). This builds
# proper PNGs instead: the same logo, scaled DOWN with padding so it clears the
# rounded-corner mask, on an opaque app-background ground.
#
# It reads the logo straight from public/favicon.svg (single source of truth —
# re-run this after changing the logo) and writes the PNGs into public/.
#
# Requires rsvg-convert (brew install librsvg). Run from anywhere:
#   ./scripts/generate-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

BG='#fafafa'   # matches manifest background_color / theme_color
# The logo's content box is 5.5187197 x 5.349803 (favicon.svg viewBox), centred
# at (2.75935985, 2.6749015). We drop it into a 180-unit square with ~15.6%
# padding a side, so the artwork sits well inside iOS's rounded-corner squircle.
# scale = (180 - 2*28) / 5.5187197 = 22.469  (width is the larger dimension).
WRAP=$(mktemp -t touch-icon).svg
python3 - "$BG" > "$WRAP" <<'PY'
import re, sys, pathlib
bg = sys.argv[1]
svg = pathlib.Path("public/favicon.svg").read_text()
# The outermost content group; greedy .*</g> runs to the file's final </g>,
# which closes id="layer1" (its children are the only nested groups).
inner = re.search(r'<g\s+id="layer1".*</g>', svg, re.S).group(0)
print(f'''<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
<rect width="180" height="180" fill="{bg}"/>
<g transform="translate(90,90) scale(22.469) translate(-2.75935985,-2.6749015)">
{inner}
</g>
</svg>''')
PY

# Apple touch icons (iPad 152, iPad Pro 167) + the 180 iPhone/@3x default that
# iOS also auto-discovers by name + manifest 192/512. rsvg scales the VECTOR to
# each size, so every PNG is crisp (no raster upscaling).
for s in 152 167; do
  rsvg-convert -w "$s" -h "$s" "$WRAP" -o "public/apple-touch-icon-$s.png"
done
rsvg-convert -w 180 -h 180 "$WRAP" -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 "$WRAP" -o public/icon-192.png
rsvg-convert -w 512 -h 512 "$WRAP" -o public/icon-512.png
rm -f "$WRAP"

echo "Wrote:"
ls -1 public/apple-touch-icon*.png public/icon-192.png public/icon-512.png
