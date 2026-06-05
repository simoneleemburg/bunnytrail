#!/usr/bin/env node
// Engine-mode shim regenerator. Drops re-export files under
// src/routes/ that point at $lib/routes/. Wraps the shared generator
// in bin/shims.ts via tsx.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const result = spawnSync(
	'npx',
	[
		'tsx',
		'-e',
		"import('./bin/shims').then(m => m.generateShims({ targetDir: '.', mode: 'engine' }))"
	],
	{ cwd: root, stdio: 'inherit' }
);
process.exit(result.status ?? 1);
