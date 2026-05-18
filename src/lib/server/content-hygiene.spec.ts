import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadAll } from './loader';

/**
 * Content-hygiene checks that run against the real `content/` tree.
 *
 * Editorial rule (see WORLDBUILDING.md): a `tags` value must not duplicate
 * the entity's `kind`. The kind is already surfaced by the loader and the
 * UI, so repeating it as a tag is noise and pollutes the tag rollup.
 */
describe('content hygiene', () => {
	it('no entity has a tag that duplicates its kind', async () => {
		const contentDir = resolve(process.cwd(), 'content');
		const { entities } = await loadAll(contentDir);

		const violations: { id: string; kind: string; tags: string[] }[] = [];
		for (const entity of entities.values()) {
			const kind = entity.meta.kind;
			const tags = entity.meta.tags ?? [];
			if (typeof kind === 'string' && tags.includes(kind)) {
				violations.push({ id: entity.id, kind, tags });
			}
		}

		if (violations.length > 0) {
			const detail = violations
				.map((v) => `  - ${v.id}: kind='${v.kind}', tags=[${v.tags.join(', ')}]`)
				.join('\n');
			throw new Error(
				`Found ${violations.length} entit${violations.length === 1 ? 'y' : 'ies'} ` +
					`with a tag duplicating its kind:\n${detail}`
			);
		}

		expect(violations).toEqual([]);
	});
});
