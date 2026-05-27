import { describe, it, expect } from 'vitest';
import { splitFrontmatter, hasFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
	it('returns null frontmatter and the original body when no fence is present', () => {
		const raw = '# Heading\n\nBody text.\n';
		expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw });
	});

	it('extracts a simple frontmatter block', () => {
		const raw = '---\nname: Sharazan\nkind: place\n---\n\nThe bone-white city.\n';
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter).toBe('name: Sharazan\nkind: place\n');
		expect(body).toBe('\nThe bone-white city.\n');
	});

	it('handles an empty frontmatter block', () => {
		const raw = '---\n---\nBody after empty front.\n';
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter).toBe('');
		expect(body).toBe('Body after empty front.\n');
	});

	it('handles CRLF line endings', () => {
		const raw = '---\r\nname: Test\r\n---\r\n\r\nBody\r\n';
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter).toBe('name: Test\r\n');
		expect(body).toBe('\r\nBody\r\n');
	});

	it('treats a leading --- without a closing fence as no frontmatter', () => {
		// A document that begins with a horizontal rule must not be
		// mistaken for a frontmatter document.
		const raw = '---\n\nNot frontmatter, just a horizontal rule above some prose.\n';
		expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw });
	});

	it('does not match if the opening fence is preceded by whitespace', () => {
		const raw = ' ---\nname: nope\n---\n\nbody\n';
		expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw });
	});

	it('does not match a fence past the first line', () => {
		const raw = 'hello\n---\nname: nope\n---\nbody\n';
		expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw });
	});

	it('preserves --- inside the body after a frontmatter block', () => {
		const raw = '---\nname: Test\n---\n\nFirst paragraph.\n\n---\n\nSecond paragraph after a hr.\n';
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter).toBe('name: Test\n');
		expect(body).toBe('\nFirst paragraph.\n\n---\n\nSecond paragraph after a hr.\n');
	});

	it('handles a closing fence at end of file with no trailing newline', () => {
		const raw = '---\nname: Test\n---';
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter).toBe('name: Test\n');
		expect(body).toBe('');
	});

	it('tolerates trailing whitespace on fence lines', () => {
		const raw = '---  \nname: Test\n---  \nbody\n';
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter).toBe('name: Test\n');
		expect(body).toBe('body\n');
	});
});

describe('hasFrontmatter', () => {
	it('returns true for a well-formed block', () => {
		expect(hasFrontmatter('---\nx: 1\n---\nbody')).toBe(true);
	});

	it('returns false otherwise', () => {
		expect(hasFrontmatter('plain markdown')).toBe(false);
		expect(hasFrontmatter('---\nno close\n')).toBe(false);
	});

	it('returns true for an empty frontmatter block', () => {
		expect(hasFrontmatter('---\n---\n')).toBe(true);
	});
});
