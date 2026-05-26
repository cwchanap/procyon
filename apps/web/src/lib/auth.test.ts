import {
	describe,
	test,
	expect,
	beforeEach,
	afterEach,
	beforeAll,
	afterAll,
	mock,
} from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { Window } from 'happy-dom';
import {
	resolveApiBaseUrl,
	parseGoogleLoginBody,
	type AuthUser,
	type GoogleLoginResult,
} from './auth-helpers';
import { AUTH_CHANGE_EVENT, useAuth } from './auth';

const mockUser: AuthUser = {
	id: 'u1',
	email: 'test@example.com',
	username: 'testuser',
	name: 'Test User',
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

let happyWindow: Window;

beforeAll(() => {
	happyWindow = new Window();
	const g = globalThis as any;
	g.document = happyWindow.document;
	g.window = happyWindow;
	g.HTMLElement = happyWindow.HTMLElement;
	g.HTMLDivElement = happyWindow.HTMLDivElement;
	g.Element = happyWindow.Element;
	g.Node = happyWindow.Node;
	g.DocumentFragment = happyWindow.DocumentFragment;
	g.Text = happyWindow.Text;
	g.Comment = happyWindow.Comment;
	g.Selection = happyWindow.Selection;
	g.Range = happyWindow.Range;
	g.DOMRect = happyWindow.DOMRect;
	g.MutationObserver = happyWindow.MutationObserver;
	g.NodeFilter = happyWindow.NodeFilter;
});

afterAll(() => {
	const g = globalThis as any;
	delete g.document;
	delete g.window;
	delete g.HTMLElement;
	delete g.HTMLDivElement;
	delete g.Element;
	delete g.Node;
	delete g.DocumentFragment;
	delete g.Text;
	delete g.Comment;
	delete g.Selection;
	delete g.Range;
	delete g.DOMRect;
	delete g.MutationObserver;
	delete g.NodeFilter;
	happyWindow.close();
});

describe('resolveApiBaseUrl', () => {
	test('returns /api when no URL is configured', () => {
		expect(resolveApiBaseUrl(undefined)).toBe('/api');
	});

	test('returns /api when URL is empty string', () => {
		expect(resolveApiBaseUrl('')).toBe('/api');
	});

	test('strips trailing slash from configured URL', () => {
		expect(resolveApiBaseUrl('https://api.example.com/')).toBe(
			'https://api.example.com'
		);
	});

	test('preserves URL without trailing slash', () => {
		expect(resolveApiBaseUrl('https://api.example.com')).toBe(
			'https://api.example.com'
		);
	});

	test('returns /api when URL is just a slash', () => {
		expect(resolveApiBaseUrl('/')).toBe('/api');
	});

	test('preserves full API path', () => {
		expect(resolveApiBaseUrl('http://localhost:3501/api')).toBe(
			'http://localhost:3501/api'
		);
	});
});

describe('parseGoogleLoginBody', () => {
	test('returns success when 200 with valid user', () => {
		const body = JSON.stringify({
			user: { id: 'u1', email: 'a@example.com', username: 'alice' },
		});
		const result = parseGoogleLoginBody(200, body);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.user.username).toBe('alice');
		}
	});

	test('returns failure for non-2xx status with JSON error', () => {
		const result = parseGoogleLoginBody(
			401,
			JSON.stringify({ error: 'Invalid Google token' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Invalid Google token');
		}
	});

	test('returns raw body when non-2xx body is not JSON', () => {
		const result = parseGoogleLoginBody(500, 'Boom');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Boom');
		}
	});

	test('returns default error when non-2xx body is empty', () => {
		const result = parseGoogleLoginBody(403, '');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Sign-in failed');
		}
	});

	test('returns failure when 200 body is missing user', () => {
		const result = parseGoogleLoginBody(200, JSON.stringify({}));
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Unexpected response from server.');
		}
	});

	test('returns failure when 200 body is unparseable JSON', () => {
		const result = parseGoogleLoginBody(200, '<<not-json>>');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Unexpected response from server.');
		}
	});

	test('returns failure when user object is missing required fields', () => {
		const result = parseGoogleLoginBody(200, JSON.stringify({ user: {} }));
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Unexpected response from server.');
		}
	});

	test('returns failure when user.id is not a string', () => {
		const result = parseGoogleLoginBody(
			200,
			JSON.stringify({
				user: { id: 123, email: 'a@b.com', username: 'a' },
			})
		);
		expect(result.success).toBe(false);
	});

	test('returns failure when user.email is not a string', () => {
		const result = parseGoogleLoginBody(
			200,
			JSON.stringify({
				user: { id: 'u1', email: null, username: 'a' },
			})
		);
		expect(result.success).toBe(false);
	});

	test('returns failure when user.username is not a string', () => {
		const result = parseGoogleLoginBody(
			200,
			JSON.stringify({
				user: { id: 'u1', email: 'a@b.com', username: undefined },
			})
		);
		expect(result.success).toBe(false);
	});
});

describe('AUTH_CHANGE_EVENT', () => {
	test('is a non-empty string constant', () => {
		expect(typeof AUTH_CHANGE_EVENT).toBe('string');
		expect(AUTH_CHANGE_EVENT.length).toBeGreaterThan(0);
	});

	test('CustomEvent with auth change detail can be dispatched and received', () => {
		const received: Array<{ user: unknown }> = [];
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail as { user: unknown };
			received.push(detail);
		};

		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		globalThis.dispatchEvent(
			new CustomEvent(AUTH_CHANGE_EVENT, {
				detail: { user: null },
			})
		);
		globalThis.dispatchEvent(
			new CustomEvent(AUTH_CHANGE_EVENT, {
				detail: {
					user: { id: 'u1', email: 'a@b.com', username: 'alice' },
				},
			})
		);

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);

		expect(received).toHaveLength(2);
		expect(received[0].user).toBeNull();
		expect(received[1].user).toEqual({
			id: 'u1',
			email: 'a@b.com',
			username: 'alice',
		});
	});
});

describe('useAuth', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		delete (happyWindow as any).__PROCYON_INITIAL_AUTH_USER__;
	});

	test('starts with loading=false and user when given initialUser option', () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		) as any;

		const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

		expect(result.current.loading).toBe(false);
		expect(result.current.user).toEqual(mockUser);
		expect(result.current.isAuthenticated).toBe(true);
	});

	test('starts with loading=true and null user when no initialUser', () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		) as any;

		const { result } = renderHook(() => useAuth());

		expect(result.current.loading).toBe(true);
		expect(result.current.user).toBeNull();
		expect(result.current.isAuthenticated).toBe(false);
	});

	test('fetches session on mount when no initial user', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		) as any;

		const { result } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.user).toEqual(mockUser);
	});

	test('sets user to null when session fetch returns non-OK', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({}, 401))
		) as any;

		const { result } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(result.current.user).toBeNull();
		expect(result.current.loading).toBe(false);
	});

	test('sets user to null when session fetch throws', async () => {
		globalThis.fetch = mock(() =>
			Promise.reject(new Error('Network error'))
		) as any;

		const { result } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(result.current.user).toBeNull();
		expect(result.current.loading).toBe(false);
	});

	test('does not fetch session when initialUser is provided', () => {
		const fetchSpy = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		);
		globalThis.fetch = fetchSpy as any;

		renderHook(() => useAuth({ initialUser: mockUser }));

		expect(fetchSpy).toHaveBeenCalledTimes(0);
	});

	test('signInWithGoogle success: sets user and dispatches event', async () => {
		const fetchMock = mock((input: any) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof URL
						? input.toString()
						: (input as Request).url;
			if (url.includes('/auth/session')) {
				return Promise.resolve(jsonResponse({}, 401));
			}
			return Promise.resolve(jsonResponse({ user: mockUser }, 200));
		});
		globalThis.fetch = fetchMock as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		const { result } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(result.current.user).toBeNull();

		let loginResult: GoogleLoginResult;
		await act(async () => {
			loginResult = await result.current.signInWithGoogle('fake-id-token');
		});

		expect(loginResult!.success).toBe(true);
		expect(result.current.user).toEqual(mockUser);
		expect(result.current.isAuthenticated).toBe(true);

		expect(captured.length).toBeGreaterThanOrEqual(1);
		const authEvent = captured[captured.length - 1];
		expect(authEvent.user).toEqual(mockUser);

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('signInWithGoogle failure: returns error, user stays null', async () => {
		const fetchMock = mock((input: any) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof URL
						? input.toString()
						: (input as Request).url;
			if (url.includes('/auth/session')) {
				return Promise.resolve(jsonResponse({}, 401));
			}
			return Promise.resolve(jsonResponse({ error: 'Invalid token' }, 401));
		});
		globalThis.fetch = fetchMock as any;

		const { result } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		let loginResult: GoogleLoginResult;
		await act(async () => {
			loginResult = await result.current.signInWithGoogle('bad-token');
		});

		expect(loginResult!.success).toBe(false);
		if (!loginResult!.success) {
			expect(loginResult!.error).toBe('Invalid token');
		}
		expect(result.current.user).toBeNull();
	});

	test('logout: clears user and dispatches event', async () => {
		globalThis.fetch = mock(() => Promise.resolve(jsonResponse({}))) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

		await act(async () => {
			await result.current.logout();
		});

		expect(result.current.user).toBeNull();
		expect(result.current.isAuthenticated).toBe(false);

		expect(captured.length).toBeGreaterThanOrEqual(1);
		const authEvent = captured[captured.length - 1];
		expect(authEvent.user).toBeNull();

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('auth sync event from another island updates state', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({}, 401))
		) as any;

		const { result } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(result.current.user).toBeNull();

		act(() => {
			globalThis.dispatchEvent(
				new CustomEvent(AUTH_CHANGE_EVENT, {
					detail: { user: mockUser },
				})
			);
		});

		expect(result.current.user).toEqual(mockUser);
	});

	test('reads initial user from window.__PROCYON_INITIAL_AUTH_USER__', () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		) as any;
		(happyWindow as any).__PROCYON_INITIAL_AUTH_USER__ = mockUser;

		const { result } = renderHook(() => useAuth());

		expect(result.current.loading).toBe(false);
		expect(result.current.user).toEqual(mockUser);
	});
});
