# Cloudflare Workers Deployment Guide

This guide walks through deploying the Procyon API to Cloudflare Workers with the web app as static assets.

## Prerequisites

1. Cloudflare account with Workers enabled
2. Wrangler CLI installed (already in devDependencies)
3. Web app built and ready in `../web/dist`

## Initial Setup

### 1. Authenticate with Cloudflare

```bash
cd apps/api
bunx wrangler login
```

### 2. Create D1 Database

```bash
bun run cf:d1:create
```

This will output database information. Copy the `database_id` and update it in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "procyon-db"
database_id = "your-database-id-here"  # Replace with actual ID
```

### 3. Generate and Apply Migrations

First, ensure migrations are generated from your schema:

```bash
bun run db:generate
```

Then apply migrations to D1:

```bash
bun run cf:d1:migrations:apply
```

### 4. Set Secrets

Set your JWT secret (do not commit this):

```bash
bunx wrangler secret put JWT_SECRET
# Enter your secret when prompted
```

For staging environment:

```bash
bunx wrangler secret put JWT_SECRET --env staging
```

### 5. Build Web App

Make sure the web app is built before deploying:

```bash
cd ../web
bun run build
cd ../api
```

## Deployment

### Deploy to Production

```bash
bun run deploy
```

### Deploy to Staging

```bash
bun run deploy:staging
```

## Development with Cloudflare

### Local Development with Wrangler

Test the worker locally with D1 and assets:

```bash
# Make sure web app is built first
cd ../web && bun run build && cd ../api

# Run wrangler dev
bun run cf:dev
```

Create `.dev.vars` file for local secrets (copy from `.dev.vars.example`):

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your values
```

### View Live Logs

```bash
bun run cf:tail
```

## Database Management

### List Migrations

```bash
bun run cf:d1:migrations:list
```

### Apply New Migrations

After generating new migrations with `bun run db:generate`:

```bash
bun run cf:d1:migrations:apply
```

## Environment Configuration

### Production

- Name: `procyon-api`
- D1 Database: `procyon-db`
- Assets: Served from `../web/dist`

### Staging

- Name: `procyon-api-staging`
- Uses same D1 database (create separate one if needed)
- Assets: Served from `../web/dist`

## Updating wrangler.toml

Key settings to configure:

1. **Database ID**: Update after creating D1 database
2. **CORS Origins**: Add production domain in `src/worker.ts`
3. **Environment Variables**: Set via `wrangler secret put`

## Troubleshooting

### Assets Not Loading

Ensure web app is built before deployment:

```bash
cd apps/web && bun run build
```

### Database Connection Issues

1. Verify database_id in wrangler.toml matches your D1 database
2. Check migrations are applied: `bun run cf:d1:migrations:list`
3. Ensure D1 binding name matches in worker.ts (should be "DB")

### CORS Errors

Update allowed origins in `src/worker.ts` to include your production domain.

## Post-Deployment

1. Test health endpoint: `https://your-worker.workers.dev/health`
2. Test API endpoints: `https://your-worker.workers.dev/api/hello`
3. Verify static assets load: `https://your-worker.workers.dev/`
4. Monitor logs: `bun run cf:tail`

## Continuous Deployment

For automated deployments, add Cloudflare API token to your CI/CD:

```yaml
# Example GitHub Actions
- name: Deploy to Cloudflare Workers
  run: bunx wrangler deploy
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```
