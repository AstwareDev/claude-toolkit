// Scans a project's static image directories, re-encodes oversized/uncompressed
// raster images to WebP (fixing mislabeled/undecodable formats along the way),
// rewrites every source reference to the new path, and maintains a base64
// blur-placeholder lookup module for blur-up loading. Safe to re-run:
// already-optimized files and vector/animated formats are left untouched.
//
// Works in any JS/TS project — directories, package manager, and framework are
// auto-detected unless overridden with flags.
//
// Usage:
//   node optimize-images.mjs [options]
//
// Options:
//   --dirs <a,b,c>       Comma-separated directories to scan for images.
//                        Auto-detected if omitted: whichever of
//                        public, static, assets, src/assets, src/public, www exist.
//   --src-dirs <a,b,c>   Comma-separated directories to rewrite references in.
//                        Auto-detected if omitted: whichever of
//                        src, app, pages, components, lib, content exist.
//   --quality <n>        WebP quality 1-100 (default: 82)
//   --max-edge <n>       Max width/height in px, preserves aspect ratio (default: 2000)
//   --min-size-kb <n>    Skip files smaller than this — not worth the churn (default: 80)
//   --blur-module <path> JS module to write blur placeholders to.
//                        Defaults to <first src dir>/image-placeholders.js
//   --exclude <a,b,c>    Comma-separated substrings; matching relative paths are skipped

import sharp from "sharp";
import { readdir, stat, unlink, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execFileSync } from "child_process";
import os from "os";

const RASTER_EXTS = /\.(png|jpe?g|bmp|tiff?|gif)$/i;
const KNOWN_IMAGE_EXTS = /\.(png|jpe?g|bmp|tiff?|gif|webp|avif|svg)$/i;
const TEXT_REF_EXTS = /\.(jsx?|tsx?|mdx?|vue|svelte|astro|html?|json|css|scss|less)$/i;
const SKIP_DIR_NAMES = new Set([
  "node_modules", ".git", ".claude",
  ".next", ".nuxt", ".svelte-kit", ".output", ".vercel", ".turbo", ".cache",
  "dist", "build", "out", "coverage", "vendor",
]);
const DEFAULT_ASSET_DIR_CANDIDATES = ["public", "static", "assets", "src/assets", "src/public", "www"];
const DEFAULT_SRC_DIR_CANDIDATES = ["src", "app", "pages", "components", "lib", "content"];

let _reencoderChecked = false;
let _reencoderCmd = null; // "magick" | "convert" | null

function parseArgs(argv) {
  const opts = {
    dirs: null,
    srcDirs: null,
    quality: 82,
    maxEdge: 2000,
    minSizeKb: 80,
    blurModule: null,
    exclude: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--dirs") opts.dirs = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--src-dirs") opts.srcDirs = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--quality") opts.quality = Number(val());
    else if (a === "--max-edge") opts.maxEdge = Number(val());
    else if (a === "--min-size-kb") opts.minSizeKb = Number(val());
    else if (a === "--blur-module") opts.blurModule = val();
    else if (a === "--exclude") opts.exclude = val().split(",").map((s) => s.trim()).filter(Boolean);
  }
  return opts;
}

function detectExistingDirs(cwd, candidates) {
  return candidates.filter((d) => existsSync(path.join(cwd, d)));
}

async function walk(dir, exclude) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    if (SKIP_DIR_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
    if (exclude.some((x) => rel.includes(x))) continue;
    if (e.isDirectory()) files.push(...(await walk(full, exclude)));
    else files.push(full);
  }
  return files;
}

async function sniffFormat(file) {
  const fh = await (await import("fs/promises")).open(file, "r");
  const buf = Buffer.alloc(16);
  await fh.read(buf, 0, 16, 0);
  await fh.close();
  if (buf.slice(0, 4).toString("hex") === "89504e47") return "png";
  if (buf.slice(0, 3).toString("hex") === "ffd8ff") return "jpeg";
  if (buf.slice(0, 2).toString("hex") === "424d") return "bmp";
  if (buf.slice(0, 4).toString("ascii") === "GIF8") return "gif";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.slice(4, 8).toString("ascii") === "ftyp") return "avif";
  if (buf.slice(0, 4).toString("hex") === "49492a00" || buf.slice(0, 4).toString("hex") === "4d4d002a") return "tiff";
  const asText = buf.toString("utf8").trim();
  if (asText.startsWith("<")) return "svg";
  return "unknown";
}

function findReencoderCli() {
  if (_reencoderChecked) return _reencoderCmd;
  _reencoderChecked = true;
  for (const cmd of ["magick", "convert"]) {
    try {
      execFileSync(cmd, ["-version"], { stdio: "ignore" });
      _reencoderCmd = cmd;
      break;
    } catch {
      // not available, try next
    }
  }
  return _reencoderCmd;
}

// Whatever sharp/libvips can't decode directly (BMP is the common culprit,
// but any oddball format applies) — re-encode to PNG with whatever the OS
// or an installed image CLI provides, then hand that to sharp.
async function fallbackReencode(srcPath) {
  const tmpPng = path.join(os.tmpdir(), `oi-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  const cli = findReencoderCli();
  if (cli) {
    execFileSync(cli, [srcPath, tmpPng]);
    return tmpPng;
  }
  if (os.platform() === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${srcPath.replace(/'/g, "''")}'); $img.Save('${tmpPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose();`;
    execFileSync("powershell", ["-NoProfile", "-Command", ps]);
    return tmpPng;
  }
  throw new Error("no fallback decoder available — install ImageMagick (`magick`/`convert` on PATH) to handle this format");
}

function mergeBlurModule(existingSrc, newEntries) {
  let existing = {};
  if (existingSrc) {
    const match = existingSrc.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (match) {
      try {
        existing = JSON.parse(match[1]);
      } catch {
        existing = {};
      }
    }
  }
  const merged = { ...existing, ...newEntries };
  const keys = Object.keys(merged).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(merged[k])}`);
  return `export const imageBlurPlaceholders = {\n${lines.join(",\n")}\n};\n`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  if (!opts.dirs) {
    opts.dirs = detectExistingDirs(cwd, DEFAULT_ASSET_DIR_CANDIDATES);
    if (!opts.dirs.length) {
      console.error(`No asset directories found among: ${DEFAULT_ASSET_DIR_CANDIDATES.join(", ")}. Pass --dirs explicitly.`);
      process.exit(1);
    }
  }
  if (!opts.srcDirs) {
    opts.srcDirs = detectExistingDirs(cwd, DEFAULT_SRC_DIR_CANDIDATES);
    if (!opts.srcDirs.length) opts.srcDirs = ["."];
  }
  if (!opts.blurModule) {
    opts.blurModule = path.join(opts.srcDirs[0], "image-placeholders.js").replace(/\\/g, "/");
  }

  console.log(`Scanning: ${opts.dirs.join(", ")}`);
  console.log(`Rewriting references in: ${opts.srcDirs.join(", ")}`);

  const allFiles = [];
  for (const d of opts.dirs) allFiles.push(...(await walk(path.join(cwd, d), opts.exclude)));
  const candidates = allFiles.filter((f) => KNOWN_IMAGE_EXTS.test(f));

  const assetRoot = path.join(cwd, opts.dirs[0]);

  const processed = [];
  const skipped = { tooSmall: [], vector: [], animated: [], alreadyOptimal: [], undecodable: [], noGain: [] };
  const blurEntries = {};
  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of candidates) {
    const st = await stat(file);
    const format = await sniffFormat(file);
    // Public path is relative to whichever asset dir actually contains this file.
    const ownerDir = opts.dirs.map((d) => path.join(cwd, d)).find((d) => file.startsWith(d + path.sep));
    const relPublic = "/" + path.relative(ownerDir || assetRoot, file).replace(/\\/g, "/");

    if (format === "svg") { skipped.vector.push(file); continue; }
    if (format === "gif") { skipped.animated.push(file); continue; }
    if (format === "webp" || format === "avif") { skipped.alreadyOptimal.push(file); continue; }
    if (st.size < opts.minSizeKb * 1024) { skipped.tooSmall.push(file); continue; }

    const outPath = file.replace(/\.[^.]+$/, ".webp");
    let tmpFile = null;
    try {
      let input = file;
      try {
        await sharp(input).resize(opts.maxEdge, opts.maxEdge, { fit: "inside", withoutEnlargement: true }).webp({ quality: opts.quality, effort: 5 }).toFile(outPath);
      } catch (err) {
        tmpFile = await fallbackReencode(file);
        input = tmpFile;
        await sharp(input).resize(opts.maxEdge, opts.maxEdge, { fit: "inside", withoutEnlargement: true }).webp({ quality: opts.quality, effort: 5 }).toFile(outPath);
      }

      const outSt = await stat(outPath);
      if (outSt.size >= st.size) {
        await unlink(outPath);
        skipped.noGain.push(file);
        continue;
      }

      const blurBuf = await sharp(outPath).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();

      if (path.resolve(outPath) !== path.resolve(file)) await unlink(file);

      const newRelPublic = "/" + path.relative(ownerDir || assetRoot, outPath).replace(/\\/g, "/");
      blurEntries[newRelPublic] = `data:image/webp;base64,${blurBuf.toString("base64")}`;

      processed.push({ old: relPublic, new: newRelPublic, before: st.size, after: outSt.size });
      totalBefore += st.size;
      totalAfter += outSt.size;
    } catch (err) {
      skipped.undecodable.push(`${file} (${err.message})`);
    } finally {
      if (tmpFile) await unlink(tmpFile).catch(() => {});
    }
  }

  // Rewrite references to renamed files across the source tree.
  const renames = processed.filter((p) => p.old !== p.new);
  if (renames.length) {
    const srcFiles = [];
    for (const d of opts.srcDirs) srcFiles.push(...(await walk(path.join(cwd, d), opts.exclude)));
    const textFiles = srcFiles.filter((f) => TEXT_REF_EXTS.test(f));
    let filesTouched = 0;
    for (const f of textFiles) {
      let content = await readFile(f, "utf8");
      let changed = false;
      for (const r of renames) {
        if (content.includes(r.old)) {
          content = content.split(r.old).join(r.new);
          changed = true;
        }
      }
      if (changed) {
        await writeFile(f, content);
        filesTouched++;
      }
    }
    console.log(`Rewrote references in ${filesTouched} file(s).`);
  }

  // Merge blur placeholders into the lookup module.
  if (Object.keys(blurEntries).length) {
    const modulePath = path.join(cwd, opts.blurModule);
    const existing = existsSync(modulePath) ? await readFile(modulePath, "utf8") : "";
    const out = mergeBlurModule(existing, blurEntries);
    await mkdir(path.dirname(modulePath), { recursive: true });
    await writeFile(modulePath, out);
    console.log(`Wrote ${Object.keys(blurEntries).length} blur placeholder(s) to ${opts.blurModule}`);
  }

  console.log("\n--- Report ---");
  for (const p of processed) {
    console.log(`${p.old} -> ${p.new}  ${(p.before / 1024).toFixed(0)}KB -> ${(p.after / 1024).toFixed(0)}KB`);
  }
  console.log(`\nProcessed: ${processed.length} file(s)`);
  console.log(`Total: ${(totalBefore / 1048576).toFixed(2)}MB -> ${(totalAfter / 1048576).toFixed(2)}MB (${totalBefore ? (100 - (totalAfter / totalBefore) * 100).toFixed(1) : 0}% smaller)`);
  console.log(`Skipped — too small: ${skipped.tooSmall.length}, vector: ${skipped.vector.length}, animated: ${skipped.animated.length}, already optimal: ${skipped.alreadyOptimal.length}, no gain: ${skipped.noGain.length}, undecodable: ${skipped.undecodable.length}`);
  if (skipped.undecodable.length) {
    console.log("\nFiles needing manual conversion:");
    skipped.undecodable.forEach((f) => console.log(`  ${f}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
