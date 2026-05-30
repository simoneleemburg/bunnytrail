import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWorld } from './world';

let dir: string;
let path: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'bt-world-'));
	path = join(dir, 'world.md');
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('loadWorld', () => {
	it('falls back to Bunnytrail identity when file is missing', async () => {
		const r = await loadWorld(join(dir, 'missing.md'));
		expect(r.present).toBe(false);
		expect(r.config.name).toBe('Bunnytrail');
		expect(r.config.shortName).toBe('Bunnytrail');
		expect(r.config.allScopeLabel).toBe('All Bunnytrail');
		expect(r.config.tagline).toBe('');
		expect(r.ledeHtml).toBeNull();
		expect(r.issues).toHaveLength(0);
	});

	it('reads name + tagline + derives shortName/allScopeLabel', async () => {
		await writeFile(path, '---\nname: Alteria\ntagline: A sacred universe.\n---\n');
		const r = await loadWorld(path);
		expect(r.present).toBe(true);
		expect(r.config.name).toBe('Alteria');
		expect(r.config.tagline).toBe('A sacred universe.');
		expect(r.config.shortName).toBe('Alteria');
		expect(r.config.allScopeLabel).toBe('All Alteria');
		expect(r.ledeHtml).toBeNull();
		expect(r.issues).toHaveLength(0);
	});

	it('honours explicit shortName and allScopeLabel overrides', async () => {
		await writeFile(
			path,
			'---\nname: Alteria\nshortName: Alt\nallScopeLabel: Everything in Alteria\n---\n'
		);
		const r = await loadWorld(path);
		expect(r.config.shortName).toBe('Alt');
		expect(r.config.allScopeLabel).toBe('Everything in Alteria');
	});

	it('renders body prose into ledeHtml', async () => {
		await writeFile(path, '---\nname: Alteria\n---\n\nHello **world**.\n');
		const r = await loadWorld(path);
		expect(r.ledeHtml).toContain('<strong>world</strong>');
	});

	it('flags malformed yaml and falls back', async () => {
		await writeFile(path, '---\nname: [bad\n---\n');
		const r = await loadWorld(path);
		expect(r.present).toBe(true);
		expect(r.config.name).toBe('Bunnytrail');
		expect(r.issues.some((i) => i.kind === 'invalid-yaml')).toBe(true);
	});

	it('flags non-string field types', async () => {
		await writeFile(path, '---\nname: 42\n---\n');
		const r = await loadWorld(path);
		expect(r.config.name).toBe('Bunnytrail');
		expect(r.issues.some((i) => i.detail.includes('name must be a string'))).toBe(true);
	});

	it('handles a body-only file (no frontmatter)', async () => {
		await writeFile(path, 'Just some prose.\n');
		const r = await loadWorld(path);
		expect(r.present).toBe(true);
		expect(r.config.name).toBe('Bunnytrail');
		expect(r.ledeHtml).toContain('Just some prose.');
	});
});
