import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { getInitialAuthUserScript, renderServerAuthNav } from './auth/html';
import { verifyAppJwt } from './auth/jwt';
import { AUTH_COOKIE_NAME, extractCookieToken } from './auth/utils';
import { getDB, initializeDB } from './db';
import { users } from './db/schema';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import aiConfigRoutes from './routes/ai-config';
import playHistoryRoutes from './routes/play-history';
import ratingsRoutes from './routes/ratings';
import puzzleRoutes from './routes/puzzles';

// Cloudflare Workers environment bindings
type Bindings = {
	DB: D1Database;
	ASSETS: Fetcher;
	GOOGLE_CLIENT_ID: string;
	JWT_SECRET: string;
};

type WorkerContext = Context<{ Bindings: Bindings }>;

interface HtmlAuthUser {
	id: string;
	email: string;
	username: string;
	name?: string | null;
	picture?: string | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
}

const app = new Hono<{ Bindings: Bindings }>();

async function getRequestAuthUser(
	c: WorkerContext
): Promise<HtmlAuthUser | null> {
	const token = extractCookieToken(
		c.req.header('cookie') || '',
		AUTH_COOKIE_NAME
	);
	if (!token) return null;

	try {
		const payload = await verifyAppJwt(token, {
			secret: c.env.JWT_SECRET || undefined,
		});
		const row = await getDB()
			.select()
			.from(users)
			.where(eq(users.id, payload.sub))
			.get();

		if (!row) return null;

		return {
			id: row.id,
			email: row.email,
			username: row.username,
			name: row.name,
			picture: row.picture,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	} catch {
		return null;
	}
}

async function withServerAuthHtml(
	c: WorkerContext,
	response: Response
): Promise<Response> {
	const contentType = response.headers.get('content-type') || '';
	if (!contentType.toLowerCase().includes('text/html')) return response;
	if (typeof HTMLRewriter === 'undefined') return response;

	const user = await getRequestAuthUser(c);
	const authState = user ? 'authenticated' : 'anonymous';

	return new HTMLRewriter()
		.on('#procyon-initial-auth-script', {
			element(element) {
				element.setInnerContent(getInitialAuthUserScript(user));
			},
		})
		.on('#procyon-server-auth-nav', {
			element(element) {
				element.setAttribute('data-auth-state', authState);
				element.setInnerContent(renderServerAuthNav(user), { html: true });
			},
		})
		.transform(response);
}

// Initialize database with D1 binding and bind to request context
app.use('*', async (c, next) => {
	if (c.env.DB) {
		initializeDB(c.env.DB);
	}
	c.set('db', getDB());
	c.set('googleClientId', c.env.GOOGLE_CLIENT_ID || '');
	c.set('jwtSecret', c.env.JWT_SECRET || '');
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
		credentials: true,
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
app.route('/api/play-history', playHistoryRoutes);
app.route('/api/ratings', ratingsRoutes);
app.route('/api/puzzles', puzzleRoutes);

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
			const indexUrl = new URL('/', c.req.url);
			const indexRequest = new Request(indexUrl.toString(), {
				method: c.req.raw.method,
				headers: c.req.raw.headers,
			});
			const fallback = await c.env.ASSETS.fetch(indexRequest);
			return await withServerAuthHtml(c, fallback);
		}

		return await withServerAuthHtml(c, asset);
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
