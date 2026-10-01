---
name: svg-optimize
description: Optimize SVG files - minify, strip metadata/comments, reduce path precision, merge paths - while verifying the result still matches the original design. Use this whenever the user asks to optimize, minify, compress, clean up, or shrink an SVG (or wants one under a specific byte/KB target), or uploads .svg files and asks for a smaller/performant version. Always verify visual fidelity before delivering, and always tell the user honestly if a requested byte target is incompatible with keeping the design unchanged rather than silently sacrificing quality.
---

# SVG Optimize

Shrink SVG files (remove cruft, cut precision, merge paths) while keeping the artwork visually identical — and verifying that with a render-and-compare step, not just assuming SVGO did the right thing.

## Workflow

1. **Set up svgo** (once per session): `which svgo || npx --yes svgo --version` — npx will fetch it on demand, no need to pre-install.

2. **Run the optimizer** on each file with the bundled config/script:
   ```bash
   bash scripts/optimize.sh <input.svg> <output.svg>
   ```
   This uses `scripts/svgo.config.js`: multipass, drops metadata/comments/XML declarations/unused namespaces, removes explicit width/height (keeps viewBox), converts `<style>` classes to inline attributes, rounds path/transform coordinates to 2 decimal places, and merges adjacent paths where possible. 2 decimals is the safe default — visually lossless for the vast majority of icons/logos/illustrations.

3. **Verify fidelity — do not skip this.** Render both the original and the optimized file to PNG and compare side by side before telling the user they match:
   ```bash
   python3 -c "
   import cairosvg
   cairosvg.svg2png(url='original.svg', write_to='orig.png', output_width=400)
   cairosvg.svg2png(url='optimized.svg', write_to='opt.png', output_width=400)
   "
   ```
   (`pip install cairosvg --break-system-packages -q` if not already present.) Stitch them into one side-by-side PNG with Pillow and view it. If anything visibly shifted (usually from precision loss on very fine detail, or a merged path changing fill-rule behavior), back off precision (see step 5) rather than shipping a mismatch.

4. **Report actual sizes plainly**: original bytes -> optimized bytes and % reduction, per file. Don't round up or hand-wave.

5. **If the user gave a byte/KB target:**
   - Check whether the lossless (2-decimal) pass already hits it. Often it won't for detailed multi-path artwork — path coordinate data alone can dwarf a small byte budget no matter how much markup cruft is removed.
   - If it doesn't fit, say so explicitly and explain *why* in one line (e.g. "this has ~80 curve points across 12 paths; that's the floor without deleting geometry"). Do not silently oversimplify the artwork to hit a number.
   - Offer, don't assume: you can push precision lower (`bash scripts/optimize.sh in.svg out.svg 1` or `0`) or run further lossy simplification (fewer anchor points / path simplification), but flag that this trades away exact fidelity, and let the user decide whether that trade is worth it for that particular file. Different files in the same batch can land differently — don't apply a blanket aggressive pass just because one file needed it.

6. **Deliver files using the same filename the user gave you** — do not append `.optimized`, `.min`, `-2`, or similar suffixes. The optimized version replaces the original in `/mnt/user-data/outputs/`; the byte-count report in the chat is what distinguishes before/after, not the filename. If the user is optimizing multiple files at once, keep each one's original name.

## Notes

- `removeViewBox: false` is deliberate — always keep viewBox even though width/height attrs are stripped, so the SVG still scales correctly.
- Don't reach for precision 0 or aggressive path-simplification by default; only do it when the lossless pass can't hit a stated target and the user has confirmed they're OK trading fidelity for size.
- Text rendered as outlined paths (common in logos exported from design tools) usually can't be losslessly shrunk much further than what floatPrecision buys you — the point count is fixed by the letterforms. Don't try to convert it to `<text>` + a font unless the user asks; that changes the rendering guarantee (depends on the viewer having the font).
