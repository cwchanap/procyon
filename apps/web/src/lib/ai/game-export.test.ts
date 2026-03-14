import { test, expect, describe, beforeEach } from 'bun:test';
import { GameExporter } from './game-export';
import type { GameExportData } from './game-export';

describe('GameExporter', () => {
	let exporter: GameExporter;

	beforeEach(() => {
		exporter = new GameExporter('chess');
	});

	describe('constructor', () => {
		test('should initialize with game variant', () => {
			const e = new GameExporter('chess');
			expect(e).toBeInstanceOf(GameExporter);
		});

		test('should initialize with ai config', () => {
			const config = { provider: 'gemini', model: 'gemini-2.5-flash-lite', enabled: true };
			const e = new GameExporter('xiangqi', config);
			expect(e).toBeInstanceOf(GameExporter);
		});

		test('should start with empty move history', () => {
			const text = exporter.exportToText('playing');
			expect(text).toContain('TOTAL MOVES: 0');
		});
	});

	describe('addMove', () => {
		test('should add a human move', () => {
			exporter.addMove(1, 'white', 'e2', 'e4', 'pawn');

			const text = exporter.exportToText('playing');
			expect(text).toContain('Move 1');
			expect(text).toContain('WHITE');
			expect(text).toContain('pawn');
			expect(text).toContain('e2 → e4');
		});

		test('should add a move with AI data', () => {
			exporter.addMove(1, 'black', 'e7', 'e5', 'pawn', {
				prompt: 'Test prompt',
				response: '{"move": {"from": "e7", "to": "e5"}}',
				reasoning: 'Control the center',
				confidence: 90,
			});

			const text = exporter.exportToText('playing');
			expect(text).toContain('AI PROMPT');
			expect(text).toContain('Test prompt');
			expect(text).toContain('AI RAW RESPONSE');
			expect(text).toContain('AI Reasoning: Control the center');
			expect(text).toContain('AI Confidence: 90%');
		});

		test('should add multiple moves', () => {
			exporter.addMove(1, 'white', 'e2', 'e4', 'pawn');
			exporter.addMove(2, 'black', 'e7', 'e5', 'pawn');
			exporter.addMove(3, 'white', 'd2', 'd4', 'pawn');

			const text = exporter.exportToText('playing');
			expect(text).toContain('TOTAL MOVES: 3');
			expect(text).toContain('Move 1');
			expect(text).toContain('Move 2');
			expect(text).toContain('Move 3');
		});
	});

	describe('exportToText', () => {
		test('should include game variant in header', () => {
			const text = exporter.exportToText('checkmate');
			expect(text).toContain('CHESS');
		});

		test('should include final status', () => {
			const text = exporter.exportToText('checkmate');
			expect(text).toContain('Final Status: checkmate');
		});

		test('should include start and end times', () => {
			const text = exporter.exportToText('playing');
			expect(text).toContain('Start Time:');
			expect(text).toContain('End Time:');
		});

		test('should include duration', () => {
			const text = exporter.exportToText('playing');
			expect(text).toContain('Duration:');
			expect(text).toContain('seconds');
		});

		test('should not include AI config when not set', () => {
			const text = exporter.exportToText('playing');
			expect(text).not.toContain('AI Configuration');
		});

		test('should include AI config when set', () => {
			const config = { provider: 'gemini', model: 'gemini-2.5-flash-lite', enabled: true };
			const e = new GameExporter('chess', config);

			const text = e.exportToText('playing');
			expect(text).toContain('AI Configuration');
			expect(text).toContain('gemini');
			expect(text).toContain('gemini-2.5-flash-lite');
		});

		test('should include separator lines', () => {
			const text = exporter.exportToText('playing');
			expect(text).toContain('='.repeat(80));
		});
	});

	describe('exportToJSON', () => {
		test('should return valid JSON string', () => {
			exporter.addMove(1, 'white', 'e2', 'e4', 'pawn');

			const json = exporter.exportToJSON('checkmate');
			const parsed = JSON.parse(json) as GameExportData;

			expect(parsed).toBeDefined();
			expect(parsed.gameVariant).toBe('chess');
			expect(parsed.finalStatus).toBe('checkmate');
		});

		test('should include moves in JSON', () => {
			exporter.addMove(1, 'white', 'e2', 'e4', 'pawn');
			exporter.addMove(2, 'black', 'e7', 'e5', 'pawn');

			const json = exporter.exportToJSON('playing');
			const parsed = JSON.parse(json) as GameExportData;

			expect(parsed.moves).toHaveLength(2);
			expect(parsed.moves[0]?.from).toBe('e2');
			expect(parsed.moves[0]?.to).toBe('e4');
			expect(parsed.moves[1]?.from).toBe('e7');
		});

		test('should include start and end time in JSON', () => {
			const json = exporter.exportToJSON('playing');
			const parsed = JSON.parse(json) as GameExportData;

			expect(parsed.startTime).toBeDefined();
			expect(parsed.endTime).toBeDefined();
		});

		test('should not include aiConfig when not set', () => {
			const json = exporter.exportToJSON('playing');
			const parsed = JSON.parse(json) as GameExportData;

			expect(parsed.aiConfig).toBeUndefined();
		});

		test('should include aiConfig when set', () => {
			const config = { provider: 'gemini', model: 'gemini-2.5-flash-lite', enabled: true };
			const e = new GameExporter('chess', config);

			const json = e.exportToJSON('playing');
			const parsed = JSON.parse(json) as GameExportData;

			expect(parsed.aiConfig).toBeDefined();
			expect(parsed.aiConfig?.provider).toBe('gemini');
			expect(parsed.aiConfig?.model).toBe('gemini-2.5-flash-lite');
			expect(parsed.aiConfig?.enabled).toBe(true);
		});

		test('should include AI data in move records', () => {
			exporter.addMove(1, 'black', 'e7', 'e5', 'pawn', {
				prompt: 'Test prompt',
				response: 'raw response',
				reasoning: 'Strategic center control',
				confidence: 85,
			});

			const json = exporter.exportToJSON('playing');
			const parsed = JSON.parse(json) as GameExportData;

			const move = parsed.moves[0];
			expect(move?.aiPrompt).toBe('Test prompt');
			expect(move?.aiResponse).toBe('raw response');
			expect(move?.aiReasoning).toBe('Strategic center control');
			expect(move?.aiConfidence).toBe(85);
		});
	});

	describe('clear', () => {
		test('should clear all moves', () => {
			exporter.addMove(1, 'white', 'e2', 'e4', 'pawn');
			exporter.addMove(2, 'black', 'e7', 'e5', 'pawn');

			exporter.clear();

			const text = exporter.exportToText('playing');
			expect(text).toContain('TOTAL MOVES: 0');
		});

		test('should reset start time on clear', () => {
			const textBefore = exporter.exportToText('playing');
			exporter.clear();
			const textAfter = exporter.exportToText('playing');

			// Both should have start times (the exact values may differ)
			expect(textBefore).toContain('Start Time:');
			expect(textAfter).toContain('Start Time:');
		});
	});

	describe('exportAndDownload', () => {
		test('should be a function', () => {
			expect(typeof exporter.exportAndDownload).toBe('function');
		});
	});
});
