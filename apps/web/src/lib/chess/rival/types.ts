import type { AIConfig } from '../../ai/types';
import type { ChessMoveRequest, PieceColor } from '../types';

export type RivalKind = 'engine' | 'llm';
export type ChessSide = PieceColor;

export type EngineOpponent = { kind: 'engine'; id: 'stockfish' };
export type LlmOpponent = {
	kind: 'llm';
	provider: string;
	model: string;
};
export type ChessOpponent = EngineOpponent | LlmOpponent;

export interface GameSetup {
	rivalKind: RivalKind;
	humanSide: ChessSide;
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
