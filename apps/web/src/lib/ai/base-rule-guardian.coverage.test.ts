import { test, expect, describe, beforeEach } from 'bun:test';
import { BaseRuleGuardian } from './base-rule-guardian';
import { createInitialGameState } from '../chess/game';
import type { GameState } from '../chess/types';
import type { AIResponse } from './types';

// ---------------------------------------------------------------------------
// Test double: a minimal concrete guardian that keeps the default
// validateVariantRules (returns true) and default validateDrop (returns
// "not supported") hooks, so those default implementations are exercised
// directly rather than through variant subclasses that override them.
// ---------------------------------------------------------------------------

class TestRuleGuardian extends BaseRuleGuardian<GameState> {
	gameVariant = 'chess' as const;
}

describe('BaseRuleGuardian - parseMove', () => {
	test('parses a regular (non-drop) move into from/to positions', () => {
		const guardian = new TestRuleGuardian();
		const parsed = guardian.parseMove({ from: 'e2', to: 'e4' });
		expect(parsed.fromPos).toEqual({ row: 6, col: 4 });
		expect(parsed.toPos).toEqual({ row: 4, col: 4 });
		expect(parsed.isDrop).toBe(false);
	});

	test('parses a drop move (from === "*") with a sentinel from position', () => {
		const guardian = new TestRuleGuardian();
		const parsed = guardian.parseMove({ from: '*', to: 'e4' });
		expect(parsed.fromPos).toEqual({ row: -1, col: -1 });
		expect(parsed.toPos).toEqual({ row: 4, col: 4 });
		expect(parsed.isDrop).toBe(true);
	});
});

describe('BaseRuleGuardian - validateAIMove default hooks', () => {
	let guardian: TestRuleGuardian;
	let gameState: GameState;

	beforeEach(() => {
		guardian = new TestRuleGuardian();
		gameState = createInitialGameState();
	});

	test('default validateVariantRules accepts a well-formed own-piece move', () => {
		const response: AIResponse = {
			move: { from: 'e2', to: 'e4' },
			confidence: 0.9,
		};
		const result = guardian.validateAIMove(gameState, response);
		expect(result.isValid).toBe(true);
	});

	test('default validateDrop rejects a drop move as unsupported for the variant', () => {
		const response: AIResponse = {
			move: { from: '*', to: 'e4' },
			confidence: 0.8,
		};
		const result = guardian.validateAIMove(gameState, response);
		expect(result.isValid).toBe(false);
		expect(result.reason).toContain('Drop moves not supported by chess');
	});

	test('rejects out-of-bounds coordinates', () => {
		const response: AIResponse = {
			move: { from: 'e2', to: 'e9' },
			confidence: 0.3,
		};
		const result = guardian.validateAIMove(gameState, response);
		expect(result.isValid).toBe(false);
		expect(result.reason).toBe('Move coordinates out of bounds');
	});

	test('rejects when no piece is present at the from square', () => {
		const response: AIResponse = {
			move: { from: 'e4', to: 'e5' },
			confidence: 0.5,
		};
		const result = guardian.validateAIMove(gameState, response);
		expect(result.isValid).toBe(false);
		expect(result.reason).toContain('No piece at e4');
	});

	test('rejects when the from piece belongs to the opponent', () => {
		const response: AIResponse = {
			move: { from: 'e7', to: 'e5' },
			confidence: 0.5,
		};
		const result = guardian.validateAIMove(gameState, response);
		expect(result.isValid).toBe(false);
		expect(result.reason).toContain('Not your piece at e7');
	});

	test('catches errors thrown during parsing and reports an invalid format', () => {
		const guardian = new TestRuleGuardian();
		const gameState = createInitialGameState();
		const response: AIResponse = {
			// @ts-expect-error intentional malformed move field
			move: { from: null, to: 'e4' },
			confidence: 0.1,
		};
		const result = guardian.validateAIMove(gameState, response);
		expect(result.isValid).toBe(false);
		expect(result.reason).toContain('Invalid move format');
	});
});
