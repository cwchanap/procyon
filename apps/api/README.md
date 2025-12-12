# Chess Platform API

Hono-based API server with Supabase Auth (JWT-based) and Drizzle ORM + Cloudflare D1 integration.

## Features

- **JWT Authentication**: Supabase Auth with JWT tokens for secure authentication
- **Dual Database Architecture**: Supabase for auth, D1/SQLite for app data
- **Rate Limiting**: In-memory rate limiting for login attempts (5 per 15 min)
- **Input Validation**: Zod schemas for request validation
- **CORS**: Configured for web app integration with credentials support

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user (returns JWT tokens)
- `POST /api/auth/login` - User login (returns JWT tokens)
- `POST /api/auth/logout` - Logout user (invalidates session)
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
   # SUPABASE_URL=https://your-project.supabase.co
   # SUPABASE_ANON_KEY=your-anon-key
   # SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
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

### Register User

```bash
curl -X POST http://localhost:3501/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","username":"user","password":"password123"}'
# Returns: { "access_token": "...", "refresh_token": "...", "user": {...} }
```

### Login

```bash
curl -X POST http://localhost:3501/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
# Returns: { "access_token": "...", "refresh_token": "...", "user": {...} }
```

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
2. Set up Supabase project and get credentials
3. Set production secrets:
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
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

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `PORT` - Server port (default: 3501)
- `NODE_ENV` - Environment (development/production)

**Production (wrangler secrets)**:

- `SUPABASE_URL` - Set via `wrangler secret put`
- `SUPABASE_ANON_KEY` - Set via `wrangler secret put`
- `SUPABASE_SERVICE_ROLE_KEY` - Set via `wrangler secret put`
