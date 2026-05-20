import { describe, expect, it } from 'vitest';
import { inverseLabelFor } from './kindLinkLabels';

describe('inverseLabelFor', () => {
	it('returns the curated label for nativeBeings', () => {
		expect(inverseLabelFor('nativeBeings')).toBe('Native to');
	});

	it('falls back to humanising camelCase field names', () => {
		expect(inverseLabelFor('endemicTo')).toBe('Endemic to');
		expect(inverseLabelFor('manifestsAs')).toBe('Manifests as');
	});

	it('humanises kebab-case and snake_case', () => {
		expect(inverseLabelFor('manifests-as')).toBe('Manifests as');
		expect(inverseLabelFor('manifests_as')).toBe('Manifests as');
	});

	it('capitalises a single-word field name', () => {
		expect(inverseLabelFor('homes')).toBe('Homes');
	});
});
