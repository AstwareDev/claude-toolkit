<h1 align="center">
  <img src="media/claude1.png" width="48" height="48" align="top" alt="Claude Toolkit logo"> Claude Toolkit
</h1>

<p align="center">
  My personal skill stack for Claude. Small, reusable skills built from tasks I kept repeating in chat, so I never have to re-explain the same workflow twice.
</p>

---

## Skills

### `/svg-optimize`

Drop an SVG in chat and get a smaller one back that still looks identical.

![svg-optimize demo](media/svg-optimize-demo.png)

- Runs SVGO in multipass mode and strips metadata, comments, XML declarations, and unused namespaces
- Rounds coordinates to 2 decimals, merges adjacent paths, and keeps the `viewBox`
- Renders the result next to the original to confirm nothing shifted before delivering
- Reports exact before and after bytes for every file
- Honest about size targets. If one can't be hit without hurting the design, it says why and lets you decide whether to go lossy
- Your filenames stay as they are

---

### `/favicon-generator`

One logo in, a complete icon set out.

![favicon-generator demo](media/favicon-generator-demo.png)

- Accepts SVG, PNG, JPG, or WebP
- Outputs a multi-resolution `favicon.ico`, PNGs from 16 to 512, an Apple touch icon, and Android Chrome icons
- Pads non-square logos instead of stretching them
- Flattens the Apple icon onto white, since iOS renders transparency as black
- Supports an optional solid background color
- Checks the output visually and warns you when a low-res source will look soft at large sizes
- Includes the ready-to-paste `<head>` snippet

---

### `/optimize-images`

Point it at a project and it shrinks every raster image without visible quality loss, then wires up smooth loading.

![optimize-images demo](media/optimize-images-demo.png)

- Converts PNG, JPEG, BMP, and TIFF to WebP (quality 82, capped at 2000px) and rewrites the references in your code
- Detects the real format from file contents, so mislabeled files don't break the run
- Leaves alone anything under 80 KB, SVGs, animated GIFs, existing WebP and AVIF, and conversions that wouldn't get smaller
- Generates tiny base64 blur placeholders and wires blur-up loading into your image components
- Uses the native blur on Next.js `Image` and a layered cross-fade everywhere else
- Checks for a clean git tree first and reports total savings when done
- Works with Next.js, React, Vue, Svelte, Astro, and plain static HTML

---

## Install

Each skill is a folder with a `SKILL.md` and its scripts. To use one, pack it and upload it to Claude.

```powershell
powershell -ExecutionPolicy Bypass -File package-skills.ps1
```

This builds an upload-ready `.skill` file for every skill into `dist`. Re-run it after any change.

Then in Claude, go to **Skills**, choose **Create skill**, and upload the file.

## Project structure

```
skills
  svg-optimize
  favicon-generator
  optimize-images
media
dist
package-skills.ps1
```

## Good to know

- `/svg-optimize` and `/favicon-generator` expect files dropped in chat and keep your original filenames on delivery
- `/optimize-images` bundles its own `sharp`, so it never adds a dependency to your project

<h1 align="center">
  <img src="media/claude3.png" width="80" height="80" align="top" alt="Claude Toolkit logo"> Make sure to star this repo =)
</h1>
