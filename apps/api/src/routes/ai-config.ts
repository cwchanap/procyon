import { Hono } from 'hono';
import { getDB } from '../db/index';
import {
	aiConfigurations,
	type NewAiConfiguration,
	type AiConfiguration,
} from '../db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const app = new Hono();

// Validation schemas
const aiConfigSchema = z.object({
	provider: z.enum(['gemini', 'openrouter', 'openai', 'chutes']),
	modelName: z.string().min(1, 'Model name is required'),
	apiKey: z.string().min(1, 'API key is required'),
	isActive: z.boolean().optional().default(false),
});

const updateActiveConfigSchema = z.object({
	provider: z.enum(['gemini', 'openrouter', 'openai', 'chutes']),
	modelName: z.string().min(1, 'Model name is required'),
});

// Get all AI configurations for the authenticated user
app.get('/', authMiddleware, async c => {
	try {
		const user = getUser(c);
		const userId = user.userId;
		const db = getDB();

		const configs = await db
			.select()
			.from(aiConfigurations)
			.where(eq(aiConfigurations.userId, userId));

		// Don't return the actual API keys for security
		const safeConfigs = configs.map((config: AiConfiguration) => ({
			id: config.id,
			provider: config.provider,
			modelName: config.modelName,
			apiKey: config.apiKey ? '***' + config.apiKey.slice(-4) : '',
			hasApiKey: !!config.apiKey,
			isActive: config.isActive,
			createdAt: config.createdAt,
			updatedAt: config.updatedAt,
		}));

		return c.json({ configurations: safeConfigs });
	} catch (error) {
		console.error('Error fetching AI configurations:', error);
		return c.json({ error: 'Failed to fetch configurations' }, 500);
	}
});

// Create or update AI configuration
app.post('/', authMiddleware, zValidator('json', aiConfigSchema), async c => {
	try {
		const user = getUser(c);
		const userId = user.userId;
		const db = getDB();
		const { provider, modelName, apiKey, isActive } = c.req.valid('json');

		// Check if configuration already exists for this user, provider, and model
		const [existingConfig] = await db
			.select()
			.from(aiConfigurations)
			.where(
				and(
					eq(aiConfigurations.userId, userId),
					eq(aiConfigurations.provider, provider),
					eq(aiConfigurations.modelName, modelName)
				)
			);

		let savedConfig: AiConfiguration | undefined;

		if (existingConfig) {
			// Update existing configuration
			const [updatedConfig] = await db
				.update(aiConfigurations)
				.set({
					apiKey,
					isActive,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(aiConfigurations.id, existingConfig.id))
				.returning();
			savedConfig = updatedConfig;
		} else {
			// Create new configuration
			const newConfig: NewAiConfiguration = {
				userId,
				provider,
				modelName,
				apiKey,
				isActive,
			};

			const [insertedConfig] = await db
				.insert(aiConfigurations)
				.values(newConfig)
				.returning();
			savedConfig = insertedConfig;
		}

		if (!savedConfig) {
			throw new Error('Failed to persist AI configuration');
		}

		// If this config is set as active, deactivate others for this user
		if (isActive) {
			await db
				.update(aiConfigurations)
				.set({ isActive: false })
				.where(
					and(
						eq(aiConfigurations.userId, userId),
						ne(aiConfigurations.id, savedConfig.id)
					)
				);
		}

		return c.json({
			message: 'Configuration saved successfully',
			configuration: {
				id: savedConfig.id,
				provider: savedConfig.provider,
				modelName: savedConfig.modelName,
				hasApiKey: true,
				isActive: savedConfig.isActive,
			},
		});
	} catch (error) {
		console.error('Error saving AI configuration:', error);
		return c.json({ error: 'Failed to save configuration' }, 500);
	}
});

// Set active configuration
app.post(
	'/set-active',
	authMiddleware,
	zValidator('json', updateActiveConfigSchema),
	async c => {
		try {
			const user = getUser(c);
			const userId = user.userId;
			const db = getDB();
			const { provider, modelName } = c.req.valid('json');

			// First, deactivate all configurations for this user
			await db
				.update(aiConfigurations)
				.set({ isActive: false })
				.where(eq(aiConfigurations.userId, userId));

			// Then activate the specified configuration
			const updatedConfigs = await db
				.update(aiConfigurations)
				.set({
					isActive: true,
					updatedAt: new Date().toISOString(),
				})
				.where(
					and(
						eq(aiConfigurations.userId, userId),
						eq(aiConfigurations.provider, provider),
						eq(aiConfigurations.modelName, modelName)
					)
				)
				.returning();

			const [updatedConfig] = updatedConfigs;

			if (!updatedConfig) {
				return c.json({ error: 'Configuration not found' }, 404);
			}

			return c.json({
				message: 'Active configuration updated',
				configuration: {
					id: updatedConfig.id,
					provider: updatedConfig.provider,
					modelName: updatedConfig.modelName,
					isActive: updatedConfig.isActive,
				},
			});
		} catch (error) {
			console.error('Error setting active configuration:', error);
			return c.json({ error: 'Failed to update active configuration' }, 500);
		}
	}
);

// Get full API key for editing (security-sensitive endpoint)
app.get('/:id/full', authMiddleware, async c => {
	try {
		const user = getUser(c);
		const userId = user.userId;
		const db = getDB();
		const configId = parseInt(c.req.param('id'));

		if (isNaN(configId)) {
			return c.json({ error: 'Invalid configuration ID' }, 400);
		}

		const config = await db
			.select()
			.from(aiConfigurations)
			.where(
				and(
					eq(aiConfigurations.id, configId),
					eq(aiConfigurations.userId, userId)
				)
			)
			.limit(1);

		if (config.length === 0) {
			return c.json({ error: 'Configuration not found' }, 404);
		}

		return c.json({
			id: config[0]!.id,
			provider: config[0]!.provider,
			modelName: config[0]!.modelName,
			apiKey: config[0]!.apiKey,
			isActive: config[0]!.isActive,
		});
	} catch (error) {
		console.error('Error fetching full AI configuration:', error);
		return c.json({ error: 'Failed to fetch configuration' }, 500);
	}
});

// Delete AI configuration
app.delete('/:id', authMiddleware, async c => {
	try {
		const user = getUser(c);
		const userId = user.userId;
		const db = getDB();
		const configId = parseInt(c.req.param('id'));

		if (isNaN(configId)) {
			return c.json({ error: 'Invalid configuration ID' }, 400);
		}

		const result = await db
			.delete(aiConfigurations)
			.where(
				and(
					eq(aiConfigurations.id, configId),
					eq(aiConfigurations.userId, userId)
				)
			)
			.returning();

		if (result.length === 0) {
			return c.json({ error: 'Configuration not found' }, 404);
		}

		return c.json({ message: 'Configuration deleted successfully' });
	} catch (error) {
		console.error('Error deleting AI configuration:', error);
		return c.json({ error: 'Failed to delete configuration' }, 500);
	}
});

export default app;
