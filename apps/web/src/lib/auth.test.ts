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
import {
	AUTH_CHANGE_EVENT,
	useAuth,
	__resetSharedAuthUserForTests,
} from './auth';
import {
	setConfig as setAIConfig,
	getConfigSlice as getAIConfigSlice,
	resetAIConfigStore as resetAIConfigStoreForTests,
} from './ai/ai-config-store';

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
	// Map localStorage so clearAIConfig() (called on logout) can access it
	// without a bare-global ReferenceError in the happy-dom test env.
	g.localStorage = happyWindow.localStorage;
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
	delete g.localStorage;
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
		__resetSharedAuthUserForTests();
		resetAIConfigStoreForTests();
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

	test('fetches session when window initial auth user is null', async () => {
		const fetchSpy = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		);
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		(
			happyWindow as Window & {
				__PROCYON_INITIAL_AUTH_USER__?: AuthUser | null;
			}
		).__PROCYON_INITIAL_AUTH_USER__ = null;

		const { result } = renderHook(() => useAuth());

		expect(result.current.loading).toBe(true);
		expect(result.current.user).toBeNull();

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
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

	test('logout: clears user and dispatches event on success', async () => {
		globalThis.fetch = mock(() => Promise.resolve(jsonResponse({}))) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

		const logoutResult = await act(async () => {
			return result.current.logout();
		});

		expect(logoutResult.success).toBe(true);
		expect(result.current.user).toBeNull();
		expect(result.current.isAuthenticated).toBe(false);

		expect(captured.length).toBeGreaterThanOrEqual(1);
		const authEvent = captured[captured.length - 1];
		expect(authEvent.user).toBeNull();

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('logout: keeps user when server responds with error', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({}, 500))
		) as any;

		const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

		const logoutResult = await act(async () => {
			return result.current.logout();
		});

		expect(logoutResult.success).toBe(false);
		expect(result.current.user).toEqual(mockUser);
		expect(result.current.isAuthenticated).toBe(true);
	});

	test('logout: keeps user when network request fails', async () => {
		globalThis.fetch = mock(() =>
			Promise.reject(new Error('Network error'))
		) as any;

		const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

		const logoutResult = await act(async () => {
			return result.current.logout();
		});

		expect(logoutResult.success).toBe(false);
		expect(result.current.user).toEqual(mockUser);
		expect(result.current.isAuthenticated).toBe(true);
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

	test('fetchSession success dispatches AUTH_CHANGE_EVENT for sibling islands', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({ user: mockUser }))
		) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		// fetchSession succeeded with a non-null user, so an event should
		// have been dispatched so sibling islands can sync.
		expect(captured.length).toBeGreaterThanOrEqual(1);
		expect(captured[captured.length - 1]!.user).toEqual(mockUser);

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('fetchSession null (not authenticated) does not dispatch event', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(jsonResponse({}, 401))
		) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(captured).toHaveLength(0);

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('sibling island with failed fetchSession syncs from AUTH_CHANGE_EVENT', async () => {
		let fetchCallCount = 0;
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			// First call (island A) succeeds, second (island B) fails.
			if (fetchCallCount === 1) {
				return Promise.resolve(jsonResponse({ user: mockUser }));
			}
			return Promise.reject(new Error('Network error'));
		}) as any;

		// Island A: fetch succeeds → dispatches event
		const { result: resultA } = renderHook(() => useAuth());
		// Island B: fetch fails → would stay null without the event
		const { result: resultB } = renderHook(() => useAuth());

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(resultA.current.user).toEqual(mockUser);
		expect(resultA.current.isAuthenticated).toBe(true);

		// Island B received the event from island A and synced.
		expect(resultB.current.user).toEqual(mockUser);
		expect(resultB.current.isAuthenticated).toBe(true);
	});

	test('late-mounting island reads shared auth snapshot missed event', async () => {
		let fetchCallCount = 0;
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			// Island A fetch succeeds; island B revalidates the snapshot
			// and also gets the same user.
			return Promise.resolve(jsonResponse({ user: mockUser }));
		}) as any;

		// Island A mounts and fetches successfully → dispatches event,
		// sets sharedAuthUser snapshot.
		const { result: resultA } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(resultA.current.user).toEqual(mockUser);
		expect(fetchCallCount).toBe(1);

		// Island B mounts AFTER island A's event was dispatched. The DOM
		// event is not replayable, so island B reads the shared snapshot
		// for optimistic UI, then revalidates via fetchSession().
		const { result: resultB } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(resultB.current.user).toEqual(mockUser);
		expect(resultB.current.isAuthenticated).toBe(true);
		expect(resultB.current.loading).toBe(false);
		// Island B made one revalidation fetch (snapshot + fetchSession).
		expect(fetchCallCount).toBe(2);
	});

	test('late-mounting island revalidates stale snapshot and clears signed-out state', async () => {
		let fetchCallCount = 0;
		// Island A's fetch resolves immediately; island B's revalidation
		// is deferred so we can assert the optimistic snapshot state
		// before revalidation completes.
		let resolveRevalidation: () => void = () => {};
		const revalidationPending = new Promise<void>(r => {
			resolveRevalidation = r;
		});
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			if (fetchCallCount === 1) {
				return Promise.resolve(jsonResponse({ user: mockUser }));
			}
			// Island B revalidation — deferred, returns 401 when resolved.
			return revalidationPending.then(() =>
				Promise.resolve(jsonResponse({}, 401))
			);
		}) as any;

		// Island A mounts and fetches successfully → sets snapshot.
		const { result: resultA } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultA.current.user).toEqual(mockUser);

		// Island B mounts after island A's event. It reads the stale
		// snapshot optimistically, then revalidates via fetchSession().
		const { result: resultB } = renderHook(() => useAuth());

		// Before revalidation resolves, island B is optimistically
		// authenticated from the snapshot.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);
		expect(resultB.current.isAuthenticated).toBe(true);

		// Now resolve the revalidation fetch with 401 (session expired /
		// user signed out in another tab). Island B must correct to
		// signed-out and broadcast so sibling islands also learn.
		await act(async () => {
			resolveRevalidation();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toBeNull();
		expect(resultB.current.isAuthenticated).toBe(false);
		expect(fetchCallCount).toBe(2);
	});

	test('late-arriving fetchSession null does not clobber user from sibling event', async () => {
		let resolveFetch: () => void = () => {};
		const fetchPending = new Promise<void>(r => {
			resolveFetch = r;
		});

		globalThis.fetch = mock(() =>
			fetchPending.then(() => Promise.resolve(jsonResponse({}, 401)))
		) as any;

		const { result } = renderHook(() => useAuth());

		// While fetch is pending, a sibling island dispatches an auth event.
		await act(async () => {
			globalThis.dispatchEvent(
				new CustomEvent(AUTH_CHANGE_EVENT, {
					detail: { user: mockUser },
				})
			);
		});

		expect(result.current.user).toEqual(mockUser);

		// Now the fetch resolves with null (not authenticated).
		await act(async () => {
			resolveFetch();
			await new Promise(r => setTimeout(r, 0));
		});

		// The late-arriving null must NOT clobber the user from the event.
		expect(result.current.user).toEqual(mockUser);
		expect(result.current.isAuthenticated).toBe(true);
	});

	test('late-mounting island preserves optimistic user when revalidation returns 500 (transient)', async () => {
		let fetchCallCount = 0;
		let resolveRevalidation: () => void = () => {};
		const revalidationPending = new Promise<void>(r => {
			resolveRevalidation = r;
		});
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			if (fetchCallCount === 1) {
				return Promise.resolve(jsonResponse({ user: mockUser }));
			}
			// Island B revalidation — deferred, returns 500 (transient
			// server error) when resolved.
			return revalidationPending.then(() =>
				Promise.resolve(jsonResponse({}, 500))
			);
		}) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		// Island A mounts and fetches successfully → sets snapshot.
		const { result: resultA } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultA.current.user).toEqual(mockUser);

		// Island B mounts after island A's event. It reads the stale
		// snapshot optimistically, then revalidates via fetchSession().
		const { result: resultB } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);
		expect(resultB.current.isAuthenticated).toBe(true);

		// Clear events captured so far (island A's login broadcast).
		captured.length = 0;

		// Resolve the revalidation with 500 (transient). Island B must
		// preserve the optimistic user and NOT broadcast null.
		await act(async () => {
			resolveRevalidation();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);
		expect(resultB.current.isAuthenticated).toBe(true);
		expect(captured).toHaveLength(0);

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('late-mounting island preserves optimistic user when revalidation throws (network error)', async () => {
		let fetchCallCount = 0;
		let resolveRevalidation: () => void = () => {};
		const revalidationPending = new Promise<void>(r => {
			resolveRevalidation = r;
		});
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			if (fetchCallCount === 1) {
				return Promise.resolve(jsonResponse({ user: mockUser }));
			}
			// Island B revalidation — deferred, rejects with a network
			// error when resolved.
			return revalidationPending.then(() =>
				Promise.reject(new Error('Network error'))
			);
		}) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		const { result: resultA } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultA.current.user).toEqual(mockUser);

		const { result: resultB } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);

		captured.length = 0;

		await act(async () => {
			resolveRevalidation();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);
		expect(resultB.current.isAuthenticated).toBe(true);
		expect(captured).toHaveLength(0);

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});

	test('confirmed 401 expiry on revalidation clears the AI config store', async () => {
		let fetchCallCount = 0;
		let resolveRevalidation: () => void = () => {};
		const revalidationPending = new Promise<void>(r => {
			resolveRevalidation = r;
		});
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			if (fetchCallCount === 1) {
				return Promise.resolve(jsonResponse({ user: mockUser }));
			}
			return revalidationPending.then(() =>
				Promise.resolve(jsonResponse({}, 401))
			);
		}) as any;

		// Put the AI config store into a non-initial state to verify
		// the passive sign-out resets it. setAIConfig writes a
		// non-default provider/model and persists the sanitized cache
		// to localStorage.
		setAIConfig({
			provider: 'openai',
			model: 'gpt-4o',
			apiKey: 'sk-leaked-key',
			enabled: true,
		});
		const beforeReset = getAIConfigSlice();
		expect(beforeReset.config.provider).toBe('openai');
		expect(beforeReset.config.apiKey).toBe('sk-leaked-key');

		// Island A mounts and fetches successfully → sets snapshot.
		const { result: resultA } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultA.current.user).toEqual(mockUser);

		// Island B mounts after island A's event, reads the snapshot,
		// then revalidates. The revalidation is deferred so we can
		// assert the optimistic state first.
		const { result: resultB } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);

		// Resolve the revalidation with 401 (confirmed expiry). Island
		// B must sign out AND reset the AI config store so the previous
		// user's raw API key can't be reused by an anonymous session.
		await act(async () => {
			resolveRevalidation();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toBeNull();
		expect(resultB.current.isAuthenticated).toBe(false);

		const afterReset = getAIConfigSlice();
		expect(afterReset.hydrated).toBe(false);
		expect(afterReset.config.provider).toBe('gemini');
		expect(afterReset.config.apiKey).toBe('');
		expect(afterReset.config.enabled).toBe(false);
	});

	test('confirmed 401 expiry on revalidation broadcasts sign-out to sibling islands', async () => {
		let fetchCallCount = 0;
		let resolveRevalidation: () => void = () => {};
		const revalidationPending = new Promise<void>(r => {
			resolveRevalidation = r;
		});
		globalThis.fetch = mock(() => {
			fetchCallCount++;
			if (fetchCallCount === 1) {
				return Promise.resolve(jsonResponse({ user: mockUser }));
			}
			return revalidationPending.then(() =>
				Promise.resolve(jsonResponse({}, 401))
			);
		}) as any;

		const captured: Array<{ user: AuthUser | null }> = [];
		const handler = (e: Event) => {
			captured.push((e as CustomEvent).detail);
		};
		globalThis.addEventListener(AUTH_CHANGE_EVENT, handler);

		const { result: resultA } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultA.current.user).toEqual(mockUser);

		const { result: resultB } = renderHook(() => useAuth());
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toEqual(mockUser);

		// Clear island A's login broadcast.
		captured.length = 0;

		await act(async () => {
			resolveRevalidation();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(resultB.current.user).toBeNull();

		// Island B broadcast null so sibling islands (including A)
		// also learn about the confirmed sign-out.
		expect(captured.length).toBeGreaterThanOrEqual(1);
		expect(captured[captured.length - 1]!.user).toBeNull();
		expect(resultA.current.user).toBeNull();

		globalThis.removeEventListener(AUTH_CHANGE_EVENT, handler);
	});
});
