#!/usr/bin/env python3
"""
generate_favicons.py

Turn a source logo (SVG, PNG, JPG, or WEBP) into a complete favicon package:
- favicon.ico (multi-resolution: 16, 32, 48, 64, 128, 256)
- Individual PNGs at common sizes (16, 32, 48, 64, 128, 192, 256, 512)
- apple-touch-icon-180x180.png
- android-chrome-192x192.png / android-chrome-512x512.png

Usage:
    python generate_favicons.py <source_file> [output_dir] [--background COLOR]

Examples:
    python generate_favicons.py logo.svg
    python generate_favicons.py logo.png ./out
    python generate_favicons.py logo.svg ./out --background "#ffffff"

Dependencies: cairosvg (for SVG input), Pillow (for everything).
Install with:  pip install cairosvg pillow --break-system-packages
(cairosvg is only imported/needed when the source is an SVG.)
"""

import sys
import os
import argparse

# Sizes that get their own standalone PNG file.
PNG_SIZES = [16, 32, 48, 64, 128, 192, 256, 512]

# Sizes bundled inside favicon.ico. Keep this <=256; larger sizes bloat
# the .ico and aren't used by any browser.
ICO_SIZES = [16, 32, 48, 64, 128, 256]

APPLE_TOUCH_SIZE = 180
ANDROID_CHROME_SIZES = [192, 512]


def render_svg_to_png_bytes(svg_path, size, background=None):
    import cairosvg
    kwargs = dict(url=svg_path, output_width=size, output_height=size)
    if background:
        kwargs["background_color"] = background
    return cairosvg.svg2png(**kwargs)


def load_master_image(source_path, master_size, background=None):
    """Return a Pillow RGBA image rendered/resized to master_size x master_size."""
    from PIL import Image
    import io

    ext = os.path.splitext(source_path)[1].lower()

    if ext == ".svg":
        png_bytes = render_svg_to_png_bytes(source_path, master_size, background)
        img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        return img

    # Raster input (png/jpg/webp/etc): open, flatten onto background if not
    # square, and resize with a high-quality filter.
    img = Image.open(source_path).convert("RGBA")

    if img.width != img.height:
        side = max(img.width, img.height)
        canvas = Image.new(
            "RGBA", (side, side), background if background else (0, 0, 0, 0)
        )
        offset = ((side - img.width) // 2, (side - img.height) // 2)
        canvas.paste(img, offset, img)
        img = canvas

    if img.size != (master_size, master_size):
        img = img.resize((master_size, master_size), Image.LANCZOS)

    return img


def main():
    parser = argparse.ArgumentParser(description="Generate a full favicon package from a source logo.")
    parser.add_argument("source", help="Path to the source logo (SVG, PNG, JPG, WEBP, ...)")
    parser.add_argument("output_dir", nargs="?", default="./favicons", help="Directory to write output files to")
    parser.add_argument("--background", default=None, help="Background color (e.g. '#ffffff') to flatten onto for non-square or transparency-averse inputs. Default: keep transparent.")
    args = parser.parse_args()

    source_path = args.source
    output_dir = args.output_dir
    background = args.background

    if not os.path.isfile(source_path):
        print(f"Error: source file not found: {source_path}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    # Render a high-res master (largest size we need) once per unique size
    # requirement, from the source, rather than repeatedly downscaling a
    # single raster copy -- this keeps small sizes crisp when the source is
    # a vector (SVG).
    all_sizes = sorted(set(PNG_SIZES) | set(ICO_SIZES) | {APPLE_TOUCH_SIZE} | set(ANDROID_CHROME_SIZES))

    rendered = {}
    for size in all_sizes:
        rendered[size] = load_master_image(source_path, size, background)

    # Write standalone PNGs
    for size in PNG_SIZES:
        out_path = os.path.join(output_dir, f"favicon-{size}x{size}.png")
        rendered[size].save(out_path, format="PNG", optimize=True)
        print(f"wrote {out_path}")

    # Apple touch icon (opaque background recommended by Apple; if no
    # background was requested, flatten onto white so it doesn't render
    # with a black box behind it on iOS)
    apple_img = rendered[APPLE_TOUCH_SIZE]
    if background is None:
        from PIL import Image
        flattened = Image.new("RGBA", apple_img.size, "#ffffff")
        flattened.paste(apple_img, (0, 0), apple_img)
        apple_img = flattened
    apple_path = os.path.join(output_dir, "apple-touch-icon-180x180.png")
    apple_img.convert("RGB").save(apple_path, format="PNG", optimize=True)
    print(f"wrote {apple_path}")

    # Android chrome icons (used in web app manifests / PWAs)
    for size in ANDROID_CHROME_SIZES:
        out_path = os.path.join(output_dir, f"android-chrome-{size}x{size}.png")
        rendered[size].save(out_path, format="PNG", optimize=True)
        print(f"wrote {out_path}")

    # Multi-resolution favicon.ico. Pillow builds all requested sizes
    # correctly as long as you call .save(sizes=...) on the *base* image
    # (it resizes internally) -- passing append_images with pre-rendered
    # sizes silently collapses to a single-size ico, so don't do that.
    ico_master = rendered[max(ICO_SIZES)]
    ico_path = os.path.join(output_dir, "favicon.ico")
    ico_master.save(ico_path, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    print(f"wrote {ico_path}")

    print("\nDone. Suggested <head> snippet:")
    print(f'''
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png">
'''.strip())


if __name__ == "__main__":
    main()
