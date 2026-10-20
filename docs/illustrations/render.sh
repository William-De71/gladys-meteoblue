#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Generated illustrations of the widgets, in the four languages:
#   docs/assets/widgets.<lang>.png   "7-day forecast", "Next hours",
#                                    "Meteogram" and "meteoblue credits", 2 × 2
#
# They are NOT screenshots of a running Gladys: the contents come from the
# integration's own code (gen.mjs, on the made-up answers of the test
# fixtures), and render.js draws them the way the Gladys front does (same
# slots, order and class names as front/src/components/boxs/external-widget,
# the official theme, the same ApexCharts options). The pictograms are the
# real meteoblue ones the image handler serves (free use with a link to
# meteoblue, see the README); the meteogram is a stand-in drawing
# (meteogram.svg), the real picture being made by meteoblue at run time.
# Light theme: the dark mode of Gladys greys the badges out.
#
# Needs: Node, Chrome or Chromium (CHROME=/path/to/chrome, or the Playwright
# one), curl, Inkscape, ImageMagick and Python 3 with Pillow. Run from the repository
# root:
#   docs/illustrations/render.sh
# -----------------------------------------------------------------------------
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
here="$repo/docs/illustrations"
out="$repo/docs/assets"
# The Gladys front the styles are taken from (master on 2026-10-17).
gladys_ref="0027571e590d5d80261ab891e79a2307daa23180"
gladys_raw="https://raw.githubusercontent.com/GladysAssistant/Gladys/${gladys_ref}/front/src"

chrome="${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | tail -n1)}"
if [ ! -x "$chrome" ]; then
  echo "Chrome not found: set CHROME=/path/to/chrome" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$here/index.html" "$here/render.js" "$work/"

# The official theme and ApexCharts, as the Gladys front bundles them.
mkdir -p "$work/vendor/theme" "$work/vendor/apexcharts"
(cd "$work/vendor" && npm pack -s @gladysassistant/theme-optimized@2.1.0 apexcharts@3.54.1 >/dev/null)
tar xzf "$work"/vendor/gladysassistant-theme-optimized-*.tgz -C "$work/vendor/theme"
tar xzf "$work"/vendor/apexcharts-*.tgz -C "$work/vendor/apexcharts"

# The widget styles are a CSS module: its class names are used as they are,
# except `.badge`, which the theme also defines (renamed `.wbadge`).
curl -fsS "$gladys_raw/components/boxs/external-widget/style.css" |
  sed -E 's/:global\(([^)]*)\)/\1/g; s/\.badge([^A-Za-z])/.wbadge\1/g' >"$work/widget.css"
curl -fsS "$gladys_raw/style/dark-mode.css" -o "$work/dark-mode.css"

node "$here/gen.mjs" "$repo" "$work/contents.json"
locales="$work/vendor/apexcharts/package/dist/locales"
{
  printf 'window.APEX_LOCALES=['
  for language in fr en de es; do cat "$locales/$language.json"; printf ','; done
  printf '];\nwindow.DATA='
  cat "$work/contents.json"
  printf ';\n'
} >"$work/data.js"

# The meteoblue pictograms, from the only URLs the integration's image
# handler can fetch (see src/conditions.js), and the meteogram stand-in.
mkdir -p "$work/images"
node -e '
  const { images } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const [key, url] of Object.entries(images)) console.log(`${key} ${url}`);
' "$work/contents.json" | while read -r key url; do
  if [ "$url" = "meteogram" ]; then
    inkscape "$here/meteogram.svg" --export-type=png --export-filename="$work/images/${key}.png" >/dev/null 2>&1
  else
    curl -fsS "$url" -o "$work/images/${key}.png"
  fi
done

shot() {
  local file="$1" size="$2" query="$3"
  # The time zone of the house: the chart axis follows the browser's.
  TZ=Europe/Paris "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --allow-file-access-from-files --virtual-time-budget=6000 \
    --window-size="$size" --force-device-scale-factor=1.5 \
    --screenshot="$file" "file://$work/index.html?$query" >/dev/null 2>&1
  local background
  background="$(magick "$file" -format '%[pixel:p{2,2}]' info:)"
  magick "$file" -trim -bordercolor "$background" -border 30 "$file"
}

for language in en fr de es; do
  shot "$out/widgets.$language.png" 900,1800 "lang=$language&cards=daily,hourly,meteogram,credits"
done

# 256 colors keep the small colored badges and the icons close to the original.
python3 -I - "$out" <<'PY'
import glob
import sys
from PIL import Image

for path in glob.glob(f"{sys.argv[1]}/widgets.*.png"):
    image = Image.open(path).convert("RGB")
    image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(
        path, optimize=True
    )
PY
ls -l "$out"/widgets.*.png
