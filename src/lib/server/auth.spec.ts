import { describe, it, expect } from 'vitest';
import { safeRedirectTarget } from './auth';

describe('safeRedirectTarget', () => {
	it('falls back to / for missing input', () => {
		expect(safeRedirectTarget(null)).toBe('/');
		expect(safeRedirectTarget(undefined)).toBe('/');
		expect(safeRedirectTarget('')).toBe('/');
	});

	it('preserves a same-origin internal path', () => {
		expect(safeRedirectTarget('/leemburg/verhalen/jan-arend-jr/1954')).toBe(
			'/leemburg/verhalen/jan-arend-jr/1954'
		);
	});

	it('preserves the query string of a target', () => {
		expect(safeRedirectTarget('/foo/bar?scope=all')).toBe('/foo/bar?scope=all');
	});

	it('rejects full URLs (open-redirect)', () => {
		expect(safeRedirectTarget('https://evil.com')).toBe('/');
		expect(safeRedirectTarget('http://evil.com/path')).toBe('/');
		expect(safeRedirectTarget('javascript:alert(1)')).toBe('/');
	});

	it('rejects protocol-relative targets', () => {
		expect(safeRedirectTarget('//evil.com')).toBe('/');
		expect(safeRedirectTarget('/\\evil.com')).toBe('/');
	});

	it('does not bounce back to the gate or auth endpoints (loop guard)', () => {
		expect(safeRedirectTarget('/login')).toBe('/');
		expect(safeRedirectTarget('/login?from=%2Ffoo')).toBe('/');
		expect(safeRedirectTarget('/api/auth/login')).toBe('/');
		expect(safeRedirectTarget('/api/auth/logout')).toBe('/');
	});

	it('rejects bare relative paths that are not absolute', () => {
		expect(safeRedirectTarget('foo/bar')).toBe('/');
		expect(safeRedirectTarget('../etc/passwd')).toBe('/');
	});
});
