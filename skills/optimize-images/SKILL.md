---
name: optimize-images
description: Scan any project for raster images, re-encode them to WebP without visible quality loss, and wire up smooth blur-up loading (blurry tiny placeholder that cross-fades into the sharp image once it loads). Use when the user asks to optimize/compress images, speed up image loading, or add blur/progressive image loading anywhere in a project — works across frameworks (Next.js, plain React, Vue, Svelte, static HTML, etc.).
---

# Optimize Images & Blur-Up Loading

Two phases: (1) run the bundled script to do the mechanical scan/convert/rewrite/placeholder work, (2) manually wire blur-up loading into the components that render the optimized images — this needs judgment per project/framework, so it isn't scripted.

The script has no framework assumptions built in — it auto-detects directories and adapts to whatever package manager and layout the project already uses. Read its console output; it tells you what it found and what it decided.

## Phase 1 — Optimize

1. Confirm the working tree is clean (`git status --short`) before running — this touches many binary files and rewrites source references. If dirty, tell the user and let them decide whether to stash/commit first.
2. The skill bundles its own `sharp` (installed once under `~/.Codex/skills/optimize-images/node_modules`) — it never adds a dependency to the target project. If `node ~/.Codex/skills/optimize-images/scripts/optimize-images.mjs` fails with a missing-module error, `cd ~/.Codex/skills/optimize-images && npm install` once to (re)install it.
3. Run the script from the target project's root:
   ```
   node ~/.Codex/skills/optimize-images/scripts/optimize-images.mjs
   ```
   With no flags it auto-detects everything:
   - **Asset directories** — whichever of `public`, `static`, `assets`, `src/assets`, `src/public`, `www` exist in the project
   - **Reference directories** (where it rewrites string paths to renamed files) — whichever of `src`, `app`, `pages`, `components`, `lib`, `content` exist
   - **Blur-placeholder module location** — `<first reference dir>/image-placeholders.js`

   Override any of it if the auto-detection doesn't fit:
   - `--dirs foo,bar` / `--src-dirs foo,bar` — explicit directories, comma-separated
   - `--exclude foo,bar` — skip paths containing these substrings (e.g. a folder of source-of-truth originals that shouldn't be touched, or a subtree already optimized)
   - `--min-size-kb 80` — files smaller than this are left alone (tiny icons/logos gain little and aren't worth touching); raise it if the project has lots of small-but-not-tiny images you want to leave as-is
   - `--quality 82` / `--max-edge 2000` — defaults chosen to be visually lossless for typical document/photo/screenshot content at normal display sizes; lower only if the user wants more aggressive savings and accepts a visible tradeoff
   - `--blur-module path/to/file.js` — explicit output path for the placeholder lookup

   What the script does automatically:
   - Detects real image format by magic bytes, not extension (image exports from CMSs/design tools are sometimes saved with the wrong extension — e.g. a BMP saved as `.png` — this catches it regardless of what the filename claims)
   - Converts PNG/JPEG/BMP/TIFF over the size threshold to WebP, resizing only if it exceeds `--max-edge`
   - If `sharp`/libvips can't decode a file directly (BMP is the most common case, since libvips has no native BMP decoder), it falls back to whatever's available: an installed ImageMagick (`magick`/`convert` on PATH, cross-platform) first, then a Windows-native `System.Drawing` re-encode if on Windows, otherwise it reports the file as needing manual conversion rather than failing the whole run
   - Skips SVGs, animated GIFs, and files already in WebP/AVIF (re-encoding an already-lossy format loses quality for no size benefit)
   - Skips a conversion if the result isn't actually smaller
   - Rewrites every string reference to a renamed file across the reference directories (JS/TS/JSX/TSX, Vue, Svelte, Astro, HTML, MDX, JSON, CSS/SCSS/LESS)
   - Generates and merges tiny (16px) base64 blur placeholders into a JS module keyed by final path — additive across runs, so re-running with a different `--dirs` doesn't drop earlier entries
4. Read the script's console report: before/after totals and the skip breakdown. Look at `undecodable` entries if any appear — those need a manual look (install ImageMagick, or convert by hand).
5. Run `git status --short` again to see the full diff shape: deleted originals, new `.webp` files, modified reference files, and the blur-placeholder module (new or updated). Spot-check one or two converted images to confirm quality is acceptable before proceeding — open the file directly, or check it in the browser preview if it's user-facing.

## Phase 2 — Wire up blur-up loading

Figure out the project's stack first (check `package.json` dependencies, and look for an existing image component to mirror rather than inventing a new pattern). Then, for each place that renders an image now present in the blur-placeholder module, add the cross-fade:

**Next.js `<Image>` (from `next/image`).** Built in — no manual fade code needed:
```jsx
import { imageBlurPlaceholders } from "<path-to-module>";
// ...
<Image
  src={someImagePath}
  placeholder="blur"
  blurDataURL={imageBlurPlaceholders[someImagePath]}
  ...
/>
```
Next automatically shows the blur and cross-fades to the loaded image. Guard with `imageBlurPlaceholders[someImagePath] &&` when the path is dynamic/data-driven and might not have an entry (e.g. a remote URL, or an image that was below the size threshold and intentionally skipped).

**Everything else — plain React `<img>`, Vue, Svelte, Astro, static HTML, or any case needing manual control** (crossfading between multiple images in a carousel, `fill`/absolute layouts, etc.): layer a blurred placeholder under the real image and fade the real one in on load.

Framework-agnostic shape (adapt the load-event syntax to the framework — `onLoad` in React, `@load` in Vue, `on:load` in Svelte, plain `onload` in static HTML):
```html
<div style="position:relative">
  <img src="{blurDataURL}" aria-hidden="true"
       style="position:absolute;inset:0;filter:blur(12px);transform:scale(1.02);
              opacity:{loaded ? 0 : 1};transition:opacity .7s ease-out" />
  <img src="{realSrc}" onload="{markLoaded}"
       style="opacity:{loaded ? 1 : 0};transition:opacity .7s ease-out" />
</div>
```
If the project already has a component doing something similar (check for an existing "blur", "placeholder", or image-carousel component before adding a new pattern), match its structure instead of introducing a second convention.

Do NOT apply blur-up to:
- Tiny icons/logos (roughly under 100px) — the blur is imperceptible at that size and just adds code
- Decorative background images already handled by CSS
- Anything the script skipped (SVGs, remote images) since there's no placeholder for them

## Phase 3 — Verify

Follow the project's normal way of previewing changes for any user-facing view touched: start the dev server, navigate to the affected views, and visually confirm images load with a smooth blur-to-sharp transition and no layout shift or console errors. Throttle the network in devtools if the images now load too fast to see the effect.

Report to the user: total size reduction, number of files converted, number of components wired up for blur-up, and anything skipped that might need manual attention (undecodable files, no-gain files, etc.).
