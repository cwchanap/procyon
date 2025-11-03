# Chess Platform API

Hono-based API server with session-based authentication (better-auth) and Drizzle ORM + Cloudflare D1 integration.

## Features

- **Session Authentication**: better-auth with HTTP-only cookies for secure session management
- **Database**: Drizzle ORM with Cloudflare D1 (production) / SQLite (development)
- **Password Hashing**: bcrypt via better-auth for secure password storage
- **Input Validation**: Zod schemas for request validation
- **CORS**: Configured for web app integration with credentials support
- **CSRF Protection**: Built-in CSRF token validation

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user (returns session cookie)
- `POST /api/auth/sign-in/email` - User login (better-auth endpoint)
- `POST /api/auth/logout` - Logout user (clears session)
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
   # BETTER_AUTH_SECRET (generate with: openssl rand -base64 32)
   # BETTER_AUTH_URL=http://localhost:3501
   # BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3500
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
  -d '{"email":"user@example.com","username":"user","password":"password123"}' \
  -c cookies.txt
# Session cookie automatically set in cookies.txt
```

### Login

```bash
curl -X POST http://localhost:3501/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  -c cookies.txt
```

### Check Session

```bash
curl http://localhost:3501/api/auth/session -b cookies.txt
```

### Access Protected Endpoint

```bash
curl http://localhost:3501/api/users/me -b cookies.txt
# Session cookie automatically included
```

### Logout

```bash
curl -X POST http://localhost:3501/api/auth/logout -b cookies.txt
```

## Production Deployment (Cloudflare Workers)

For production deployment with Cloudflare D1:

1. Set up Cloudflare D1 database
2. Set production secrets:
   ```bash
   wrangler secret put BETTER_AUTH_SECRET
   # Enter secure 32+ character string when prompted
   ```
3. Update `wrangler.toml` with production URLs
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

- `BETTER_AUTH_SECRET` - Secret key for session encryption (32+ characters, generate with `openssl rand -base64 32`)
- `BETTER_AUTH_URL` - Base URL of API server (default: http://localhost:3501)
- `BETTER_AUTH_TRUSTED_ORIGINS` - Comma-separated list of allowed frontend origins (default: http://localhost:3500)
- `PORT` - Server port (default: 3501)
- `NODE_ENV` - Environment (development/production)

**Production (wrangler.toml + secrets)**:

- `BETTER_AUTH_SECRET` - Set via `wrangler secret put` (not in wrangler.toml)
- `BETTER_AUTH_URL` - Production API URL in wrangler.toml vars
- `BETTER_AUTH_TRUSTED_ORIGINS` - Production frontend URLs in wrangler.toml vars
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `CLOUDFLARE_DATABASE_ID` - D1 database ID
