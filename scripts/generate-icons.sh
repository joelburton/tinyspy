#!/usr/bin/env bash
# ============================================================
# Home-screen / touch icon generator
# ============================================================
# iOS/iPadOS rasterize an SVG apple-touch-icon into a blurry mess (and paint
# transparency black), so home-screen icons have to ship as real PNGs. This
# builds them from public/favicon.svg — the single source of truth for the mark,
# so re-run this after changing the logo — and writes them into public/.
#
# The artwork is already an app icon: an opaque indigo square with the white "P",
# wearing its own rounded corners painted in the app background (#FAFAFC) so it
# reads as a tile against our light pages. Those painted corners are exactly what
# a home-screen icon must NOT have — iOS and Android apply their OWN mask, and a
# mask that doesn't line up with the artwork's own radius leaves pale slivers
# around the edge. So we strip that one corner-mask path and render the mark
# FULL-BLEED on its indigo ground, letting the platform round it.
#
# (This is the inverse of what this script used to do. The previous logo was a
# transparent edge-to-edge glyph, which had to be scaled down and dropped onto an
# opaque ground; this one arrives as a finished tile and only needs undressing.)
#
# The `maskable` variant is a separate file because it plays by a stricter rule:
# Android adaptive icons may crop to a circle of 80% diameter, and the "P" spans
# 82% of the full-bleed height — it would lose its head and foot. So that one is
# scaled to 72% on the same indigo ground, which puts every corner of the glyph's
# box inside the safe circle. Same ground color, so the padding is invisible.
#
# Requires rsvg-convert (brew install librsvg). Run from anywhere:
#   ./scripts/generate-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

GROUND='#4B41C9'   # the artwork's own indigo field
FULL=$(mktemp -t icon-full).svg
MASKABLE=$(mktemp -t icon-maskable).svg

python3 - "$FULL" "$MASKABLE" "$GROUND" <<'PY'
import pathlib, re, sys

full_path, maskable_path, ground = sys.argv[1], sys.argv[2], sys.argv[3]
svg = pathlib.Path("public/favicon.svg").read_text()

# The corner mask is the one path filled #FAFAFC (the app background): the whole
# 1254 square with a rounded-rect subpath knocked out of it, i.e. it paints only
# OUTSIDE the tile's corners. Every other path is #4B41C9, #FCFCFC, or one of the
# antialiasing crumbs VTracer left behind in the indigo family — so the fill
# alone identifies it. Assert that, rather than trusting a regex to fail loudly.
corner = re.findall(r'<path[^>]*fill="#FAFAFC"[^>]*/>\s*', svg)
assert len(corner) == 1, f"expected exactly 1 corner-mask path, found {len(corner)}"
paths = "\n".join(re.findall(r'<path[^>]*/>', svg.replace(corner[0], "")))

# The source has width/height but no viewBox, so state the user-space box we're
# scaling from explicitly.
SIZE = 1254

pathlib.Path(full_path).write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" '
    f'viewBox="0 0 {SIZE} {SIZE}">\n{paths}\n</svg>\n'
)

# 0.72 keeps the glyph's bounding box (66% wide × 82% tall, near-centered) inside
# the maskable safe circle: its far corner sits 0.543·SIZE from centre, and
# 0.543 × 0.72 = 0.39 ≤ the 0.40 radius the spec guarantees.
SCALE = 0.72
off = SIZE * (1 - SCALE) / 2
pathlib.Path(maskable_path).write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" '
    f'viewBox="0 0 {SIZE} {SIZE}">\n'
    f'<rect width="{SIZE}" height="{SIZE}" fill="{ground}"/>\n'
    f'<g transform="translate({off},{off}) scale({SCALE})">\n{paths}\n</g>\n'
    f'</svg>\n'
)
PY

# Apple touch icons (iPad 152, iPad Pro 167) + the 180 iPhone/@3x default that
# iOS also auto-discovers by name + manifest 192/512. rsvg scales the VECTOR to
# each size, so every PNG is crisp (no raster upscaling).
for s in 152 167; do
  rsvg-convert -w "$s" -h "$s" "$FULL" -o "public/apple-touch-icon-$s.png"
done
rsvg-convert -w 180 -h 180 "$FULL" -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 "$FULL" -o public/icon-192.png
rsvg-convert -w 512 -h 512 "$FULL" -o public/icon-512.png
rsvg-convert -w 512 -h 512 "$MASKABLE" -o public/icon-512-maskable.png
rm -f "$FULL" "$MASKABLE"

echo "Wrote:"
ls -1 public/apple-touch-icon*.png public/icon-192.png public/icon-512*.png
