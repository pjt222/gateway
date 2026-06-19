#!/usr/bin/env node
// verify-viz.mjs — headless runtime verification of the 3D visualizers.
//
// Boots the app in a headless Chromium, drives default -> 3D -> Sand, and
// asserts the GPGPU sand actually renders. Proves what a static review and a
// unit test can't: that the WebGL/GPGPU path runs and paints.
//
// Usage:
//   node scripts/verify-viz.mjs            # build + `vite preview` (shipped surface, default)
//   node scripts/verify-viz.mjs --dev      # use/boot the dev server (faster; NOT the shipped chunk graph)
//   VERIFY_URL=http://host:port/gateway/ node scripts/verify-viz.mjs   # target a running server
//
// Setup (once):  npm install   &&   npx playwright install chromium
//
// Gotchas this encodes (each cost a cold start real time):
//  - headless Chromium needs SwiftShader/ANGLE flags for WebGL2;
//  - the GPGPU path needs EXT_color_buffer_half_float (probed; else it silently
//    falls back to Shells), so a missing extension is a hard fail here;
//  - a present <canvas> can still be black -> assert non-black luminance, not
//    element presence (pngjs on the canvas screenshot);
//  - the particle rAF loop is visibility-gated (document.hidden -> black), so
//    assert visibilityState === 'visible';
//  - HMR does NOT reset GPGPU textures, so the dev server is a weaker surface
//    than `vite preview` over a real build — default targets the build.
//
// Exit code: 0 = PASS, 1 = at least one assertion failed (CI-friendly).

import { chromium } from "playwright";
import { PNG } from "pngjs";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.VIZ_OUT || "/tmp/sandviz";
const DEV = process.argv.includes("--dev");
const NO_BUILD = process.argv.includes("--no-build");
const PORT = DEV ? 5173 : 4173;
const URL = process.env.VERIFY_URL || `http://localhost:${PORT}/gateway/`;
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const LIT_THRESHOLD = 1.0; // percent of canvas pixels above luminance 25

mkdirSync(OUT, { recursive: true });

const sh = (cmd, args, opts = {}) =>
  spawn(cmd, args, { cwd: ROOT, ...opts });

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function pctLit(buf) {
  const png = PNG.sync.read(buf);
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const lum = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
    if (lum > 25) lit++;
  }
  return (100 * lit) / (png.width * png.height);
}

async function canvasInfo(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return { canvas: false };
    const sand = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Sand");
    return {
      canvas: true, w: c.width, h: c.height,
      visibility: document.visibilityState,
      sandPressed: sand ? sand.getAttribute("aria-pressed") : "no-btn",
    };
  });
}

async function runContext(browser, reduced, tag, logs) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  page.on("console", (m) => logs.push(`[${tag}][${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => logs.push(`[${tag}][pageerror] ${e}`));
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2500);

  const webgl = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    return gl
      ? { webgl2: true, halfFloat: !!gl.getExtension("EXT_color_buffer_half_float") }
      : { webgl2: false };
  });

  await page.getByRole("button", { name: "Switch to 3D view" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Sand", exact: true }).click();
  await page.waitForTimeout(4000); // let grains settle onto the nodes

  await page.screenshot({ path: `${OUT}/${tag}_sand.png` });
  const crop = await page.locator("canvas").first().screenshot({ path: `${OUT}/${tag}_sand_canvas.png` });
  const info = await canvasInfo(page);
  const lit = pctLit(crop);
  await ctx.close();
  return { tag, reduced, webgl, info, lit };
}

let server = null;
const failures = [];
try {
  // --- ensure a server is up (start one only if needed) ---
  const alreadyUp = await waitForServer(URL, 1500);
  if (!alreadyUp && !process.env.VERIFY_URL) {
    if (!DEV && !NO_BUILD) {
      console.log("building (vite build)…");
      await new Promise((res, rej) => {
        const b = sh("npm", ["run", "build"], { stdio: "inherit" });
        b.on("exit", (c) => (c === 0 ? res() : rej(new Error("build failed"))));
      });
    }
    console.log(`starting ${DEV ? "dev" : "preview"} server on :${PORT}…`);
    // --strictPort so Vite fails loudly instead of binding a different port
    // (which would leave URL and the actual bound port inconsistent).
    server = sh("npm", ["run", DEV ? "dev" : "preview", "--", "--port", String(PORT), "--strictPort"],
                { stdio: "ignore", detached: true });
    if (!(await waitForServer(URL, 40000))) throw new Error(`server never came up at ${URL}`);
  }
  console.log(`verifying ${URL}`);

  const browser = await chromium.launch({ headless: true, args: ARGS });
  const logs = [];
  const results = [];
  for (const [reduced, tag] of [[false, "norm"], [true, "rm"]]) {
    results.push(await runContext(browser, reduced, tag, logs));
  }
  await browser.close();

  // --- assertions ---
  for (const r of results) {
    if (!r.webgl.halfFloat) failures.push(`${r.tag}: no EXT_color_buffer_half_float (GPGPU would fall back to Shells)`);
    if (r.info.sandPressed !== "true") failures.push(`${r.tag}: Sand mode not active (aria-pressed=${r.info.sandPressed})`);
    if (r.info.visibility !== "visible") failures.push(`${r.tag}: canvas hidden (rAF gated, visibility=${r.info.visibility})`);
    if (r.lit < LIT_THRESHOLD) failures.push(`${r.tag}: canvas effectively black (lit=${r.lit.toFixed(1)}%)`);
    console.log(`${r.tag}: webgl=${JSON.stringify(r.webgl)} sand=${r.info.sandPressed} vis=${r.info.visibility} lit=${r.lit.toFixed(1)}%`);
  }
  const gpuErrs = logs.filter((l) => /gpgpu|webgl error|\bnan\b|fallback/i.test(l));
  for (const e of gpuErrs) failures.push(`console: ${e}`);
} catch (e) {
  failures.push(`fatal: ${e.message}`);
} finally {
  if (server) {
    try {
      // POSIX: a negative pid signals the whole process group (npm + vite + children).
      // Windows has no process groups / negative pids, so kill the child directly.
      if (process.platform === "win32") server.kill();
      else process.kill(-server.pid, "SIGTERM");
    } catch { try { server.kill(); } catch { /* already gone */ } }
  }
}

if (failures.length) {
  console.error("\nVERIFY FAIL:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`\nVERIFY PASS — Sand renders (idle + reduced-motion), half-float ok, no GPGPU errors. Screenshots in ${OUT}`);
