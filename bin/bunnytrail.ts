#!/usr/bin/env tsx
// `bunnytrail` CLI dispatcher. Resolves the requested subcommand and
// forwards argv. New subcommands: drop a `bin/<name>.ts` exporting
// `run(argv: string[]): Promise<number>` and add the case below.
import { init } from './init';
import { sync } from './sync';
import { buildIpad } from './build-ipad';

const [, , cmd, ...rest] = process.argv;

async function main(): Promise<number> {
	switch (cmd) {
		case 'init':
			return init(rest);
		case 'sync':
			return sync(rest);
		case 'build-ipad':
			return buildIpad(rest);
		case undefined:
		case '-h':
		case '--help':
		case 'help':
			printHelp();
			return 0;
		default:
			console.error(`bunnytrail: unknown command "${cmd}"`);
			printHelp();
			return 1;
	}
}

function printHelp(): void {
	console.log(`bunnytrail — knowledge-graph engine

Usage:
  bunnytrail init [dir]          scaffold a new world repo in <dir> (default: .)
  bunnytrail sync                regenerate src/routes/ shims against the
                                 currently-installed engine version
  bunnytrail build-ipad          post-process adapter-node output into a
           [--out-dir <dir>]     single server.cjs for Node.js Lab on iPad
           [--test]              (--test also runs the vm2 smoke test)
  bunnytrail help                show this message`);
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error(err);
		process.exit(1);
	}
);
