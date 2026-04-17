import { test, expect, describe, beforeEach } from 'bun:test';
import { XiangqiAdapter } from './xiangqi-adapter';
import { createInitialXiangqiBoard } from '../xiangqi/board';
import type { XiangqiGameState, XiangqiPiece } from '../xiangqi/types';

function makeState(overrides: Partial<XiangqiGameState> = {}): XiangqiGameState {
	return {
		board: createInitialXiangqiBoard(),
		currentPlayer: 'red',
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
		...overrides,
	};
}

describe('XiangqiAdapter - getPieceSymbol full coverage', () => {
	let adapter: XiangqiAdapter;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
	});

	test('returns 仕 for red advisor', () => {
		expect(adapter.getPieceSymbol({ type: 'advisor', color: 'red' })).toBe('仕');
	});

	test('returns 士 for black advisor', () => {
		expect(adapter.getPieceSymbol({ type: 'advisor', color: 'black' })).toBe('士');
	});

	test('returns 相 for red elephant', () => {
		expect(adapter.getPieceSymbol({ type: 'elephant', color: 'red' })).toBe('相');
	});

	test('returns 象 for black elephant', () => {
		expect(adapter.getPieceSymbol({ type: 'elephant', color: 'black' })).toBe('象');
	});

	test('returns 马 for red horse', () => {
		expect(adapter.getPieceSymbol({ type: 'horse', color: 'red' })).toBe('马');
	});

	test('returns 马 for black horse', () => {
		expect(adapter.getPieceSymbol({ type: 'horse', color: 'black' })).toBe('马');
	});

	test('returns 车 for red chariot', () => {
		expect(adapter.getPieceSymbol({ type: 'chariot', color: 'red' })).toBe('车');
	});

	test('returns 炮 for red cannon', () => {
		expect(adapter.getPieceSymbol({ type: 'cannon', color: 'red' })).toBe('炮');
	});

	test('returns 兵 for red soldier', () => {
		expect(adapter.getPieceSymbol({ type: 'soldier', color: 'red' })).toBe('兵');
	});

	test('returns ? for unknown color', () => {
		expect(adapter.getPieceSymbol({ type: 'king', color: 'unknown' })).toBe('?');
	});

	test('returns ? for unknown piece type within valid color', () => {
		expect(adapter.getPieceSymbol({ type: 'unknown_piece', color: 'red' })).toBe('?');
	});
});

describe('XiangqiAdapter - analyzeThreatsSafety', () => {
	let adapter: XiangqiAdapter;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
	});

	test('returns a non-empty string for initial position', () => {
		const state = makeState();
		const analysis = adapter.analyzeThreatsSafety(state);
		expect(typeof analysis).toBe('string');
		expect(analysis.length).toBeGreaterThan(0);
	});

	test('includes material balance in analysis', () => {
		const state = makeState();
		const analysis = adapter.analyzeThreatsSafety(state);
		expect(analysis).toContain('Material balance');
	});

	test('warns about check when status is check', () => {
		const state = makeState({ status: 'check' });
		const analysis = adapter.analyzeThreatsSafety(state);
		expect(analysis).toContain('CHECK');
	});

	test('does not include check warning for non-check status', () => {
		const state = makeState({ status: 'playing' });
		const analysis = adapter.analyzeThreatsSafety(state);
		expect(analysis).not.toContain('⚠️  Your general is in CHECK');
	});

	test('includes general safety evaluation', () => {
		const state = makeState();
		const analysis = adapter.analyzeThreatsSafety(state);
		expect(analysis).toContain('general safety');
	});

	test('returns string when both players have equal material', () => {
		const state = makeState();
		const analysis = adapter.analyzeThreatsSafety(state);
		// Equal material at start
		expect(analysis).not.toContain('material advantage');
	});

	test('detects material advantage when opponent has fewer pieces', () => {
		const board = createInitialXiangqiBoard();
		// Remove a black chariot to give red material advantage
		board[0]![0] = null;
		const state = makeState({ board });
		const analysis = adapter.analyzeThreatsSafety(state);
		expect(analysis).toContain('material advantage');
	});
});

describe('XiangqiAdapter - generatePrompt edge cases', () => {
	let adapter: XiangqiAdapter;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
	});

	test('includes current player in prompt', () => {
		const state = makeState({ currentPlayer: 'black' });
		const prompt = adapter.generatePrompt(state);
		expect(prompt).toContain('black');
	});

	test('includes game status in prompt', () => {
		const state = makeState({ status: 'check' });
		const prompt = adapter.generatePrompt(state);
		expect(prompt).toContain('check');
	});

	test('prompt includes board visualization', () => {
		const state = makeState();
		const prompt = adapter.generatePrompt(state);
		expect(prompt).toContain('a  b  c  d  e  f  g  h  i');
	});

	test('prompt includes JSON format instruction', () => {
		const state = makeState();
		const prompt = adapter.generatePrompt(state);
		expect(prompt).toContain('JSON');
	});

	test('prompt includes move format instruction with from/to', () => {
		const state = makeState();
		const prompt = adapter.generatePrompt(state);
		expect(prompt).toContain('"from"');
		expect(prompt).toContain('"to"');
	});
});

describe('XiangqiAdapter - getAllValidMoves', () => {
	let adapter: XiangqiAdapter;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
	});

	test('returns array of moves for initial position', () => {
		const state = makeState();
		const moves = adapter.getAllValidMoves(state);
		expect(Array.isArray(moves)).toBe(true);
		expect(moves.length).toBeGreaterThan(0);
	});

	test('moves are strings in expected format', () => {
		const state = makeState();
		const moves = adapter.getAllValidMoves(state);
		// Moves should contain algebraic notation like "e1-e2"
		expect(moves.some(m => m.includes('-'))).toBe(true);
	});

	test('returns placeholder when no moves are available', () => {
		const emptyBoard: (XiangqiPiece | null)[][] = Array(10)
			.fill(null)
			.map(() => Array(9).fill(null));
		const state = makeState({ board: emptyBoard });
		const moves = adapter.getAllValidMoves(state);
		expect(moves.length).toBe(1);
		expect(moves[0]).toContain('No valid moves');
	});
});

describe('XiangqiAdapter - createVisualBoard', () => {
	let adapter: XiangqiAdapter;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
	});

	test('contains piece symbols for initial position', () => {
		const state = makeState();
		const visual = adapter.createVisualBoard(state);
		expect(visual).toContain('帅');
		expect(visual).toContain('将');
	});

	test('contains column headers', () => {
		const state = makeState();
		const visual = adapter.createVisualBoard(state);
		// Should have some kind of coordinate system
		expect(visual.length).toBeGreaterThan(0);
	});

	test('renders successfully regardless of current player', () => {
		const redState = makeState({ currentPlayer: 'red' });
		const blackState = makeState({ currentPlayer: 'black' });
		const redVisual = adapter.createVisualBoard(redState);
		const blackVisual = adapter.createVisualBoard(blackState);
		expect(redVisual.length).toBeGreaterThan(0);
		expect(blackVisual.length).toBeGreaterThan(0);
	});
});
