import { test, expect, describe } from 'bun:test';
import { GAME_CONFIGS } from './game-variant-types';
import type { GameVariant, GameVariantConfig } from './game-variant-types';

const VARIANTS: GameVariant[] = ['chess', 'xiangqi', 'shogi', 'jungle'];

describe('GAME_CONFIGS', () => {
	test('has an entry for every supported game variant', () => {
		for (const variant of VARIANTS) {
			expect(GAME_CONFIGS).toHaveProperty(variant);
		}
	});

	test('has exactly the expected game variants', () => {
		expect(Object.keys(GAME_CONFIGS).sort()).toEqual([...VARIANTS].sort());
	});

	describe('chess config', () => {
		const cfg: GameVariantConfig = GAME_CONFIGS.chess;

		test('board is 8x8', () => {
			expect(cfg.boardSize.rows).toBe(8);
			expect(cfg.boardSize.cols).toBe(8);
		});

		test('has 8 files (a-h)', () => {
			expect(cfg.files).toHaveLength(8);
			expect(cfg.files[0]).toBe('a');
			expect(cfg.files[7]).toBe('h');
		});

		test('has 8 ranks (8-1)', () => {
			expect(cfg.ranks).toHaveLength(8);
			expect(cfg.ranks[0]).toBe('8');
			expect(cfg.ranks[7]).toBe('1');
		});

		test('players are white and black', () => {
			expect(cfg.players).toContain('white');
			expect(cfg.players).toContain('black');
			expect(cfg.players).toHaveLength(2);
		});

		test('initial player is white', () => {
			expect(cfg.initialPlayer).toBe('white');
		});

		test('white has 6 piece symbols', () => {
			const whitePieces = cfg.pieceSymbols['white'];
			expect(whitePieces).toBeDefined();
			expect(Object.keys(whitePieces!)).toHaveLength(6);
		});

		test('black has 6 piece symbols', () => {
			const blackPieces = cfg.pieceSymbols['black'];
			expect(blackPieces).toBeDefined();
			expect(Object.keys(blackPieces!)).toHaveLength(6);
		});

		test('white king symbol is ♔', () => {
			expect(cfg.pieceSymbols['white']?.['king']).toBe('♔');
		});

		test('black king symbol is ♚', () => {
			expect(cfg.pieceSymbols['black']?.['king']).toBe('♚');
		});

		test('white pawn symbol is ♙', () => {
			expect(cfg.pieceSymbols['white']?.['pawn']).toBe('♙');
		});

		test('black queen symbol is ♛', () => {
			expect(cfg.pieceSymbols['black']?.['queen']).toBe('♛');
		});
	});

	describe('xiangqi config', () => {
		const cfg: GameVariantConfig = GAME_CONFIGS.xiangqi;

		test('board is 10x9', () => {
			expect(cfg.boardSize.rows).toBe(10);
			expect(cfg.boardSize.cols).toBe(9);
		});

		test('has 9 files (a-i)', () => {
			expect(cfg.files).toHaveLength(9);
			expect(cfg.files[0]).toBe('a');
			expect(cfg.files[8]).toBe('i');
		});

		test('has 10 ranks', () => {
			expect(cfg.ranks).toHaveLength(10);
			expect(cfg.ranks[0]).toBe('10');
			expect(cfg.ranks[9]).toBe('1');
		});

		test('players are red and black', () => {
			expect(cfg.players).toContain('red');
			expect(cfg.players).toContain('black');
			expect(cfg.players).toHaveLength(2);
		});

		test('initial player is red', () => {
			expect(cfg.initialPlayer).toBe('red');
		});

		test('red has 7 piece types', () => {
			const redPieces = cfg.pieceSymbols['red'];
			expect(redPieces).toBeDefined();
			expect(Object.keys(redPieces!)).toHaveLength(7);
		});

		test('red king symbol is 帅', () => {
			expect(cfg.pieceSymbols['red']?.['king']).toBe('帅');
		});

		test('black king symbol is 将', () => {
			expect(cfg.pieceSymbols['black']?.['king']).toBe('将');
		});
	});

	describe('shogi config', () => {
		const cfg: GameVariantConfig = GAME_CONFIGS.shogi;

		test('board is 9x9', () => {
			expect(cfg.boardSize.rows).toBe(9);
			expect(cfg.boardSize.cols).toBe(9);
		});

		test('has 9 files', () => {
			expect(cfg.files).toHaveLength(9);
		});

		test('has 9 ranks', () => {
			expect(cfg.ranks).toHaveLength(9);
		});

		test('players are sente and gote', () => {
			expect(cfg.players).toContain('sente');
			expect(cfg.players).toContain('gote');
			expect(cfg.players).toHaveLength(2);
		});

		test('initial player is sente', () => {
			expect(cfg.initialPlayer).toBe('sente');
		});

		test('sente has promoted piece symbols', () => {
			const sentePieces = cfg.pieceSymbols['sente'];
			expect(sentePieces).toBeDefined();
			expect(sentePieces!['dragon']).toBeDefined();
			expect(sentePieces!['promoted_pawn']).toBe('と');
		});

		test('gote has promoted piece symbols', () => {
			const gotePieces = cfg.pieceSymbols['gote'];
			expect(gotePieces).toBeDefined();
			expect(gotePieces!['horse']).toBeDefined();
		});

		test('sente king symbol is 玉', () => {
			expect(cfg.pieceSymbols['sente']?.['king']).toBe('玉');
		});

		test('gote king symbol is 王', () => {
			expect(cfg.pieceSymbols['gote']?.['king']).toBe('王');
		});
	});

	describe('jungle config', () => {
		const cfg: GameVariantConfig = GAME_CONFIGS.jungle;

		test('board is 9x7', () => {
			expect(cfg.boardSize.rows).toBe(9);
			expect(cfg.boardSize.cols).toBe(7);
		});

		test('has 7 files (a-g)', () => {
			expect(cfg.files).toHaveLength(7);
			expect(cfg.files[0]).toBe('a');
			expect(cfg.files[6]).toBe('g');
		});

		test('has 9 ranks', () => {
			expect(cfg.ranks).toHaveLength(9);
			expect(cfg.ranks[0]).toBe('9');
			expect(cfg.ranks[8]).toBe('1');
		});

		test('players are red and blue', () => {
			expect(cfg.players).toContain('red');
			expect(cfg.players).toContain('blue');
			expect(cfg.players).toHaveLength(2);
		});

		test('initial player is red', () => {
			expect(cfg.initialPlayer).toBe('red');
		});

		test('each player has 8 piece types', () => {
			expect(Object.keys(cfg.pieceSymbols['red']!)).toHaveLength(8);
			expect(Object.keys(cfg.pieceSymbols['blue']!)).toHaveLength(8);
		});

		test('red has all 8 jungle piece types', () => {
			const redPieces = cfg.pieceSymbols['red']!;
			for (const type of [
				'elephant',
				'lion',
				'tiger',
				'leopard',
				'dog',
				'wolf',
				'cat',
				'rat',
			]) {
				expect(redPieces[type]).toBeDefined();
			}
		});

		test('red and blue share the same piece symbols', () => {
			const redPieces = cfg.pieceSymbols['red']!;
			const bluePieces = cfg.pieceSymbols['blue']!;
			for (const type of Object.keys(redPieces)) {
				expect(redPieces[type]).toBe(bluePieces[type]);
			}
		});
	});

	describe('all configs structural validation', () => {
		for (const variant of VARIANTS) {
			describe(`${variant}`, () => {
				const cfg = GAME_CONFIGS[variant];

				test('boardSize has positive rows and cols', () => {
					expect(cfg.boardSize.rows).toBeGreaterThan(0);
					expect(cfg.boardSize.cols).toBeGreaterThan(0);
				});

				test('files count matches boardSize.cols', () => {
					expect(cfg.files).toHaveLength(cfg.boardSize.cols);
				});

				test('ranks count matches boardSize.rows', () => {
					expect(cfg.ranks).toHaveLength(cfg.boardSize.rows);
				});

				test('has exactly 2 players', () => {
					expect(cfg.players).toHaveLength(2);
				});

				test('initialPlayer is one of the defined players', () => {
					expect(cfg.players).toContain(cfg.initialPlayer);
				});

				test('pieceSymbols has an entry for each player', () => {
					for (const player of cfg.players) {
						expect(cfg.pieceSymbols).toHaveProperty(player);
					}
				});

				test('all piece symbol values are non-empty strings', () => {
					for (const player of cfg.players) {
						const symbols = cfg.pieceSymbols[player]!;
						for (const [, symbol] of Object.entries(symbols)) {
							expect(typeof symbol).toBe('string');
							expect(symbol.length).toBeGreaterThan(0);
						}
					}
				});
			});
		}
	});
});
