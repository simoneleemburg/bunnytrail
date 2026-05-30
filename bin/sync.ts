// `bunnytrail sync` — regenerates src/routes/ shims against the
// engine's current route surface. Overwrites blindly: shims are
// considered generated artifacts. Run from the world repo root.
//
// Run this after `npm update bunnytrail` if the engine added,
// renamed, or removed routes.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateShims } from './shims';

export async function sync(_argv: string[]): Promise<number> {
	const target = resolve('.');

	if (!existsSync(resolve(target, 'package.json'))) {
		console.error(`error: no package.json in ${target}; run from a world repo root`);
		return 1;
	}

	const shims = await generateShims({ targetDir: target, mode: 'consumer' });
	console.log(`bunnytrail sync → wrote ${shims.length} shim files under src/routes/`);
	return 0;
}
