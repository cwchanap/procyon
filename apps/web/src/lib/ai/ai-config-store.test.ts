import { describe, test, expect, beforeEach } from 'bun:test';
import {
	subscribe,
	getSnapshot,
	setConfig,
	setModel,
	setAIPlayer,
	setProvider,
	hydrate,
} from './ai-config-store';
import { defaultAIConfig } from './storage';

describe('ai-config-store', () => {
	beforeEach(() => {
		// reset to defaults via setConfig
		setConfig(defaultAIConfig);
		setAIPlayer('black');
	});

	test('initial snapshot is defaults with black AI', () => {
		expect(getSnapshot().config).toEqual(defaultAIConfig);
		expect(getSnapshot().aiPlayer).toBe('black');
	});

	test('setModel updates config', () => {
		setModel('gemini-2.5-pro');
		expect(getSnapshot().config.model).toBe('gemini-2.5-pro');
	});

	test('setAIPlayer updates aiPlayer', () => {
		setAIPlayer('white');
		expect(getSnapshot().aiPlayer).toBe('white');
	});

	test('subscribe is notified on change and unsubscribes', () => {
		let calls = 0;
		const unsub = subscribe(() => calls++);
		setModel('gpt-4o');
		setAIPlayer('white');
		expect(calls).toBe(2);
		unsub();
		setModel('gemini-2.5-pro');
		expect(calls).toBe(2);
	});

	test('setProvider returns error message when fetch fails', async () => {
		const err = await setProvider('openai');
		// No auth / no network in test → expect a non-null error string
		expect(typeof err).toBe('string');
		expect(err!.length).toBeGreaterThan(0);
	});

	test('hydrate does not throw and leaves a valid snapshot', async () => {
		await expect(hydrate()).resolves.toBeUndefined();
		expect(getSnapshot().config).toBeTruthy();
	});
});
