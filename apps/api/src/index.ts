import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { initializeDB } from './db';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import aiConfigRoutes from './routes/ai-config';
import playHistoryRoutes from './routes/play-history';
import { env, isProduction } from './env';
import { startRateLimitCleanup } from './auth/rate-limit';
import { logger } from './logger';

// Initialize database (will use local SQLite for development)
initializeDB();

// Start rate limit cleanup task
let stopCleanup: (() => void) | null = null;
try {
	stopCleanup = startRateLimitCleanup();
} catch (error) {
	logger.error('Failed to start rate limit cleanup task', { error });
	throw error;
}

let server: unknown = null;
let isShuttingDown = false;

const maybeProcess = globalThis as unknown as {
	process?: {
		on?: (event: string, handler: () => void) => void;
		exit?: (code?: number) => void;
	};
};

const proc = maybeProcess.process;
if (proc && typeof proc.on === 'function') {
	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;

		try {
			const closeWithTimeoutMs = 10_000;
			const maybeServer = server as {
				close?: (callback?: () => void) => void;
			};

			await new Promise<void>(resolve => {
				const timeoutId = setTimeout(() => {
					logger.warn('Graceful shutdown timed out; forcing exit', {
						signal,
						timeoutMs: closeWithTimeoutMs,
					});
					resolve();
				}, closeWithTimeoutMs);

				if (!maybeServer || typeof maybeServer.close !== 'function') {
					clearTimeout(timeoutId);
					resolve();
					return;
				}

				maybeServer.close(() => {
					clearTimeout(timeoutId);
					resolve();
				});
			});

			stopCleanup?.();
			logger.info('Graceful shutdown complete', { signal });
		} catch (error) {
			logger.error('Error during graceful shutdown', { signal, error });
		}

		if (typeof proc.exit === 'function') {
			proc.exit(0);
		}
	};

	proc.on('SIGINT', () => void shutdown('SIGINT'));
	proc.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const app = new Hono();

// CORS middleware
const allowedOrigins = isProduction
	? [env.FRONTEND_URL].filter(Boolean)
	: ['http://localhost:3500', 'http://localhost:3000'];

app.use(
	'/api/*',
	cors({
		origin: allowedOrigins,
		allowHeaders: ['Content-Type', 'Authorization'],
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		credentials: true,
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

// Play history routes
app.route('/api/play-history', playHistoryRoutes);

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
console.log(`🚀 Hono API server is running on http://localhost:${env.PORT}`);

server = serve({
	fetch: app.fetch,
	port: env.PORT,
});
