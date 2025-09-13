import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

// Health check endpoint
app.get('/health', c => {
    return c.json({ status: 'ok', message: 'API is running' });
});

// API routes
app.get('/api/hello', c => {
    return c.json({
        message: 'Hello from Hono API!',
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/users', c => {
    return c.json([
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    ]);
});

app.post('/api/users', async c => {
    const body = await c.req.json();
    return c.json({
        message: 'User created',
        user: { id: Date.now(), ...body },
    });
});

// Start server
const port = parseInt(process.env.PORT || '3001');

console.log(`🚀 Hono API server is running on http://localhost:${port}`);

serve({
    fetch: app.fetch,
    port,
});
