# Cookie-Only Auth + useAuth Tests

**Date:** 2026-05-25
**Branch:** feat/google-only-auth

## Context

Code review on PR #23 identified two deferred follow-up items:

1. Token stored in `localStorage` — XSS-extractable, redundant with HttpOnly cookie already set by the API
2. `useAuth` hook has no unit tests

## Design

### Item 2: Remove localStorage, cookie-only auth

The API already sets an `HttpOnly` `SameSite=Lax` cookie on `/auth/google` and the middleware already reads it via `extractCookieToken`. The frontend currently does both — stores the token in localStorage AND sends it as a Bearer header. This change removes the localStorage path entirely.

**Frontend changes:**

1. `auth-helpers.ts` — Remove `ACCESS_TOKEN_KEY` export. Remove `accessToken` from `GoogleLoginResult` type. Update `parseGoogleLoginBody` to validate only the `user` object, not `access_token`.

2. `auth.ts` — Remove `getStoredToken()`, `setStoredToken()`, `getAuthHeaders()`. Remove `ACCESS_TOKEN_KEY` import. Update `fetchSession()` and `postLogout()` to not send auth headers. Update `signInWithGoogle` to not store token. Simplify `loading` state — always fetch session if no server snapshot.

3. 14 call sites — Remove `getAuthHeaders` imports and usage. Ensure all API fetches have `credentials: 'include'`.

4. `Layout.astro` — Remove localStorage pending-auth inline script. Accept brief flash of server-rendered nav during hydration.

**API changes:**

5. `routes/auth.ts` — `/google` response becomes `{ user }` only (no `access_token`).

### Item 9: useAuth tests

7. New `apps/web/src/lib/auth.test.ts` using `@testing-library/react` `renderHook`. Mock global `fetch`. Cover initial state, sign-in, logout, auth sync events, server snapshot hydration.

### Not changed

- `auth/middleware.ts` — keeps both Bearer and cookie extraction
- `auth/utils.ts` — `extractBearerToken` stays for any future API clients
- Cookie name, signing, verification — unchanged

## Implementation Order

1. API: update `/google` response to remove `access_token`
2. Frontend: update `auth-helpers.ts` types and parsing
3. Frontend: rewrite `auth.ts` to remove localStorage
4. Frontend: update all 14 call sites
5. Frontend: update `Layout.astro`
6. Tests: update API auth tests
7. Tests: update `storage.test.ts` mock
8. Tests: create `auth.test.ts`
9. Run full test suite + build
