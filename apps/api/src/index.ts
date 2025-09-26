import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { initializeDB } from './db';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import aiConfigRoutes from './routes/ai-config';

// Initialize database (will use local SQLite for development)
initializeDB();

const app = new Hono();

// CORS middleware
app.use(
    '/api/*',
    cors({
        origin: ['http://localhost:3500', 'http://localhost:3000'], // Allow your web app
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
);

// Health check endpoint
app.get('/health', c => {
    return c.json({ status: 'ok', message: 'API is running' });
});

// Auth routes
app.route('/api/auth', authRoutes);

// User routes
app.route('/api/users', userRoutes);

// AI Configuration routes
app.route('/api/ai-config', aiConfigRoutes);

// API routes (legacy - can be removed later)
app.get('/api/hello', c => {
    return c.json({
        message: 'Hello from Hono API!',
        timestamp: new Date().toISOString(),
    });
});

// Global error handler
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse();
    }

    console.error('Unhandled error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
});

// Start server
const port = parseInt(process.env.PORT || '3501');

console.log(`🚀 Hono API server is running on http://localhost:${port}`);

serve({
    fetch: app.fetch,
    port,
});
