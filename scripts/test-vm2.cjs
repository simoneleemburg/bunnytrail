#!/usr/bin/env node
/**
 * scripts/test-vm2.cjs
 *
 * Runs <cwd>/ipad-build/server.cjs inside a vm2 NodeVM — same sandbox Node.js
 * Lab uses — then fires real HTTP requests and checks the responses.
 *
 * Usage (via `bunnytrail build-ipad --test`, or directly from the consumer repo):
 *   node /path/to/bunnytrail/scripts/test-vm2.cjs
 *
 * Must be run from the consumer's project root (process.cwd()), where
 * ipad-build/server.cjs exists.
 *
 * Expected output:
 *   [vm2-test] GET /        → 200  ✓
 *   [vm2-test] GET /earth   → 200  ✓
 *   [vm2-test] ALL PASSED
 *
 * iPad fidelity:
 *   Node.js Lab's vm2 does NOT strip Proxy from the sandbox (unlike vm2 ≥3.9.x
 *   on modern Node.js where setup-sandbox.js zeros it out as a security measure).
 *   We temporarily patch the local vm2 setup-sandbox.js to restore Proxy before
 *   running the test, then restore the original — so the local test exercises the
 *   same code paths the iPad hits.
 *
 * Dependency note:
 *   `vm2` is a **devDependency** of bunnytrail, not a regular dependency —
 *   it has a history of critical sandbox-escape advisories and this test is
 *   the only thing in the engine that ever loads it, so shipping it to every
 *   consumer's `npm install` just to support this one opt-in `--test` flag
 *   isn't worth the audit noise. If you're running this from a consumer
 *   project (rather than a bunnytrail dev checkout) and it can't find `vm2`,
 *   install it yourself first: `npm install vm2 --no-save`.
 */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const cwd = process.cwd();
const SERVER_CJS = path.join(cwd, 'ipad-build', 'server.cjs');

// Locate vm2 via require.resolve so it works whether it's hoisted or nested.
// vm2 is a devDependency (see note above), so it's only guaranteed to be
// present in a bunnytrail dev checkout — fail with a clear, actionable
// message rather than a raw MODULE_NOT_FOUND stack trace.
let vm2MainPath;
try {
	vm2MainPath = require.resolve('vm2');
} catch {
	console.error(
		'[vm2-test] could not find "vm2" — it is a devDependency of bunnytrail, ' +
			'not installed by default when bunnytrail is used as a dependency.\n' +
			'[vm2-test] install it locally to run this test: npm install vm2 --no-save'
	);
	process.exit(1);
}
const VM2_SETUP_SANDBOX = path.join(path.dirname(vm2MainPath), 'lib', 'setup-sandbox.js');

if (!fs.existsSync(SERVER_CJS)) {
	console.error(`[vm2-test] ${SERVER_CJS} not found — run "bunnytrail build-ipad" first`);
	process.exit(1);
}

// ── Temporarily patch vm2 to expose Proxy in the sandbox, matching iPad ──────
const origSandbox = fs.readFileSync(VM2_SETUP_SANDBOX, 'utf8');
const PROXY_STRIPPED = `\tProxy: { value: undefined },`;
const PROXY_RESTORED = `\tProxy: { value: LocalProxy, writable: true, configurable: true },`;

if (!origSandbox.includes(PROXY_STRIPPED)) {
	console.warn(
		'[vm2-test] warning: vm2 setup-sandbox.js does not contain expected Proxy line; skipping patch'
	);
} else {
	fs.writeFileSync(VM2_SETUP_SANDBOX, origSandbox.replace(PROXY_STRIPPED, PROXY_RESTORED));
}

// Clear vm2 from require cache so the patched version is loaded fresh
Object.keys(require.cache).forEach((k) => {
	if (k.includes('vm2')) delete require.cache[k];
});

// Use require.resolve to find vm2 regardless of hoisting
let vm;
try {
	const { NodeVM } = require('vm2');
	vm = new NodeVM({
		console: 'inherit',
		sandbox: {},
		require: {
			external: true,
			builtin: ['*'],
			root: cwd
		}
	});
} finally {
	if (origSandbox.includes(PROXY_STRIPPED)) {
		fs.writeFileSync(VM2_SETUP_SANDBOX, origSandbox);
	}
}

console.log('[vm2-test] starting server inside vm2 sandbox (Proxy restored to match iPad)…');

try {
	vm.runFile(SERVER_CJS);
} catch (e) {
	console.error('[vm2-test] server.cjs threw on load:', e.message);
	process.exit(1);
}

// Give the server a moment to boot and load the graph
setTimeout(async () => {
	const tests = [
		{ path: '/', expectStatus: 200, expectBody: '<!doctype' },
		{ path: '/kinds', expectStatus: 200, expectBody: '<!doctype' }
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			const { status, body } = await get(`http://localhost:3000${test.path}`);
			const bodyOk = body.toLowerCase().includes(test.expectBody);
			if (status === test.expectStatus && bodyOk) {
				console.log(`[vm2-test] GET ${test.path.padEnd(10)} → ${status}  ✓`);
				passed++;
			} else {
				console.error(
					`[vm2-test] GET ${test.path.padEnd(10)} → ${status} (expected ${test.expectStatus}), body ok: ${bodyOk}`
				);
				console.error(`[vm2-test] body preview: ${body.slice(0, 300)}`);
				failed++;
			}
		} catch (e) {
			console.error(`[vm2-test] GET ${test.path} threw:`, e.message);
			failed++;
		}
	}

	console.log(`\n[vm2-test] ${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}, 8000);

function get(url) {
	// Use raw TCP socket to bypass Node's HTTP agent keep-alive pooling.
	// The server runs in a vm2 sandbox whose HTTP handling can leave the socket
	// in unexpected states between requests; a fresh TCP connection each time
	// avoids HTTP parser contamination from prior responses.
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const net = require('net');
		const sock = net.connect(parseInt(parsed.port || '80'), parsed.hostname, () => {
			sock.write(
				`GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\n` +
					`Host: ${parsed.host}\r\n` +
					`Connection: close\r\n` +
					`\r\n`
			);
		});
		let raw = '';
		sock.setEncoding('utf8');
		sock.on('data', (c) => (raw += c));
		sock.on('end', () => {
			const headerEnd = raw.indexOf('\r\n\r\n');
			if (headerEnd === -1) return reject(new Error('No header/body separator in response'));
			const headerPart = raw.slice(0, headerEnd);
			const body = raw.slice(headerEnd + 4);
			const statusLine = headerPart.split('\r\n')[0];
			const statusMatch = statusLine.match(/HTTP\/[\d.]+\s+(\d+)/);
			const status = statusMatch ? parseInt(statusMatch[1]) : 0;
			resolve({ status, body });
		});
		sock.on('error', reject);
		sock.setTimeout(15000, () => {
			sock.destroy(new Error('timeout'));
		});
	});
}
