import { describe, expect, test } from 'bun:test';
import { getInitialAuthUserScript, renderServerAuthNav } from './html';

describe('getInitialAuthUserScript', () => {
	test('serializes null auth state', () => {
		expect(getInitialAuthUserScript(null)).toBe(
			'window.__PROCYON_INITIAL_AUTH_USER__=null;'
		);
	});

	test('escapes user-controlled text for inline script use', () => {
		const script = getInitialAuthUserScript({
			id: 'user-1',
			email: 'alice@example.com',
			username: '</script><script>alert(1)</script>',
		});

		expect(script).not.toContain('</script>');
		expect(script).toContain('\\u003c/script>');
	});
});

describe('renderServerAuthNav', () => {
	test('renders anonymous navigation with a login link', () => {
		const html = renderServerAuthNav(null);

		expect(html).toContain('href="/login"');
		expect(html).toContain('data-auth-anonymous');
		expect(html).toContain('Login');
	});

	test('renders authenticated navigation with the server user', () => {
		const html = renderServerAuthNav({
			id: 'user-1',
			email: 'alice@example.com',
			username: 'alice',
		});

		expect(html).toContain('alice');
		expect(html).toContain('alice@example.com');
		expect(html).toContain('href="/profile"');
		expect(html).not.toContain('href="/login"');
	});
});
