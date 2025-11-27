import { Hono } from 'hono';
import { auth } from '../auth/better-auth';

const app = new Hono();

// Mount better-auth handlers for all remaining auth endpoints
// This provides: /sign-in/email, /sign-up/email, /sign-out, /session, etc.
app.all('/*', async c => {
	return auth.handler(c.req.raw);
});

export default app;
