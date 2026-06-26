#!/usr/bin/env node
/**
 * scripts/bundle-cjs.mjs
 *
 * Post-build step for the iPad target. Takes the ESM output produced by
 * adapter-node and rebundles it as a single CommonJS file (ipad-build/server.cjs)
 * that Node.js Lab can load without ESM support.
 *
 * Usage (via `bunnytrail build-ipad`, or directly):
 *   node /path/to/bunnytrail/scripts/bundle-cjs.mjs [--out-dir <dir>]
 *
 * Runs in the consumer's project root (process.cwd()). The adapter-node output
 * directory defaults to <cwd>/ipad-build and can be overridden with --out-dir.
 *
 * Three module-scope top-level await (TLA) sites block a straight esbuild
 * ESM→CJS pass (esbuild refuses to emit CJS when any TLA is in the graph):
 *
 *   1. server/chunks/handler-*.js  `await server.init({...})` at col 0
 *   2. index.js                    `await rm(path)` inside module-scope else{}
 *   3. server/chunks/chunks/utils.js-*.js  `await import(...)` in try{} at col 0
 *
 * Strategy: patch all three files in-place in ipad-build/, run esbuild,
 * then restore the originals (so the .mjs ESM paths remain usable too).
 *
 * `import.meta.url` in env.js is rewritten automatically by esbuild (→ __dirname).
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, renameSync, globSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname = bunnytrail/scripts/ (used for self-referential paths like the shim)
const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse --out-dir argument; default to <cwd>/ipad-build
const outDirArg = process.argv.indexOf('--out-dir');
const out = outDirArg !== -1
  ? resolve(process.cwd(), process.argv[outDirArg + 1])
  : resolve(process.cwd(), 'ipad-build');

function readOut(rel)        { return readFileSync(resolve(out, rel), 'utf8'); }
function writeOut(rel, src)  { writeFileSync(resolve(out, rel), src); }
function glob(pattern)       { return globSync(pattern, { cwd: out }); }

// ── Locate dynamic chunk filenames ───────────────────────────────────────────
const handlerChunks = glob('server/chunks/handler-*.js');
const utilsChunks   = glob('server/chunks/chunks/utils.js-*.js');

if (handlerChunks.length !== 1) throw new Error(`bundle-cjs: expected 1 handler chunk, found ${handlerChunks.length}`);
if (utilsChunks.length   !== 1) throw new Error(`bundle-cjs: expected 1 utils chunk, found ${utilsChunks.length}`);

const handlerChunk = handlerChunks[0];   // e.g. server/chunks/handler-abc.js
const utilsChunk   = utilsChunks[0];     // e.g. server/chunks/chunks/utils.js-xyz.js

// ── Save originals so we can restore after bundling ──────────────────────────
const origHandler = readOut(handlerChunk);
const origUtils   = readOut(utilsChunk);
const origIndex   = readOut('index.js');
const origEnv     = readOut('env.js');

// ── Patch 1: handler chunk — `await server.init({...})` ──────────────────────
// Wrap in async IIFE, store promise on globalThis so index.js can await it
// without a named import (esbuild may rename exported variables).
if (!/^await server\.init\b/m.test(origHandler)) {
  throw new Error('bundle-cjs: `await server.init` not found in handler chunk — adapter-node may have changed');
}
const patchedHandler = origHandler.replace(
  /^(await server\.init\(\{)([\s\S]*?)(\}\);)$/m,
  'globalThis.__btInitPromise = (async () => { await server.init({$2$3 })();'
);
writeOut(handlerChunk, patchedHandler);

// ── Patch 2: index.js — `await rm(path)` inside module-scope else{} ──────────
// Wrap the entire `if (socket_activation) { ... } else { ... }` block in an
// async IIFE that first awaits globalThis.__btInitPromise.
let patchedIndex = origIndex;

const listenBlockRe = /^(if \(socket_activation\) \{[\s\S]+?^\})\n/m;
if (!listenBlockRe.test(patchedIndex)) {
  writeOut(handlerChunk, origHandler);
  throw new Error('bundle-cjs: socket_activation block not found in index.js — adapter-node may have changed');
}
patchedIndex = patchedIndex.replace(
  listenBlockRe,
  (_, block) => `(async () => {\n  await globalThis.__btInitPromise;\n${block}\n})();\n`
);
writeOut('index.js', patchedIndex);

// ── Patch 3: utils.js — `await import(...)` in module-scope try{} ────────────
// This is a dev-only stack-trace helper that only appears when the app is built
// with dev=true. In CJS, require() is synchronous — replace the dynamic imports.
// When absent (production build without dev=true), skip silently.
const dynamicImportTryBlock =
  /^try \{\n\tconst path = await import\('node:path'\);\n\tconst process = await import\('node:process'\);\n\trelative = \(file\) => path\.relative\(process\.cwd\(\), file\);\n\} catch \{\}/m;

if (dynamicImportTryBlock.test(origUtils)) {
  const patchedUtils = origUtils.replace(
    dynamicImportTryBlock,
    `try {\n\tconst path = require('node:path');\n\tconst process = require('node:process');\n\trelative = (file) => path.relative(process.cwd(), file);\n} catch {}`
  );
  writeOut(utilsChunk, patchedUtils);
}
// (if the block is absent, origUtils is used as-is — no write needed)

// ── Patch 4: env.js — `fileURLToPath(import.meta.url)` → `__filename` ────────
// In CJS, __dirname is the directory of the current file — exactly what
// env.js wants. Replace the ESM-only pattern directly.
if (!/fileURLToPath\(import\.meta\.url\)/.test(origEnv)) {
  throw new Error('bundle-cjs: fileURLToPath(import.meta.url) not found in env.js — adapter-node may have changed');
}
const patchedEnv = origEnv
  .replace(`import { fileURLToPath } from 'node:url';\n`, '')
  .replace('path.dirname(fileURLToPath(import.meta.url))', '__dirname');
writeOut('env.js', patchedEnv);

// ── esbuild: bundle everything to CJS ────────────────────────────────────────
console.log('[bt-build-ipad] bundling to server.cjs …');
let buildError;
try {
  await build({
    entryPoints: [resolve(out, 'index.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: resolve(out, 'server.cjs'),
    // Resolve node_modules from the consumer's project root, not the script dir.
    absWorkingDir: process.cwd(),
    // Bundle node-fetch + node:stream/web globals into the output so vm2
    // gets Request, Response, Headers, FormData, ReadableStream etc.
    inject: [resolve(__dirname, 'web-globals-shim.mjs')],
    external: [
      // Keep true OS-level builtins external — vm2 provides these as globals
      // or allows require() for them. Do NOT include process/buffer/timers/etc
      // here — vm2 blocks require() for those, so we bundle them in instead.
      'fs', 'path', 'os', 'crypto', 'http', 'https', 'url',
      'stream', 'util', 'events', 'net', 'tls',
      'child_process', 'worker_threads', 'perf_hooks', 'async_hooks',
      'readline', 'querystring', 'string_decoder', 'zlib', 'vm',
      'assert', 'constants', 'domain', 'punycode', 'sys', 'tty',
      'dgram', 'dns', 'http2', 'https', 'inspector', 'module',
      'repl', 'v8', 'wasi',
    ],
    logLevel: 'info',
  });
} catch (e) {
  buildError = e;
}

// ── Restore patched files ─────────────────────────────────────────────────────
writeOut(handlerChunk, origHandler);
writeOut('index.js',   origIndex);
writeOut(utilsChunk,   origUtils);
writeOut('env.js',     origEnv);

if (buildError) throw buildError;

// ── Patch 5: Unicode property regexes in server.cjs ──────────────────────────
// Node.js Lab's V8 doesn't support \p{} Unicode property escapes in regexes.
// These come from the `marked` Markdown parser. Replace with ASCII-range
// equivalents (sufficient for this Latin-script compendium).
const ASCII_PUNCT = '!"#$%&\'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~';

let cjsBundle = readOut('server.cjs');

// Replace all \p{} patterns by doing a targeted string scan
// (regex-on-regex is fragile due to escaping; use direct string replacement)
const unicodeReplacements = [
  [ String.raw`/[\p{L}\p{N}]/u`,                   `/[\\w\\u00C0-\\u024F]/`            ],
  [ String.raw`/[\p{P}\p{S}]/u`,                   `/[${ASCII_PUNCT}]/`                ],
  [ String.raw`/[\s\p{P}\p{S}]/u`,                 `/[\\s${ASCII_PUNCT}]/`             ],
  [ String.raw`/[^\s\p{P}\p{S}]/u`,                `/[^\\s${ASCII_PUNCT}]/`            ],
  [ String.raw`/(?!~)[\p{P}\p{S}]/u`,              `/(?!~)[${ASCII_PUNCT}]/`           ],
  [ String.raw`/(?!~)[\s\p{P}\p{S}]/u`,            `/(?!~)[\\s${ASCII_PUNCT}]/`        ],
  [ String.raw`/(?:[^\s\p{P}\p{S}]|~)/u`,          `/(?:[^\\s${ASCII_PUNCT}]|~)/`      ],
];

for (const [from, to] of unicodeReplacements) {
  cjsBundle = cjsBundle.split(from).join(to);
}

const remaining = cjsBundle.match(/\\p\{[A-Z]\}/g);
if (remaining) {
  throw new Error(`bundle-cjs: Unicode property regexes not fully patched: ${[...new Set(remaining)].join(', ')}`);
}

// ── Patch 6: dynamic import("node:async_hooks") in SvelteKit internals ───────
// vm2 (used by Node.js Lab) throws synchronously on dynamic import(), so
// .catch() doesn't help. Replace with a synchronous require() in try/catch.
cjsBundle = cjsBundle.replace(
  `import("node:async_hooks").then((hooks) => als2 = new hooks.AsyncLocalStorage()).catch(() => {\n    });`,
  `try { als2 = new (require("node:async_hooks").AsyncLocalStorage)(); } catch (_) {}`
);

// ── Patch 7: inject BUNNYTRAIL_WORLD_DIR at bundle top ───────────────────────
// When run as server.cjs, __dirname is ipad-build/. Content lives one level
// up at the repo root. Set BUNNYTRAIL_WORLD_DIR early so globals.js resolves
// content/, content_meta/, and assets/ correctly regardless of cwd().
const worldDirInjection = [
  `"use strict";`,
  `if (typeof TextEncoder === 'undefined') { const u = require('node:util'); globalThis.TextEncoder = u.TextEncoder; globalThis.TextDecoder = u.TextDecoder; }`,
  `if (typeof URL === 'undefined') { const u = require('node:url'); globalThis.URL = u.URL; globalThis.URLSearchParams = u.URLSearchParams; }`,
  `if (typeof crypto === 'undefined') { globalThis.crypto = require('node:crypto').webcrypto; }`,
  `if (typeof btoa === 'undefined') { globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64'); globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary'); }`,
  `if (typeof Blob === 'undefined') { globalThis.Blob = require('buffer').Blob; }`,
  // vm2's process object may lack stdout/stderr — add safe stubs
  `if (process && !process.stdout) { process.stdout = { isTTY: false, write: () => {} }; process.stderr = { isTTY: false, write: () => {} }; }`,
  `if (!process.env.BUNNYTRAIL_WORLD_DIR) { process.env.BUNNYTRAIL_WORLD_DIR = require("path").resolve(__dirname, ".."); }`,
  `if (!process.env.ORIGIN) process.env.ORIGIN = "http://localhost:3000";`,
  ``,
].join('\n');
cjsBundle = cjsBundle.replace(`"use strict";`, worldDirInjection);

// ── Patch 8: disable file watcher in CJS bundle ───────────────────────────────
// vm2 (Node.js Lab's sandbox) can't proxy classes that inherit from native
// Node streams. chokidar's readdirp uses ReaddirpStream extends Readable,
// which breaks inside vm2. Since we can't fix vm2, stub out startWatcher()
// so the server boots and loads content without crashing on the watcher.
// Content still loads correctly on boot; just no live reload on iPad.
cjsBundle = cjsBundle.replace(
  'function startWatcher() {\n  if (started) return;\n  started = true;',
  'function startWatcher() {\n  return; /* disabled in CJS bundle: vm2 cannot proxy native stream subclasses */\n  if (started) return;\n  started = true;'
);

// ── Patch 9: trigger hooks module import eagerly before listening ─────────────
// bootPromise (graph.load) lives inside a lazy __esm block that only runs
// when get_hooks() is first called — which SvelteKit does on the first request.
// Call get_hooks() in the startup IIFE so the graph starts loading in parallel
// with server setup, and await the result so "Listening" only prints once
// the graph is fully ready.
cjsBundle = cjsBundle.replace(
  `(async () => {\n  await globalThis.__btInitPromise;`,
  `(async () => {\n  await globalThis.__btInitPromise;\n  await get_hooks().then(h => h.init?.());`
);

// ── Patch 10: debug logging on Bad Request ────────────────────────────────────
// Log the actual error from getRequest() so we can see why it throws on iPad.
cjsBundle = cjsBundle.replace(
  `  } catch {\n    res.statusCode = 400;\n    res.end("Bad Request");\n    return;\n  }`,
  `  } catch (e) {\n    console.error("[bt-debug] getRequest failed:", e?.message || e, "url:", req.url, "host:", req.headers?.host, "origin:", origin);\n    res.statusCode = 400;\n    res.end("Bad Request");\n    return;\n  }`
);

// ── Patch 11: remove AbortController from getRequest ─────────────────────────
// node-fetch's Request validates signal instanceof AbortSignal|EventTarget.
// vm2 strips both from the sandbox so our polyfill can't pass the check.
// The signal is only used to abort request body streams on disconnect —
// irrelevant for a local SSR server. Remove it entirely.
cjsBundle = cjsBundle.replace(
  `  const controller2 = new AbortController();\n  let errored = false;\n  let end_emitted = false;\n  request.once("error", () => errored = true);\n  request.once("end", () => end_emitted = true);\n  request.once("close", () => {\n    if ((errored || request.destroyed) && !end_emitted) {\n      controller2.abort();\n    }\n  });\n  return new Request(base2 + request.url, {\n    // @ts-expect-error\n    duplex: "half",\n    method: request.method,\n    headers: Object.entries(headers2),\n    signal: controller2.signal,`,
  `  return new Request(base2 + request.url, {\n    // @ts-expect-error\n    duplex: "half",\n    method: request.method,\n    headers: Object.entries(headers2),`
);

// ── Patch 12: generate_nonce — use randomBytes instead of crypto.getRandomValues
// vm2 proxies Uint8Array instances and they lose their typed-array identity
// when passed to native crypto.getRandomValues(). Use Node's require('crypto')
// randomBytes instead, which works fine through vm2.
cjsBundle = cjsBundle.replace(
  `function generate_nonce() {\n  crypto.getRandomValues(array);\n  return btoa(String.fromCharCode(...array));\n}`,
  `function generate_nonce() {\n  const _arr = require('crypto').randomBytes(16);\n  return btoa(String.fromCharCode(..._arr));\n}`
);

// ── Patch 13: setResponse — handle vm2 cross-boundary chunk conversion ────────
// node-fetch's Response.body is a Node Readable (EventEmitter with .pipe),
// not a Web ReadableStream — it has no .getReader(). It emits Uint8Array chunks.
// When piped to res (a host-context ServerResponse) via vm2's bridge, the Uint8Array
// chunks arrive in host context as plain proxied Objects. Node's res.write() rejects
// them ("chunk must be string or Buffer or Uint8Array") and falls back to toString(),
// producing comma-separated decimal numbers ("60,33,100,...") instead of HTML.
// Fix: use a manual data/end handler instead of .pipe(), and convert each chunk to
// a string via TextDecoder (available in sandbox via Patch 7's globalThis injection).
// TextDecoder.decode() also rejects vm2-proxied TypedArrays, so we must first spread
// the chunk into a real Uint8Array using Uint8Array.from(Array.from(chunk)).
//
// The noop function name (noop4/noop5/...) varies with esbuild output. Normalise it
// to a stable placeholder before matching, then restore it after.
{
  const noopMatch = cjsBundle.match(/reader\.cancel\(error2\)\.catch\((noop\d+)\)/);
  const noopName = noopMatch ? noopMatch[1] : 'noop5';
  const target = `  const reader = response.body.getReader();\n  if (res.destroyed) {\n    void reader.cancel();\n    return;\n  }\n  const cancel = (error2) => {\n    res.off("close", cancel);\n    res.off("error", cancel);\n    reader.cancel(error2).catch(${noopName});\n    if (error2) res.destroy(error2);\n  };\n  res.on("close", cancel);\n  res.on("error", cancel);\n  void next2();\n  async function next2() {\n    try {\n      for (; ; ) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        if (!res.write(value)) {\n          res.once("drain", next2);\n          return;\n        }\n      }\n      res.end();\n    } catch (error2) {\n      cancel(error2 instanceof Error ? error2 : new Error(String(error2)));\n    }\n  }`;
  cjsBundle = cjsBundle.replace(
    target,
    `  // [bundle-cjs] Patch 13: manual pipe with chunk conversion for vm2 compatibility.\n  // response.body is a node-fetch Node Readable (no getReader). Chunks are Uint8Array\n  // but arrive at res.write() as vm2-proxied plain Objects. Convert via Uint8Array.from\n  // + TextDecoder so they cross the vm2→host boundary as plain UTF-8 strings.\n  const body = response.body;\n  const _bodyDec = new TextDecoder();\n  const _writeChunk = (chunk) => {\n    try {\n      const u = Uint8Array.from(Array.from(chunk));\n      const s = _bodyDec.decode(u, {stream: true});\n      if (s) res.write(s);\n    } catch(_) {\n      // fallback: try writing directly\n      if (chunk) try { res.write(chunk); } catch(__) {}\n    }\n  };\n  if (res.destroyed) { body.destroy?.(); return; }\n  body.on('error', (e) => res.destroy(e));\n  body.on('data', _writeChunk);\n  body.on('end', () => { const _tail = _bodyDec.decode(); if (_tail) res.write(_tail); res.end(); });`
  );
  if (!cjsBundle.includes('_bodyDec')) throw new Error('bundle-cjs: Patch 13 (setResponse) did not apply — esbuild output may have changed');
}

// ── Patch 14: strip node: prefix and fix vm2-incompatible requires ───────────
// vm2 doesn't recognise the `node:` protocol prefix on builtin module names.
cjsBundle = cjsBundle.replaceAll(`require("node:`, `require("`);
// vm2 provides process/buffer/timers as globals but blocks require() for them.
// Replace bare requires with references to the globals directly.
cjsBundle = cjsBundle
  .replaceAll(`require("process")`, `process`)
  .replaceAll(`require("buffer")`, `require("buffer")`) // keep — vm2 allows this
  .replaceAll(`require("timers")`, `({ setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate })`);

// ── Patch 15: remove SIGTERM/SIGINT listeners — vm2 blocks them ──────────────
cjsBundle = cjsBundle
  .replace(`import_node_process3.default.on("SIGTERM", graceful_shutdown);\nimport_node_process3.default.on("SIGINT", graceful_shutdown);`,
           `/* [bundle-cjs] SIGTERM/SIGINT listeners removed — vm2 blocks signal listeners */`);

// ── Patch 16: make_trackable — return raw URL, skip all Object.defineProperty ─
// SvelteKit's make_trackable() wraps a URL in property overrides and a searchParams
// Proxy to fire reactive tracking callbacks on access. Inside vm2, the `tracked`
// URL is a host-context native URL that vm2 wraps in a Proxy; vm2's defineProperty
// trap blocks ALL Object.defineProperty calls on it (returns falsish → TypeError).
// On SSR the reactive callbacks have no effect. Fix: replace the function body so
// it just returns a plain `new URL(url)` directly, skipping every defineProperty.
cjsBundle = cjsBundle.replace(
  `function make_trackable(url, callback, search_params_callback, allow_hash = false) {\n  const tracked = new URL(url);\n  Object.defineProperty(tracked, "searchParams", {\n    value: new Proxy(tracked.searchParams, { get(obj, key2) {\n      if (key2 === "get" || key2 === "getAll" || key2 === "has") return (param, ...rest) => {\n        search_params_callback(param);\n        return obj[key2](param, ...rest);\n      };\n      callback();\n      const value = Reflect.get(obj, key2);\n      return typeof value === "function" ? value.bind(obj) : value;\n    } }),\n    enumerable: true,\n    configurable: true\n  });\n  const tracked_url_properties = [\n    "href",\n    "pathname",\n    "search",\n    "toString",\n    "toJSON"\n  ];\n  if (allow_hash) tracked_url_properties.push("hash");\n  for (const property of tracked_url_properties) Object.defineProperty(tracked, property, {\n    get() {\n      callback();\n      return url[property];\n    },\n    enumerable: true,\n    configurable: true\n  });\n  tracked[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = (_depth, opts, inspect) => {\n    return inspect(url, opts);\n  };\n  tracked.searchParams[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = (_depth, opts, inspect) => {\n    return inspect(url.searchParams, opts);\n  };\n  if (!allow_hash) disable_hash(tracked);\n  return tracked;\n}`,
  `function make_trackable(url, callback, search_params_callback, allow_hash = false) {\n  // [bundle-cjs] Patch 16: skip all Object.defineProperty overrides.\n  // vm2 wraps native URL objects in a proxy that blocks defineProperty.\n  // On SSR the tracking callbacks are no-ops. Return the raw URL directly.\n  return new URL(url);\n}`
);

// ── Patch 17: node-fetch Headers constructor Proxy — fix default Reflect.get ──
// The Proxy returned from the Headers constructor intercepts property access.
// The `default` case: `Reflect.get(target, p, receiver)` returns native
// URLSearchParams methods with the vm2-bridge receiver, which fails Node's
// internal type check (ERR_INVALID_THIS) when the method is called.
// Fix: bind returned functions to `target` (the real URLSearchParams), not receiver.
cjsBundle = cjsBundle.replace(
  `              default:\n                return Reflect.get(target, p, receiver);\n            }\n          }\n        });`,
  `              default: {\n                // [bundle-cjs] Patch 17: bind to target, not receiver — vm2 bridge\n                // proxies the receiver and native URLSearchParams methods reject it.\n                const val = Reflect.get(target, p, target);\n                return typeof val === 'function' ? val.bind(target) : val;\n              }\n            }\n          }\n        });`
);

// ── Patch 18: skip SvelteKit's console.warn monkey-patch ─────────────────────
// SvelteKit assigns console.warn = ... to suppress prop warnings. vm2 proxies
// the console object and blocks property assignment. Safe to skip — it's just
// a noise-reduction patch, not load-critical.
cjsBundle = cjsBundle.replace(
  `      const console_warn = console.warn;\n      console.warn = function warn(...args) {\n        if (args.length === 1 && /<(Layout|Page|Error)(_[\\w$]+)?> was created (with unknown|without expected) prop '(data|form)'/.test(args[0])) return;\n        console_warn(...args);\n      };`,
  `      // [bundle-cjs] Patch 18: skip console.warn monkey-patch — vm2 blocks assignment.`
);

// ── Patch 19: node-fetch Body constructor — handle vm2-proxied TypedArrays ───
// Inside vm2, Uint8Array instances fail host-context checks like ArrayBuffer.isView()
// and Buffer.isBuffer(). node-fetch's Body constructor falls through to the `else`
// branch which calls String(body) → Uint8Array.prototype.toString() →
// comma-separated decimal numbers. Fix: before the else-branch, add an explicit
// check for objects that have a `length` and numeric indexed properties (the shape
// of a vm2-proxied Uint8Array/Buffer), and convert them via Buffer.from(Array.from).
cjsBundle = cjsBundle.replace(
  `        } else {\n          body = import_node_buffer.Buffer.from(String(body));\n        }`,
  `        } else if (body !== null && typeof body === 'object' && typeof body.length === 'number' && body.length > 0 && typeof body[0] === 'number') {\n          // [bundle-cjs] Patch 19: vm2-proxied Uint8Array/Buffer — numeric keys + length but fails ArrayBuffer.isView.\n          const _arr = new Array(body.length);\n          for (let _i = 0; _i < body.length; _i++) _arr[_i] = body[_i];\n          body = import_node_buffer.Buffer.from(_arr);\n        } else {\n          body = import_node_buffer.Buffer.from(String(body));\n        }`
);

// ── Patch 20: live markdown swap middleware ───────────────────────────────────
// Intercepts requests for content entity paths at serve time. For each request:
//
//   1. If content/<path>/index.md exists on disk:
//      a. Parse the frontmatter (name, summary) and markdown body
//      b. Re-render the body with marked (no wikilink resolution — plain prose only)
//      c. If ipad-build/prerendered/<path>.html exists: load it and swap
//         title / h1 / subtitle / prose with fresh content, serve it
//      d. If no prerendered file (new entity added after build): load the
//         template entity HTML instead and do the same swap — sidebar will
//         show the template entity's data until the next full rebuild
//
//   2. Otherwise: call next() and fall through to the normal prerendered/SSR stack
//
// This gives instant page loads for all entities that existed at build time
// (pure static HTML + a cheap fs read + regex swap, no vm2 SSR overhead), while
// still serving new entities added on the iPad via the template fast-path.
//
// The template entity is foundation/fabric/phenomena/veil-collapse — a stable
// cosmological concept with a minimal sidebar (no relations, no tags).
//
// Limitations:
//   - Wikilinks in the body are NOT re-resolved. Links from the prerendered
//     version remain. Newly added wikilinks will render as plain text until
//     the next full rebuild (which re-resolves them into <a> tags).
//   - Sidebar content (relations, kind chip, tags) always reflects build-time
//     state. New relations / tag changes require a rebuild.
//   - New entity pages served via the template will have the template entity's
//     kind chip, breadcrumbs, and empty sidebar until rebuilt.

const LIVE_SWAP_MIDDLEWARE = `
(function () {
  'use strict';
  var _fs2 = require('fs');
  var _path2 = require('path');

  var _worldDir = process.env.BUNNYTRAIL_WORLD_DIR || _path2.resolve(__dirname, '..');
  var _contentDir = _path2.join(_worldDir, 'content');
  var _prerenderedDir = _path2.join(__dirname, 'prerendered');
  // Template entity: a stable minimal entity used for new (unbuilt) entities
  var _templatePath = _path2.join(_prerenderedDir, 'foundation', 'fabric', 'phenomena', 'veil-collapse.html');

  // ── B'': filesystem-backed wikilink suffix resolver ───────────────────────
  // The real engine resolves \`[[slug]]\` via graph.resolveLink (exact + suffix
  // match against all entity ids). The engine renderer is tree-shaken out of
  // this bundle, so we replicate the *global* branch of resolveWikilink
  // (src/lib/server/wikilinks.ts resolveGlobal) directly against the content
  // tree: every directory holding an index.md is an entity whose id mirrors its
  // path under content/. We walk it once, lazily, and cache.
  //
  //   exact id            → use it
  //   unique suffix match → use it   (covers bare \`[[naya]]\` + partial
  //                                    \`[[characters/freya]]\`)
  //   zero / ambiguous    → broken   (safe failure: we never guess wrong)
  //
  // Limitations vs the engine: cluster-local resolution (which can pick a
  // different in-cluster winner when a slug is globally ambiguous) is not
  // reproduced — we only do the global pass, so a globally-ambiguous slug
  // renders broken here even if it would have resolved cluster-locally.
  // Language-code tags are not indexed (they render broken). Kinds ARE indexed
  // (from each index.md \`kind:\` frontmatter) so the bt-link--kind-<kind>
  // theming hook matches the engine.
  var _entityIds = null;  // string[] of all entity ids, lazily built
  var _entityKind = null; // { [id]: kind } from frontmatter
  var _langCodes = null;  // { [code]: id } from \`kind: language\` + \`code:\` frontmatter
  function _ensureEntityIndex() {
    if (_entityIds) return _entityIds;
    var ids = [];
    var kinds = {};
    var langs = {};
    var stack = [''];
    while (stack.length) {
      var rel = stack.pop();
      var abs = rel ? _path2.join(_contentDir, rel) : _contentDir;
      var ents;
      try { ents = _fs2.readdirSync(abs, { withFileTypes: true }); } catch (_) { continue; }
      var hasIndex = false;
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (e.isDirectory()) {
          stack.push(rel ? rel + '/' + e.name : e.name);
        } else if (e.name === 'index.md') {
          hasIndex = true;
        }
      }
      if (hasIndex && rel) {
        ids.push(rel);
        try {
          var src = _fs2.readFileSync(_path2.join(abs, 'index.md'), 'utf8');
          var head = src.split(/\\n---/, 1)[0]; // frontmatter region
          var km = head.match(/^kind:\\s*(.+)$/m);
          var kind = km ? km[1].trim().replace(/^['"]|['"]$/g, '') : '';
          if (kind) kinds[rel] = kind;
          var cm = head.match(/^code:\\s*(.+)$/m);
          if (kind === 'language' && cm) {
            langs[cm[1].trim().replace(/^['"]|['"]$/g, '')] = rel;
          }
        } catch (_) {}
      }
    }
    _entityIds = ids;
    _entityKind = kinds;
    _langCodes = langs;
    return ids;
  }

  // Mirror resolveGlobal: exact, then unique suffix match. Returns the entity
  // id (which equals the URL path) or null when missing/ambiguous.
  function _resolveWikilinkTarget(rawPath) {
    var ids = _ensureEntityIndex();
    if (ids.indexOf(rawPath) !== -1) return rawPath;
    var suffix = '/' + rawPath;
    var match = null;
    for (var i = 0; i < ids.length; i++) {
      if (ids[i].length > suffix.length && ids[i].slice(-suffix.length) === suffix) {
        if (match !== null) return null; // ambiguous → broken
        match = ids[i];
      }
    }
    return match;
  }

  // Rewrite \`[[...]]\` into Markdown link syntax (or inline HTML for lang
  // tags) for marked to render. This ports the decision order of the engine's
  // rewriteBrackets (src/lib/server/markdown.ts) as closely as a graph-less
  // pass can: same step order, same broken-link sentinel, same lang-tag <sup>
  // markup. Resolution uses the FS suffix index instead of graph.resolveLink.
  //
  //   (0) [[#anchor|label]]            → same-page anchor
  //   (1) [[kinds/<id>|label]]         → /kinds/<id>
  //   (2) [[a/b/c|label]]              → path with slash → entity wikilink
  //   (3) [[xx]] where xx is a code:   → <sup class="lang-tag"> language tag
  //   (4) [[slug|label]] resolvable    → bare suffix-match wikilink
  //   (5) [[xx]] code-shape but unknown→ broken lang tag
  //   (6) [[slug]] sluglike unresolved → broken wikilink (loud)
  //   collection: directive            → left verbatim (needs the graph)
  function _rewriteWikilinks(text) {
    _ensureEntityIndex();
    var wikiPath = /^[a-z][a-z0-9-]*(?:\\/[a-z0-9-]+)+$/;
    var slugOnly = /^[a-z][a-z0-9-]*$/;
    var langShape = /^[a-z]{2,8}$/;
    var anchorFrag = /^[a-z0-9][a-z0-9-]*$/;

    return text.replace(/\\[\\[([^\\]|]+?)(?:\\|([^\\]]+))?\\]\\]/g, function (whole, inner, label) {
      if (inner.indexOf('collection:') === 0) return whole;

      var hashIdx = inner.indexOf('#');
      var path = hashIdx >= 0 ? inner.slice(0, hashIdx) : inner;
      var anchor = hashIdx >= 0 ? inner.slice(hashIdx + 1) : '';
      var anchorSuffix = anchor && anchorFrag.test(anchor) ? '#' + anchor : '';

      function fallbackLabel(forPath) {
        var slug = forPath.slice(forPath.lastIndexOf('/') + 1);
        return slug.replace(/-/g, ' ') || anchor.replace(/-/g, ' ');
      }
      function renderWikilink(forPath) {
        var textOut = label != null ? label : fallbackLabel(forPath);
        var resolved = _resolveWikilinkTarget(forPath);
        if (resolved) return '[' + textOut + '](/' + resolved + anchorSuffix + ')';
        return '[' + textOut + '](/' + forPath + anchorSuffix + ' "broken-link")';
      }

      // (0) same-page anchor
      if (path === '' && anchor) {
        var t0 = label != null ? label : anchor.replace(/-/g, ' ');
        if (!anchorSuffix) return '[' + t0 + '](/' + path + ' "broken-link")';
        return '[' + t0 + '](' + anchorSuffix + ')';
      }
      // (1) kinds/<id>
      if (path.indexOf('kinds/') === 0) {
        var kindId = path.slice('kinds/'.length);
        var lastSeg = kindId.split('/').pop() || '';
        if (kindId && slugOnly.test(lastSeg)) {
          var tk = label != null ? label : fallbackLabel(kindId);
          // We don't index the kind registry; assume valid (matches the common
          // case). Broken kind links are rare and a rebuild will flag them.
          return '[' + tk + '](/kinds/' + kindId + anchorSuffix + ')';
        }
      }
      // (2) path with slash → entity wikilink
      if (wikiPath.test(path)) return renderWikilink(path);
      // (3) lang-code shape, no anchor, registered → lang tag
      if (!anchor && langShape.test(inner) && _langCodes[inner]) {
        return '<sup class="lang-tag"><a href="/' + _langCodes[inner] +
          '" title="language: ' + inner + '">' + inner + '</a></sup>';
      }
      // (4) sluglike + resolvable → bare wikilink
      if (slugOnly.test(path) && _resolveWikilinkTarget(path)) return renderWikilink(path);
      // (5) lang-code shape but unknown → broken lang tag
      if (!anchor && langShape.test(inner)) {
        return '<sup class="lang-tag" data-broken="true" title="unknown language code: ' +
          inner + '">' + inner + '</sup>';
      }
      // (6) sluglike but unresolved → broken wikilink (loud)
      if (slugOnly.test(path)) return renderWikilink(path);
      // anything else — leave as-is
      return whole;
    });
  }

  // Post-marked pass: convert the \`title="broken-link"\` sentinel into
  // \`data-broken="true"\` and attach the engine's per-wikilink theming hooks
  // (\`class="bt-link"\`, \`data-bt-slug\`, and \`data-bt-kind\` +
  // \`bt-link--kind-<kind>\` when the resolved id has a known kind).
  // Mirrors decorateEntityLinks.
  function _decorateLinks(html) {
    _ensureEntityIndex();
    return html.replace(
      /<a href="(\\/[^"#]*)(#[^"]*)?"( title="broken-link")?>/g,
      function (whole, href, anchor, brokenAttr) {
        var path = href.slice(1);
        var slug = path.slice(path.lastIndexOf('/') + 1);
        var isEngineRoute = path.indexOf('kinds/') === 0;
        var classes = ['bt-link'];
        var attrs = '';
        if (!isEngineRoute) {
          if (slug) attrs += ' data-bt-slug="' + slug + '"';
          var kind = _entityKind && _entityKind[path];
          if (kind) {
            attrs += ' data-bt-kind="' + kind + '"';
            classes.push('bt-link--kind-' + kind);
          }
        }
        if (brokenAttr) attrs += ' data-broken="true"';
        return '<a href="' + href + (anchor || '') + '" class="' + classes.join(' ') + '"' + attrs + '>';
      }
    );
  }

  function _parseFrontmatter(src) {
    // Normalise line endings (iOS git checkouts may have CRLF)
    var s = src.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').replace(/^\\uFEFF/, '');
    var m = s.match(/^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$/);
    if (!m) return { name: '', summary: '', body: s };
    var yaml = m[1], body = m[2].trim();
    var name = '', summary = '';
    var nameM = yaml.match(/^name:\\s*(.+)$/m);
    if (nameM) name = nameM[1].trim().replace(/^['"]|['"]$/g, '');
    // summary may be multiline (block scalar) or inline
    var summaryM = yaml.match(/^summary:\\s*>?-?\\s*\\n((?:[ \\t]+.+\\n?)+)/m);
    if (summaryM) {
      summary = summaryM[1].replace(/^[ \\t]+/gm, '').trim();
    } else {
      var inlineM = yaml.match(/^summary:\\s*(.+)$/m);
      if (inlineM) summary = inlineM[1].trim().replace(/^['"]|['"]$/g, '');
    }
    return { name: name, summary: summary, body: body };
  }

  function _renderMarkdown(text) {
    // B'': resolve wikilinks against the content tree before marked runs, so
    // live-edited \`[[slug]]\` prose links work (bare slugs + partial paths via
    // suffix match). See _rewriteWikilinks / _resolveWikilinkTarget above.
    var pre = _rewriteWikilinks(text);
    // Use the bundle's own marked function (declared in the same CJS scope).
    // By the time any request arrives, all __esm blocks have initialized via
    // Patch 9's get_hooks() call, so marked/markedInstance are ready.
    try { return _decorateLinks(marked(pre, { async: false })); } catch (_) {}
    // Fallback: wrap in a paragraph if marked not yet available
    return '<p>' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</p>';
  }

  function _renderInline(text) {
    var pre = _rewriteWikilinks(text);
    try { return _decorateLinks(marked.parseInline(pre, { async: false })); } catch (_) {}
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  }

  function _escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _swapHtml(html, name, summaryHtml, bodyHtml) {
    // 1. <title>
    html = html.replace(/<title>[^<]*<\\/title>/, '<title>' + _escapeHtml(name) + ' \\u00b7 Alteria</title>');

    // 2. <h1 ...> ... </h1>  — replace inner content, preserve tag + attributes
    html = html.replace(/(<h1[^>]*>)[\\s\\S]*?(<\\/h1>)/, '$1' + _escapeHtml(name) + '$2');

    // 3. <p class="subtitle ..."> ... </p>  — replace or remove
    var hasSubtitle = /<p class="subtitle[^"]*"/.test(html);
    if (summaryHtml && summaryHtml.trim()) {
      if (hasSubtitle) {
        html = html.replace(/(<p class="subtitle[^"]*">)[\\s\\S]*?(<\\/p>)/, '$1' + summaryHtml + '$2');
      } else {
        // insert subtitle after closing </header>
        html = html.replace('</header>', '</header><p class="subtitle">' + summaryHtml + '</p>');
      }
    } else if (hasSubtitle) {
      html = html.replace(/<p class="subtitle[^"]*">[\\s\\S]*?<\\/p>/, '');
    }

    // 4. Prose body — from after class="prose ..." opening Svelte comment(s)
    //    to one of: <hr class="prose-end">, <section class="chapters">,
    //    <section class="children">, the prose </div> that opens the sidebar
    //    (</div> <aside class="sidebar), or the Svelte cleanup tail.
    //    NB: Svelte emits an empty \`<!---->\` (zero chars) right after the
    //    opening tag, plus more \`<!---->\` between paragraphs. The opener match
    //    must consume the *leading* comment run (\`[\\w-]*\` incl. empty, repeated)
    //    so proseTagEnd lands on real content — otherwise the end-heuristic's
    //    \`indexOf('<!---->')\` matches the opener at position 0 and the original
    //    prose is duplicated instead of replaced.
    var proseMatch = html.match(/(class="prose [^"]*">)((?:<!--[\\w-]*-->\\s*)*)/);
    if (proseMatch) {
      var proseTagEnd = html.indexOf(proseMatch[0]) + proseMatch[0].length;
      var tail = html.slice(proseTagEnd);
      // Find the end of the body section
      var endIdx = -1;
      var endMarkers = [
        '<hr class="prose-end',
        '<section class="chapters',
        '<section class="children',
        '</div> <aside class="sidebar',
      ];
      for (var i = 0; i < endMarkers.length; i++) {
        var idx = tail.indexOf(endMarkers[i]);
        if (idx >= 0 && (endIdx < 0 || idx < endIdx)) endIdx = idx;
      }
      if (endIdx < 0) {
        // No structural sections — body ends before the Svelte cleanup comments
        // Pattern: content <!----> <!--[-1--><!--]--> ... </div>
        var cleanupIdx = tail.indexOf('<!---->', 0);
        if (cleanupIdx >= 0) endIdx = cleanupIdx;
      }
      if (endIdx >= 0) {
        html = html.slice(0, proseTagEnd) + bodyHtml + '\\n' + tail.slice(endIdx);
      }
    }

    // 5. Strip the SvelteKit hydration bootstrap.
    //    The prerendered page ships an inline <script> that runs kit.start()
    //    with a build-time \`data:[...]\` payload. On a live-swapped page the DOM
    //    no longer matches that payload, so the client reconciler throws
    //    hydration_mismatch on every (re)load. Since the iPad build is a
    //    read-only static notebook, we drop the whole bootstrap: no client JS
    //    boots, nothing hydrates, no mismatch. Client-side nav / search /
    //    lightboxes become inert on swapped pages (plain links full-reload),
    //    which is the intended lightweight trade-off.
    //    Match any inline <script> whose body invokes kit.start( — that is the
    //    SvelteKit start block and nothing else in these pages.
    html = html.replace(/<script>(?:(?!<\\/script>)[\\s\\S])*?kit\\.start\\((?:(?!<\\/script>)[\\s\\S])*?<\\/script>/g, '');

    return html;
  }

  globalThis.__btLiveSwap = function (req, res, next) {
    var pathname;
    try {
      pathname = decodeURIComponent(req.url.split('?')[0]);
    } catch (_) {
      return next();
    }

    // SvelteKit client-side navigations set x-sveltekit-pathname on the fetch
    // request. For those we skip the swap and let SSR handle it — the swap is
    // only for full browser navigations where the static HTML is the response.
    if (req.headers && req.headers['x-sveltekit-pathname']) {
      return next();
    }

    // Skip non-entity paths
    if (!pathname || pathname === '/'
        || pathname.startsWith('/_app')
        || pathname.startsWith('/api')
        || /\\.[a-zA-Z0-9]+$/.test(pathname)  // has file extension
        || pathname.startsWith('/kinds')
        || pathname.startsWith('/blog')
        || pathname.startsWith('/guides')
        || pathname.startsWith('/graph')
        || pathname.startsWith('/tags')
        || pathname.startsWith('/sources')
        || pathname.startsWith('/relations')
        || pathname.startsWith('/properties')
        || pathname.startsWith('/influences')
        || pathname.startsWith('/symbology')
        || pathname.startsWith('/health')
    ) {
      return next();
    }

    // Map URL path to content file: /aurethia/nature/beings/nguwari → content/aurethia/nature/beings/nguwari/index.md
    var entityPath = pathname.replace(/^\\//, '');
    var contentFile = _path2.join(_worldDir, 'content', entityPath, 'index.md');

    if (!_fs2.existsSync(contentFile)) {
      return next(); // not a content entity — fall through to prerendered/SSR
    }

    var src;
    try { src = _fs2.readFileSync(contentFile, 'utf8'); } catch (_) { return next(); }

    var fm = _parseFrontmatter(src);
    if (!fm.name) return next(); // no name = not a valid entity

    var bodyHtml = _renderMarkdown(fm.body);
    var summaryHtml = fm.summary ? _renderInline(fm.summary) : '';

    // Find prerendered HTML or fall back to template
    var htmlFile = _path2.join(_prerenderedDir, entityPath + '.html');
    var isTemplate = false;
    if (!_fs2.existsSync(htmlFile)) {
      htmlFile = _templatePath;
      isTemplate = true;
    }

    var html;
    try { html = _fs2.readFileSync(htmlFile, 'utf8'); } catch (_) { return next(); }

    // Skip redirect stubs (96-byte redirect pages)
    if (html.length < 500) return next();

    html = _swapHtml(html, fm.name, summaryHtml, bodyHtml);

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': isTemplate ? 'no-store' : 'public, max-age=0, must-revalidate',
    });
    res.end(html);
  };
})();
`;

// Inject the middleware code at the top (after the "use strict" injection)
// Use a replacer function to avoid $1/$2 in LIVE_SWAP_MIDDLEWARE being
// interpreted as regex capture-group back-references by String.replace().
const ORIGIN_LINE = `if (!process.env.ORIGIN) process.env.ORIGIN = "http://localhost:3000";\n\n`;
cjsBundle = cjsBundle.replace(ORIGIN_LINE, () => ORIGIN_LINE + LIVE_SWAP_MIDDLEWARE + '\n');

// Wire the middleware into the polka sequence array, before serve_prerendered.
// The path import alias (import_node_pathN) varies with each esbuild output —
// use a regex replace to match any numbered alias.
{
  const seqMatch = cjsBundle.match(
    /\[serve\((import_node_path\d+\.default\.join\(dir, "client"\)), true\), serve_prerendered\(\), ssr\]/
  );
  if (seqMatch) {
    cjsBundle = cjsBundle.replace(
      seqMatch[0],
      `[serve(${seqMatch[1]}, true), globalThis.__btLiveSwap, serve_prerendered(), ssr]`
    );
  } else {
    console.warn('[bt-build-ipad] WARNING: polka sequence array not found — live swap middleware not wired');
  }
}

// ── Verify critical patches applied ──────────────────────────────────────────
const _verifyPatches = {
  'Patch 13 (setResponse body)': '_bodyDec',
  'Patch 17 (Headers Proxy)': 'Patch 17: bind to target',
  'Patch 19 (Body Uint8Array)': 'Patch 19: vm2-proxied Uint8Array',
  'Patch 20 (live swap wired)': 'globalThis.__btLiveSwap, serve_prerendered',
  'Patch 20 (bootstrap strip)': 'kit\\.start\\(',
  'Patch 20 (wikilink resolve)': '_resolveWikilinkTarget',
};
let _patchFailed = false;
for (const [name, marker] of Object.entries(_verifyPatches)) {
  if (!cjsBundle.includes(marker)) {
    console.warn(`[bt-build-ipad] WARNING: ${name} did not apply — esbuild output may have changed`);
    _patchFailed = true;
  }
}
if (_patchFailed) console.warn('[bt-build-ipad] Some patches failed. SSR in vm2 may not work correctly.');

writeOut('server.cjs', cjsBundle);
console.log('[bt-build-ipad] done → server.cjs');

// ── ESM aliases for runtimes that support it (iSH, modern Node) ──────────────
writeOut('package.json', JSON.stringify({ type: 'module' }, null, 2));
renameSync(resolve(out, 'index.js'),   resolve(out, 'index.mjs'));
renameSync(resolve(out, 'handler.js'), resolve(out, 'handler.mjs'));
writeOut('run.cjs', `import('./index.mjs').catch(e => { console.error(e); process.exit(1); });\n`);
console.log('[bt-build-ipad] ESM entry → index.mjs');
