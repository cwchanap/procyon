import type { AIConfig } from '../../ai/types';
import type { ChessMoveRequest, PieceColor } from '../types';

export type RivalKind = 'engine' | 'llm';
export type ChessSide = PieceColor;

/**
 * Canonical local-engine difficulty vocabulary, ordered from weakest to
 * strongest. Single source of truth for labels and values; the Stockfish
 * provider maps these to engine options in a later task.
 */
export const ENGINE_DIFFICULTIES = [
	{ value: 'casual', label: 'Casual' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'strong', label: 'Strong' },
] as const satisfies readonly { value: string; label: string }[];

export type EngineDifficulty = (typeof ENGINE_DIFFICULTIES)[number]['value'];

export function isEngineDifficulty(value: unknown): value is EngineDifficulty {
	return ENGINE_DIFFICULTIES.some(option => option.value === value);
}

export function getEngineDifficultyLabel(value: EngineDifficulty): string {
	return ENGINE_DIFFICULTIES.find(option => option.value === value)!.label;
}

export type EngineOpponent = {
	kind: 'engine';
	id: 'stockfish';
	difficulty: EngineDifficulty;
};
export type LlmOpponent = {
	kind: 'llm';
	provider: string;
	model: string;
};
export type ChessOpponent = EngineOpponent | LlmOpponent;

export interface GameSetup {
	rivalKind: RivalKind;
	humanSide: ChessSide;
	engineDifficulty: EngineDifficulty;
}

export interface ActiveRivalSession {
	id: number;
	opponent: ChessOpponent;
	humanSide: ChessSide;
	rivalSide: ChessSide;
	startedByUserId: string | null;
	/** Frozen AI config captured at Start for LLM sessions. Engine sessions omit it. */
	startedConfig?: AIConfig;
}

export type EnginePreflight =
	| { status: 'supported' }
	| { status: 'unsupported'; message: string };

export type LlmUsability =
	| { status: 'loading' }
	| { status: 'signed-out' }
	| { status: 'unconfigured' }
	| { status: 'available'; provider: string; model: string };

export type RivalMoveFailureReason =
	| 'no-move'
	| 'invalid-response'
	| 'invalid-move'
	| 'protocol-error'
	| 'timeout';

export interface RivalMoveMeta {
	thinking?: string;
	confidence?: number;
	interaction?: { prompt?: string; response?: string };
}

export type RivalMoveResult =
	| { ok: true; move: ChessMoveRequest; meta?: RivalMoveMeta }
	| { ok: false; reason: RivalMoveFailureReason; message?: string };

export function getRivalSide(humanSide: ChessSide): ChessSide {
	return humanSide === 'white' ? 'black' : 'white';
}

export function isRivalMoveSuccess(
	result: RivalMoveResult
): result is Extract<RivalMoveResult, { ok: true }> {
	return result.ok;
}
