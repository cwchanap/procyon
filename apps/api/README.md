# Chess Platform API

Hono-based API server with JWT authentication and Drizzle ORM + Cloudflare D1 integration.

## Features

- **JWT Authentication**: Secure user registration and login
- **Database**: Drizzle ORM with Cloudflare D1 (production) / SQLite (development)
- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Zod schemas for request validation
- **CORS**: Configured for web app integration

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login

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
   # Edit .env with your configuration
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
```

### Login

```bash
curl -X POST http://localhost:3501/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### Access Protected Endpoint

```bash
curl -X GET http://localhost:3501/api/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Production Deployment (Cloudflare Workers)

For production deployment with Cloudflare D1:

1. Set up Cloudflare D1 database
2. Configure `drizzle.config.ts` with your Cloudflare credentials
3. Update database initialization to use D1 bindings
4. Deploy to Cloudflare Workers

## Environment Variables

- `JWT_SECRET` - Secret key for JWT token signing
- `JWT_EXPIRES_IN` - Token expiration time (default: 7d)
- `PORT` - Server port (default: 3501)
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID (production)
- `CLOUDFLARE_DATABASE_ID` - D1 database ID (production)
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token (production)
