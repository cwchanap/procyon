import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { initializeDB } from './db';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import aiConfigRoutes from './routes/ai-config';

// Cloudflare Workers environment bindings
type Bindings = {
    DB: D1Database;
    ASSETS: Fetcher;
    JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Initialize database with D1 binding
app.use('*', async (c, next) => {
    // Initialize DB with Cloudflare D1 binding for production
    if (c.env.DB) {
        initializeDB(c.env.DB);
    }
    await next();
});

// CORS middleware - allow all origins in production or specific origins
app.use(
    '/api/*',
    cors({
        origin: origin => {
            // Allow all origins in production, or check against whitelist
            const allowedOrigins = [
                'http://localhost:3500',
                'http://localhost:3000',
                // Add your production domain here
            ];
            return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
        },
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
);

// Health check endpoint
app.get('/health', c => {
    return c.json({ status: 'ok', message: 'API is running' });
});

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/ai-config', aiConfigRoutes);

// Legacy hello endpoint
app.get('/api/hello', c => {
    return c.json({
        message: 'Hello from Hono API on Cloudflare Workers!',
        timestamp: new Date().toISOString(),
    });
});

// Serve static assets from web app (fallback to index.html for SPA routing)
app.get('/*', async c => {
    try {
        // Try to fetch the asset from ASSETS binding
        const asset = await c.env.ASSETS.fetch(c.req.raw);

        // If asset not found and it's a page route (not a file), serve index.html
        if (asset.status === 404 && !c.req.path.includes('.')) {
            const indexRequest = new Request(
                new URL('/', c.req.url),
                c.req.raw
            );
            return await c.env.ASSETS.fetch(indexRequest);
        }

        return asset;
    } catch (err) {
        console.error('Asset fetch error:', err);
        return c.notFound();
    }
});

// Global error handler
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse();
    }

    console.error('Unhandled error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
