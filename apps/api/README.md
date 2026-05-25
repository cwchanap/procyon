# Chess Platform API

Hono-based API server with Google-only authentication (HS256 app JWT + HttpOnly cookie) and Drizzle ORM + Cloudflare D1 integration.

## Features

- **Google Authentication**: Google Identity Services sign-in with HS256 app JWTs
- **Dual Database Architecture**: Local SQLite for development, Cloudflare D1 for production
- **Input Validation**: Zod schemas for request validation
- **CORS**: Configured for web app integration with credentials support

## API Endpoints

### Authentication

- `POST /api/auth/google` - Google sign-in (exchanges Google ID token for app JWT)
- `POST /api/auth/logout` - Logout user (clears auth cookie)
- `GET /api/auth/session` - Get current session info

### Users (Protected)

- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update user profile

### Other

- `GET /health` - Health check
- `GET /api/hello` - Test endpoint

## Development Setup

1. **Install dependencies**:

   ```bash
   bun install
   ```

2. **Set up environment**:

   ```bash
   cp .env.example .env
   # Add required environment variables:
   # GOOGLE_CLIENT_ID=your-google-client-id
   # JWT_SECRET=your-jwt-secret-at-least-32-chars
   ```

3. **Run database migrations**:

   ```bash
   bun run db:migrate
   ```

4. **Start development server**:
   ```bash
   bun run dev
   ```

## Database Management

- `bun run db:generate` - Generate new migrations
- `bun run db:migrate` - Apply migrations to local database
- `bun run db:studio` - Open Drizzle Studio for database inspection
- `bun run db:push` - Push schema changes directly (development only)

## Authentication Usage

### Google Sign-In

The frontend uses Google Identity Services to obtain a Google ID token, then posts it to the API:

```bash
curl -X POST http://localhost:3501/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"id_token":"google-id-token-here"}'
# Returns: { "access_token": "...", "user": {...} }
```

The API validates the Google ID token against Google's JWKS, upserts the user, and returns an HS256 app JWT set as an HttpOnly cookie.

### Check Session

```bash
curl http://localhost:3501/api/auth/session \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Access Protected Endpoint

```bash
curl http://localhost:3501/api/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Logout

```bash
curl -X POST http://localhost:3501/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Production Deployment (Cloudflare Workers)

For production deployment with Cloudflare D1:

1. Set up Cloudflare D1 database
2. Set up Google OAuth credentials in Google Cloud Console
3. Set production secrets:
   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put JWT_SECRET
   ```
4. Apply database migrations to D1:
   ```bash
   wrangler d1 execute procyon-db --file=drizzle/XXXX_migration.sql
   ```
5. Deploy to Cloudflare Workers:
   ```bash
   bun run deploy
   ```

## Environment Variables

**Development (.env)**:

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `JWT_SECRET` - Secret for signing app JWTs (min 32 characters)
- `PORT` - Server port (default: 3501)
- `NODE_ENV` - Environment (development/production)

**Production (wrangler secrets)**:

- `GOOGLE_CLIENT_ID` - Set via `wrangler secret put`
- `JWT_SECRET` - Set via `wrangler secret put`
