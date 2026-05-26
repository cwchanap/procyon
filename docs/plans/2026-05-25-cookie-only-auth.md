# Cookie-Only Auth + useAuth Tests — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove localStorage token storage and rely solely on HttpOnly cookies for auth; add unit tests for the `useAuth` React hook.

**Architecture:** The API already sets an HttpOnly cookie on `/auth/google` and reads it in middleware. The frontend currently does both (localStorage + Bearer header + cookie). We remove the localStorage/Bearer path entirely, stop returning `access_token` from the API, and add `credentials: 'include'` to all consumer fetch calls.

**Tech Stack:** TypeScript, Hono (API), React + Astro (frontend), Bun test runner, @testing-library/react

---

### Task 1: API — Remove `access_token` from `/google` response

**Files:**

- Modify: `apps/api/src/routes/auth.ts:87-107`
- Modify: `apps/api/src/routes/auth.test.ts:109-114`

**Step 1: Update the API response**

In `apps/api/src/routes/auth.ts`, replace the `/google` handler's return block:

```typescript
// BEFORE (lines 96-107):
setAuthCookie(c, access_token);

return c.json({
  access_token,
  user: {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    picture: user.picture,
  },
});

// AFTER:
setAuthCookie(c, access_token);

return c.json({
  user: {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    picture: user.picture,
  },
});
```

**Step 2: Update the API test**

In `apps/api/src/routes/auth.test.ts`, the "successful google login" test (around line 109-114) currently asserts `access_token` in the body. Remove that assertion:

```typescript
// BEFORE:
const body = (await res.json()) as {
  access_token: string;
  user: { id: string; email: string; username: string };
};
expect(typeof body.access_token).toBe('string');
expect(body.user.username).toBe('alice');

// AFTER:
const body = (await res.json()) as {
  user: { id: string; email: string; username: string };
};
expect(body.user.username).toBe('alice');
```

**Step 3: Run API tests**

Run: `cd apps/api && bun test src/routes/auth.test.ts`
Expected: All pass

**Step 4: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
git commit -m "refactor(api): stop returning access_token from /auth/google response"
```

---

### Task 2: Frontend — Update `auth-helpers.ts` types and parsing

**Files:**

- Modify: `apps/web/src/lib/auth-helpers.ts`

**Step 1: Update types and parser**

```typescript
// BEFORE (lines 11-13):
export type GoogleLoginResult =
  | { success: true; user: AuthUser; accessToken: string }
  | { success: false; error: string };

// AFTER:
export type GoogleLoginResult =
  | { success: true; user: AuthUser }
  | { success: false; error: string };
```

```typescript
// BEFORE (lines 36-61):
let data: { access_token?: string; user?: AuthUser } = {};
try {
  data = JSON.parse(bodyText) as typeof data;
} catch {
  return { success: false, error: 'Unexpected response from server.' };
}
if (typeof data.access_token !== 'string' || !data.access_token || !data.user) {
  return { success: false, error: 'Unexpected response from server.' };
}
const user = data.user;
if (
  typeof user.id !== 'string' ||
  typeof user.email !== 'string' ||
  typeof user.username !== 'string'
) {
  return { success: false, error: 'Unexpected response from server.' };
}
return {
  success: true,
  user,
  accessToken: data.access_token,
};

// AFTER:
let data: { user?: AuthUser } = {};
try {
  data = JSON.parse(bodyText) as typeof data;
} catch {
  return { success: false, error: 'Unexpected response from server.' };
}
if (!data.user) {
  return { success: false, error: 'Unexpected response from server.' };
}
const user = data.user;
if (
  typeof user.id !== 'string' ||
  typeof user.email !== 'string' ||
  typeof user.username !== 'string'
) {
  return { success: false, error: 'Unexpected response from server.' };
}
return {
  success: true,
  user,
};
```

Also remove the `ACCESS_TOKEN_KEY` export at line 64:

```typescript
// DELETE:
export const ACCESS_TOKEN_KEY = 'procyon_access_token';
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/auth-helpers.ts
git commit -m "refactor(web): remove accessToken from GoogleLoginResult, drop ACCESS_TOKEN_KEY"
```

---

### Task 3: Frontend — Rewrite `auth.ts` to remove localStorage

**Files:**

- Modify: `apps/web/src/lib/auth.ts`

**Step 1: Rewrite the file**

Remove:

- `ACCESS_TOKEN_KEY` import (line 6)
- `getStoredToken()` function (lines 41-47)
- `setStoredToken()` function (lines 49-59)
- `getAuthHeaders()` function (lines 61-64) — remove the export entirely
- `setStoredToken(result.accessToken)` call in `signInWithGoogle` (line 193)
- `setStoredToken(null)` call in `logout` (line 205)
- `getStoredToken()` calls in `loading` state init (line 150) and `shouldFetchSession` (line 158)

Update:

- `fetchSession()`: remove auth header, keep `credentials: 'include'`
- `postLogout()`: remove auth header, keep `credentials: 'include'`
- `signInWithGoogle`: remove `setStoredToken` call, keep `setUser` and `dispatchAuthChange`
- `loading` state: simplify — if server snapshot present and user is set, `false`; otherwise `true` (always fetch session)
- `shouldFetchSession`: if no initial user, always fetch (no localStorage check)

The resulting file should look like:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { env } from './env';
import {
  resolveApiBaseUrl,
  parseGoogleLoginBody,
  type AuthUser,
  type GoogleLoginResult,
} from './auth-helpers';

const API_BASE_URL = resolveApiBaseUrl(env.PUBLIC_API_URL);

declare global {
  interface Window {
    __PROCYON_INITIAL_AUTH_USER__?: AuthUser | null;
  }
}

export const AUTH_CHANGE_EVENT = 'procyon-auth-change';

interface AuthChangeDetail {
  user: AuthUser | null;
}

function dispatchAuthChange(user: AuthUser | null): void {
  try {
    globalThis.dispatchEvent(
      new CustomEvent<AuthChangeDetail>(AUTH_CHANGE_EVENT, { detail: { user } })
    );
  } catch {
    // ignore (SSR / test environments without DOM)
  }
}

async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/session`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: AuthUser };
    return data.user;
  } catch {
    return null;
  }
}

async function postGoogleLogin(idToken: string): Promise<GoogleLoginResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id_token: idToken }),
    });
    const bodyText = await res.text();
    return parseGoogleLoginBody(res.status, bodyText);
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

async function postLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // best-effort
  }
}

export interface UseAuthOptions {
  initialUser?: AuthUser | null;
}

interface InitialAuthState {
  user: AuthUser | null;
  hasServerSnapshot: boolean;
}

function getInitialAuthState(options?: UseAuthOptions): InitialAuthState {
  if (options && 'initialUser' in options) {
    return {
      user: options.initialUser ?? null,
      hasServerSnapshot: true,
    };
  }

  if (
    typeof window !== 'undefined' &&
    '__PROCYON_INITIAL_AUTH_USER__' in window
  ) {
    return {
      user: window.__PROCYON_INITIAL_AUTH_USER__ ?? null,
      hasServerSnapshot: true,
    };
  }

  return { user: null, hasServerSnapshot: false };
}

export function useAuth(options?: UseAuthOptions) {
  const initialAuthState = getInitialAuthState(options);
  const [user, setUser] = useState<AuthUser | null>(
    () => initialAuthState.user
  );
  const [loading, setLoading] = useState(() => {
    // If we have a server snapshot with a user, no fetch needed
    if (initialAuthState.user) return false;
    // Otherwise we need to check session via cookie
    return true;
  });

  useEffect(() => {
    let mounted = true;

    // Fetch session if we don't have a user yet
    const shouldFetchSession = !initialAuthState.user;

    if (shouldFetchSession) {
      fetchSession()
        .then(u => {
          if (mounted) setUser(u);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    // Listen for auth state changes from other React island instances
    const handleAuthChange = (e: Event) => {
      if (!mounted) return;
      const { user: newUser } = (e as CustomEvent<AuthChangeDetail>).detail;
      setUser(newUser);
      setLoading(false);
    };

    globalThis.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);

    return () => {
      mounted = false;
      globalThis.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    };
  }, []);

  const signInWithGoogle = useCallback(
    async (idToken: string): Promise<GoogleLoginResult> => {
      const result = await postGoogleLogin(idToken);
      if (result.success) {
        setUser(result.user);
        dispatchAuthChange(result.user);
      }
      return result;
    },
    []
  );

  const logout = useCallback(async () => {
    await postLogout();
    setUser(null);
    dispatchAuthChange(null);
  }, []);

  return {
    user,
    loading,
    signInWithGoogle,
    logout,
    isAuthenticated: !!user,
  };
}
```

**Step 2: Verify build**

Run: `cd apps/web && bun run build 2>&1 | tail -5`
Expected: Build errors from call sites still importing `getAuthHeaders` — that's expected, fixed in Task 4.

**Step 3: Commit**

```bash
git add apps/web/src/lib/auth.ts
git commit -m "refactor(web): remove localStorage token, use cookie-only auth"
```

---

### Task 4: Frontend — Update all 13 consumer files

For each file, the pattern is the same:

1. Remove `getAuthHeaders` from the import
2. Remove `const authHeaders = await getAuthHeaders();`
3. Replace `...authHeaders` in headers with `credentials: 'include'` in fetch options
4. If `authHeaders` was the only content in `headers`, remove the `headers` field entirely

**Files (13 consumer files, 18 call sites):**

| #   | File                                 | Import Line | Call Lines         |
| --- | ------------------------------------ | ----------- | ------------------ |
| 1   | `components/PlayHistoryPage.tsx`     | 2           | 108                |
| 2   | `hooks/usePuzzle.ts`                 | 2           | 151                |
| 3   | `components/PuzzlesPage.tsx`         | 2           | 62                 |
| 4   | `hooks/useGameAI.ts`                 | 2           | 93                 |
| 5   | `hooks/usePlayHistory.ts`            | 2           | 88                 |
| 6   | `components/XiangqiGame.tsx`         | 29          | 162, 587           |
| 7   | `components/ShogiGame.tsx`           | 17          | 148                |
| 8   | `components/JungleGame.tsx`          | 17          | 130                |
| 9   | `components/RatingsSection.tsx`      | 2           | 54                 |
| 10  | `components/ProfilePage.tsx`         | 4           | 129, 204, 233, 276 |
| 11  | `components/ai/AISettingsDialog.tsx` | 3           | 76                 |
| 12  | `lib/ai/storage.ts`                  | 4           | 33 (2 fetches)     |
| 13  | `components/ChessGame.tsx`           | 27          | 78, 243            |

**Pattern for each call site:**

```typescript
// BEFORE:
const authHeaders = await getAuthHeaders();
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...authHeaders,
  },
  body: JSON.stringify(data),
});

// AFTER:
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify(data),
});
```

For GET requests where `authHeaders` was the only header content:

```typescript
// BEFORE:
const authHeaders = await getAuthHeaders();
const response = await fetch(url, {
  headers: {
    ...authHeaders,
  },
});

// AFTER:
const response = await fetch(url, {
  credentials: 'include',
});
```

**Step 1: Update all 13 files**

Apply the pattern above to each file. Remove `getAuthHeaders` from all imports.

**Step 2: Verify build**

Run: `bun run build 2>&1 | tail -10`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "refactor(web): replace getAuthHeaders with credentials:include across all call sites"
```

---

### Task 5: Frontend — Update Layout.astro

**Files:**

- Modify: `apps/web/src/layouts/Layout.astro:10-12`

**Step 1: Remove localStorage pending-auth script**

```astro
<!-- BEFORE (line 10-12): -->const pendingAuthScript =
"try{if(localStorage.getItem('procyon_access_token')){document.documentElement.classList.add('procyon-auth-client-pending');}}catch{}";

<!-- AFTER: -->
const pendingAuthScript = '';
```

Also remove the `<script is:inline set:html={pendingAuthScript} />` on line 39, and the `pendingAuthScript` variable declaration entirely. Keep the `initialAuthScript`.

**Step 2: Verify build**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/src/layouts/Layout.astro
git commit -m "refactor(web): remove localStorage pending-auth script from Layout"
```

---

### Task 6: Tests — Update `storage.test.ts` mock

**Files:**

- Modify: `apps/web/src/lib/ai/storage.test.ts:4-6`

**Step 1: Remove `getAuthHeaders` mock**

Since `storage.ts` no longer imports `getAuthHeaders`, the mock is unnecessary. Remove it:

```typescript
// BEFORE:
mock.module('../auth', () => ({
  getAuthHeaders: mock(() => Promise.resolve({})),
}));

// AFTER:
mock.module('../auth', () => ({}));
```

**Step 2: Run storage tests**

Run: `cd apps/web && bun test src/lib/ai/storage.test.ts`
Expected: All pass

**Step 3: Commit**

```bash
git add apps/web/src/lib/ai/storage.test.ts
git commit -m "test(web): remove stale getAuthHeaders mock from storage tests"
```

---

### Task 7: Tests — Create `auth.test.ts` for `useAuth` hook

**Files:**

- Create: `apps/web/src/lib/auth.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useAuth, AUTH_CHANGE_EVENT } from './auth';
import type { AuthUser } from './auth-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  name: 'Test User',
  picture: null,
};

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Clean up window globals
    delete (window as any).__PROCYON_INITIAL_AUTH_USER__;
  });

  test('starts with loading=false and user when given initialUser option', () => {
    const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('starts with loading=true and null user when no initialUser', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('fetches session on mount when no initial user', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(mockFetchResponse({ user: mockUser }))
    );

    const { result } = renderHook(() => useAuth());

    // Wait for the effect to complete
    await act(async () => {
      // Let microtasks flush
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('sets user to null when session fetch returns non-OK', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(mockFetchResponse({ error: 'Unauthorized' }, 401))
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('sets user to null when session fetch throws', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  test('does not fetch session when initialUser is provided', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(mockFetchResponse({ user: mockUser }))
    );
    globalThis.fetch = fetchMock;

    renderHook(() => useAuth({ initialUser: mockUser }));

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('signInWithGoogle success: sets user and dispatches event', async () => {
    const dispatched: CustomEvent[] = [];
    const origDispatch = globalThis.dispatchEvent;
    globalThis.dispatchEvent = ((e: any) => {
      dispatched.push(e);
      return true;
    }) as any;

    globalThis.fetch = mock(() =>
      Promise.resolve(mockFetchResponse({ user: mockUser }))
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const res = await result.current.signInWithGoogle('fake-id-token');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.user).toEqual(mockUser);
      }
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);

    // Should have dispatched auth change event
    expect(dispatched.length).toBeGreaterThanOrEqual(1);
    const authEvent = dispatched.find(e => e.type === AUTH_CHANGE_EVENT);
    expect(authEvent).toBeDefined();
    expect((authEvent as CustomEvent).detail.user).toEqual(mockUser);

    globalThis.dispatchEvent = origDispatch;
  });

  test('signInWithGoogle failure: returns error, user stays null', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(mockFetchResponse({ error: 'Invalid token' }, 401))
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const res = await result.current.signInWithGoogle('bad-token');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('Invalid token');
      }
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('logout: clears user and dispatches event', async () => {
    const dispatched: CustomEvent[] = [];
    const origDispatch = globalThis.dispatchEvent;
    globalThis.dispatchEvent = ((e: any) => {
      dispatched.push(e);
      return true;
    }) as any;

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('{}', { status: 200 }))
    );

    const { result } = renderHook(() => useAuth({ initialUser: mockUser }));

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    const authEvent = dispatched.find(e => e.type === AUTH_CHANGE_EVENT);
    expect(authEvent).toBeDefined();
    expect((authEvent as CustomEvent).detail.user).toBeNull();

    globalThis.dispatchEvent = origDispatch;
  });

  test('auth sync event from another island updates state', async () => {
    const { result } = renderHook(() => useAuth());

    // Initially null
    expect(result.current.user).toBeNull();

    await act(async () => {
      globalThis.dispatchEvent(
        new CustomEvent(AUTH_CHANGE_EVENT, {
          detail: { user: mockUser },
        })
      );
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('reads initial user from window.__PROCYON_INITIAL_AUTH_USER__', () => {
    (window as any).__PROCYON_INITIAL_AUTH_USER__ = mockUser;

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
  });
});
```

**Step 2: Run the test**

Run: `cd apps/web && bun test src/lib/auth.test.ts`
Expected: All pass

**Step 3: Commit**

```bash
git add apps/web/src/lib/auth.test.ts
git commit -m "test(web): add unit tests for useAuth hook"
```

---

### Task 8: Final verification

**Step 1: Run full API test suite**

Run: `cd apps/api && bun test`
Expected: All pass, 0 fail

**Step 2: Run full web test suite**

Run: `cd apps/web && bun test`
Expected: No new failures (pre-existing 12 Playwright/AI failures are OK)

**Step 3: Run full build**

Run: `bun run build`
Expected: Both apps build successfully

**Step 4: Verify no lingering `getAuthHeaders` references**

Run: `grep -r "getAuthHeaders" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v ".test.ts"`
Expected: No matches (all removed)

**Step 5: Verify no lingering `ACCESS_TOKEN_KEY` references**

Run: `grep -r "ACCESS_TOKEN_KEY" apps/web/src/ --include="*.ts" --include="*.tsx"`
Expected: No matches

**Step 6: Verify no lingering `localStorage` auth references**

Run: `grep -r "procyon_access_token" apps/ --include="*.ts" --include="*.tsx" --include="*.astro"`
Expected: No matches (except possibly in API cookie name constant)
