import { describe, expect, test } from 'bun:test';
import {
	createBestMoveCollector,
	formatGoCommand,
	formatIsReadyCommand,
	formatPositionCommand,
	formatSetSkillLevelCommand,
	formatUciNewGameCommand,
	isReadyOk,
	isUciOk,
	parseBestMove,
	parseUciOption,
} from './stockfish-protocol';

describe('Stockfish UCI protocol', () => {
	test('detects uciok', () => {
		expect(isUciOk('uciok')).toBe(true);
		expect(isUciOk('  uciok  ')).toBe(true);
		expect(isUciOk('id name Stockfish')).toBe(false);
	});

	test('parses advertised Skill Level option', () => {
		expect(
			parseUciOption(
				'option name Skill Level type spin default 20 min 0 max 20'
			)
		).toEqual({ name: 'Skill Level' });
		expect(parseUciOption('option name Hash type spin default 16')).toBeNull();
	});

	test('detects readyok', () => {
		expect(isReadyOk('readyok')).toBe(true);
		expect(isReadyOk('  readyok  ')).toBe(true);
		expect(isReadyOk('info string ready')).toBe(false);
	});

	test('formats setoption name Skill Level value 0', () => {
		expect(formatSetSkillLevelCommand(0)).toBe(
			'setoption name Skill Level value 0'
		);
	});

	test('formats ucinewgame, isready, position fen, and go movetime', () => {
		const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
		expect(formatUciNewGameCommand()).toBe('ucinewgame');
		expect(formatIsReadyCommand()).toBe('isready');
		expect(formatPositionCommand(fen)).toBe(`position fen ${fen}`);
		expect(formatGoCommand(250)).toBe('go movetime 250');
	});

	test('parses bestmove e7e5', () => {
		expect(parseBestMove('bestmove e7e5')).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
		});
	});

	test('parses bestmove e7e8q as queen promotion', () => {
		expect(parseBestMove('bestmove e7e8q')).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e8', promotion: 'queen' },
		});
	});

	test('maps r/b/n promotion suffixes to long-form values', () => {
		expect(parseBestMove('bestmove a7a8r')).toEqual({
			ok: true,
			move: { from: 'a7', to: 'a8', promotion: 'rook' },
		});
		expect(parseBestMove('bestmove a7a8b')).toEqual({
			ok: true,
			move: { from: 'a7', to: 'a8', promotion: 'bishop' },
		});
		expect(parseBestMove('bestmove a7a8n')).toEqual({
			ok: true,
			move: { from: 'a7', to: 'a8', promotion: 'knight' },
		});
	});

	test('ignores optional ponder suffix', () => {
		expect(parseBestMove('bestmove e7e5 ponder e2e4')).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
		});
		expect(parseBestMove('bestmove e7e8q ponder a7a8q')).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e8', promotion: 'queen' },
		});
	});

	test('maps bestmove (none) to typed no-move failure', () => {
		expect(parseBestMove('bestmove (none)')).toEqual({
			ok: false,
			reason: 'no-move',
		});
		expect(parseBestMove('bestmove (none) ponder e2e4')).toEqual({
			ok: false,
			reason: 'no-move',
		});
	});

	test('rejects malformed coordinates and unsupported promotion suffixes', () => {
		expect(parseBestMove('bestmove e7e')).toEqual({
			ok: false,
			reason: 'invalid-response',
		});
		expect(parseBestMove('bestmove z9z9')).toEqual({
			ok: false,
			reason: 'invalid-response',
		});
		expect(parseBestMove('bestmove e7e5x')).toEqual({
			ok: false,
			reason: 'invalid-response',
		});
	});

	test('ignores non-terminal info lines', () => {
		expect(parseBestMove('info depth 12 seldepth 18')).toBeNull();
		expect(parseBestMove('info string thinking...')).toBeNull();
	});

	test('allows exactly one accepted bestmove per request', () => {
		const collector = createBestMoveCollector();

		expect(collector.acceptLine('info depth 10')).toBeNull();
		expect(collector.isComplete()).toBe(false);

		expect(collector.acceptLine('bestmove e7e5')).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
		});
		expect(collector.isComplete()).toBe(true);

		expect(collector.acceptLine('bestmove g1f3')).toBeNull();
		expect(collector.acceptLine('info score cp 12')).toBeNull();
	});
});
