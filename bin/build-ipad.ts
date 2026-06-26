import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = resolve(__dirname, '..', 'scripts');

/**
 * `bunnytrail build-ipad [--out-dir <dir>] [--test]`
 *
 * Post-processes the adapter-node output in <cwd>/ipad-build (or --out-dir)
 * into a single server.cjs suitable for Node.js Lab on iPad.
 *
 * --out-dir <dir>   Output directory from adapter-node (default: ipad-build)
 * --test            After bundling, run the vm2 smoke test
 */
export async function buildIpad(argv: string[]): Promise<number> {
	const runTest = argv.includes('--test');
	const bundleArgs = argv.filter((a) => a !== '--test');

	// Run bundle-cjs.mjs via node (it's plain ESM, no tsx needed)
	const bundleResult = spawnSync(
		'node',
		[resolve(scriptsDir, 'bundle-cjs.mjs'), ...bundleArgs],
		{ cwd: process.cwd(), stdio: 'inherit' }
	);

	if (bundleResult.status !== 0) {
		return bundleResult.status ?? 1;
	}

	if (runTest) {
		const testResult = spawnSync(
			'node',
			[resolve(scriptsDir, 'test-vm2.cjs')],
			{ cwd: process.cwd(), stdio: 'inherit' }
		);
		return testResult.status ?? 1;
	}

	return 0;
}
