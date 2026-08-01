import type { ChessSquare, PromotionPiece } from '../types';
import type { RivalMoveResult } from './types';

export interface UciOption {
	name: string;
}

const SKILL_LEVEL_OPTION_PREFIX = 'option name Skill Level';
const BESTMOVE_PREFIX = 'bestmove ';
const UCI_SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTION_SUFFIX: Record<string, PromotionPiece> = {
	q: 'queen',
	r: 'rook',
	b: 'bishop',
	n: 'knight',
};

function trimLine(line: string): string {
	return line.trim();
}

export function isUciOk(line: string): boolean {
	return trimLine(line) === 'uciok';
}

export function isReadyOk(line: string): boolean {
	return trimLine(line) === 'readyok';
}

export function parseUciOption(line: string): UciOption | null {
	const trimmed = trimLine(line);
	if (!trimmed.startsWith(SKILL_LEVEL_OPTION_PREFIX)) {
		return null;
	}

	const remainder = trimmed.slice(SKILL_LEVEL_OPTION_PREFIX.length);
	if (remainder !== '' && !remainder.startsWith(' ')) {
		return null;
	}

	return { name: 'Skill Level' };
}

export function formatSetSkillLevelCommand(value: number): string {
	return `setoption name Skill Level value ${value}`;
}

export function formatUciNewGameCommand(): string {
	return 'ucinewgame';
}

export function formatIsReadyCommand(): string {
	return 'isready';
}

export function formatPositionCommand(fen: string): string {
	return `position fen ${fen}`;
}

export function formatGoCommand(movetimeMs: number): string {
	return `go movetime ${movetimeMs}`;
}

function parseSquare(value: string): ChessSquare | null {
	return UCI_SQUARE_PATTERN.test(value) ? (value as ChessSquare) : null;
}

function invalidResponse(): RivalMoveResult {
	return { ok: false, reason: 'invalid-response' };
}

export function parseBestMove(line: string): RivalMoveResult | null {
	const trimmed = trimLine(line);
	if (!trimmed.startsWith(BESTMOVE_PREFIX)) {
		return null;
	}

	const payload = trimmed.slice(BESTMOVE_PREFIX.length);
	const tokens = payload.split(/\s+/);
	const moveToken = tokens[0];
	if (moveToken === undefined) {
		return invalidResponse();
	}

	if (moveToken === '(none)') {
		return { ok: false, reason: 'no-move' };
	}

	if (moveToken.length < 4) {
		return invalidResponse();
	}

	const from = parseSquare(moveToken.slice(0, 2));
	const to = parseSquare(moveToken.slice(2, 4));
	if (from === null || to === null) {
		return invalidResponse();
	}

	const promotionSuffix = moveToken.slice(4, 5);
	if (promotionSuffix === '') {
		return { ok: true, move: { from, to } };
	}

	const promotion = PROMOTION_SUFFIX[promotionSuffix];
	if (promotion === undefined) {
		return invalidResponse();
	}

	return { ok: true, move: { from, to, promotion } };
}

export interface BestMoveCollector {
	acceptLine(line: string): RivalMoveResult | null;
	isComplete(): boolean;
}

export function createBestMoveCollector(): BestMoveCollector {
	let complete = false;

	return {
		acceptLine(line: string): RivalMoveResult | null {
			if (complete) {
				return null;
			}

			const parsed = parseBestMove(line);
			if (parsed === null) {
				return null;
			}

			complete = true;
			return parsed;
		},
		isComplete(): boolean {
			return complete;
		},
	};
}
