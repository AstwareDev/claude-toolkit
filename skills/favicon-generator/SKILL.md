---
name: favicon-generator
description: Turn a logo or icon image (SVG, PNG, JPG, WEBP) into a complete favicon package -- a multi-resolution favicon.ico plus PNGs at standard sizes (16, 32, 48, 64, 128, 192, 256, 512), an apple-touch-icon-180x180.png, and android-chrome icons. Use this whenever the user uploads or references a logo and asks for a "favicon", "favicon.ico", "site icon", "app icon", icons in multiple sizes/resolutions, an "apple touch icon", or wants their logo "optimized" or "converted" into web-ready icon files. Also trigger if they ask to add favicons to a website/project.
---

# Favicon Generator

Generate a full, ready-to-ship favicon package from a single source logo, using the bundled script rather than writing bespoke conversion code each time.

## Workflow

1. **Locate the source file.** It's usually already uploaded (check `/mnt/user-data/uploads/`). Prefer an SVG or the highest-resolution raster available -- output quality is capped by input quality for raster sources.

2. **Check dependencies, install if missing:**
   ```bash
   pip install cairosvg pillow --break-system-packages -q
   ```
   `cairosvg` is only needed for SVG sources; Pillow handles everything else (resizing, ICO packing, raster input).

3. **Run the script:**
   ```bash
   python3 scripts/generate_favicons.py <source_file> <output_dir>
   ```
   Optional: `--background "#ffffff"` to flatten onto a solid color instead of keeping transparency (useful if the source has a transparent background and the user wants a solid-color favicon, or if the logo looks bad with a transparent apple-touch-icon backdrop -- though the script already flattens the apple touch icon onto white by default).

4. **Spot-check the output visually** before delivering -- `view` at least the 256px PNG and the apple-touch-icon to make sure nothing got cropped or distorted (this matters most when the source raster isn't square, since the script pads it to square, or when the source has fine detail that may not survive downscaling to 16x16).

5. **Copy everything to `/mnt/user-data/outputs/`** (a subfolder like `favicon-package/` keeps it tidy) and call `present_files` on the full set.

## What gets produced

| File | Size(s) | Purpose |
|---|---|---|
| `favicon.ico` | 16, 32, 48, 64, 128, 256 (multi-res, single file) | Classic favicon, works everywhere |
| `favicon-16x16.png` ... `favicon-512x512.png` | 16, 32, 48, 64, 128, 192, 256, 512 | Modern `<link rel="icon">` PNGs, app icons |
| `apple-touch-icon-180x180.png` | 180 | iOS home-screen icon (flattened onto white background) |
| `android-chrome-192x192.png`, `android-chrome-512x512.png` | 192, 512 | Android/PWA manifest icons |

Mention the suggested `<head>` snippet the script prints at the end if the user is wiring this into an actual site.

## Important implementation notes (don't relearn these the hard way)

- **Building the multi-size .ico**: call `.save(path, format="ICO", sizes=[(16,16),(32,32),...])` on a single base Pillow image -- Pillow resizes internally for each size. Do NOT build it via `append_images` with separately pre-rendered PNGs of each size; Pillow silently collapses that to a single 16x16 icon. (`ImageMagick`'s `convert icon-16.png icon-32.png ... favicon.ico` also works correctly if ImageMagick + an SVG delegate is available, but the Pillow approach above needs no external delegate and is what the bundled script uses.)
- **SVG rasterization**: ImageMagick's `convert` often can't rasterize SVGs directly in this environment (no `rsvg-convert` delegate installed). `cairosvg` is the reliable path and needs no system package, just `pip install cairosvg`.
- **Apple touch icons should not be transparent** -- iOS renders transparency as black. Flatten onto white (or the user's brand color) before exporting.
- **Non-square raster sources**: pad to a square canvas (transparent or a supplied background color) before resizing, don't stretch.
- Run `optipng -o4 -quiet <file>.png` on the PNGs afterward if optipng is available (`apt-get install -y optipng` works in this environment) -- meaningfully shrinks file size at no visual cost. Skip silently if it's not installed/installable; it's a nice-to-have, not required.

## Edge cases

- **No source file found / ambiguous which upload to use**: ask the user rather than guessing.
- **Source is very low-res** (e.g. under 256px) or already a small favicon: still generate the full set, but tell the user the larger sizes (256, 512) will look soft since they're upscaled.
- **User wants a different size set** (e.g. only wants the .ico, or wants a `mstile` size for Windows tiles): the script's `PNG_SIZES` / `ICO_SIZES` lists at the top are the easy place to adjust -- edit and rerun rather than hand-rolling a one-off script.
