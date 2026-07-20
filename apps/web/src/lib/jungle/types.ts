import type {
	BaseGameState,
	BaseMove,
	GameStatus as SharedGameStatus,
	Position as GameCorePosition,
} from '@procyon/game-core';

export type JunglePieceType =
	| 'elephant' // 象 (8) - Strongest
	| 'lion' // 獅 (7)
	| 'tiger' // 虎 (6)
	| 'leopard' // 豹 (5)
	| 'dog' // 狗 (4)
	| 'wolf' // 狼 (3)
	| 'cat' // 貓 (2)
	| 'rat'; // 鼠 (1) - Weakest but can defeat elephant

export type JunglePieceColor = 'red' | 'blue';

export interface JunglePiece {
	type: JunglePieceType;
	color: JunglePieceColor;
	rank: number; // 1-8, used for capture rules
}

export type JunglePosition = GameCorePosition;

export interface JungleMove extends BaseMove<JunglePiece> {
	from: JunglePosition;
	to: JunglePosition;
}

export type JungleGameStatus = SharedGameStatus;

export type JungleTerrainType =
	| 'normal'
	| 'water' // River tiles
	| 'trap' // Trap tiles
	| 'den'; // Den tiles

export interface JungleTerrain {
	type: JungleTerrainType;
	owner?: JunglePieceColor; // For traps and dens
}

export interface JungleGameState extends BaseGameState<JunglePiece> {
	status: JungleGameStatus;
	currentPlayer: JunglePieceColor;
	moveHistory: JungleMove[];
	terrain: JungleTerrain[][];
}

// Constants for Jungle chess
export const JUNGLE_ROWS = 9;
export const JUNGLE_COLS = 7;

export function getRow(
	board: (JunglePiece | null)[][],
	row: number
): (JunglePiece | null)[] {
	const r = board[row];
	if (!r) throw new Error(`Jungle board row ${row} is missing`);
	return r;
}

export function getTerrainRow(
	terrain: JungleTerrain[][],
	row: number
): JungleTerrain[] {
	const r = terrain[row];
	if (!r) throw new Error(`Jungle terrain row ${row} is missing`);
	return r;
}

// Piece ranks for capture rules
export const PIECE_RANKS: Record<JunglePieceType, number> = {
	elephant: 8,
	lion: 7,
	tiger: 6,
	leopard: 5,
	dog: 4,
	wolf: 3,
	cat: 2,
	rat: 1,
};

// Special rule: rat can capture elephant
export function canCapture(
	attacker: JunglePiece,
	defender: JunglePiece
): boolean {
	// Rat can capture elephant
	if (attacker.type === 'rat' && defender.type === 'elephant') {
		return true;
	}
	// Elephant cannot capture rat
	if (attacker.type === 'elephant' && defender.type === 'rat') {
		return false;
	}
	// Normal capture: higher or equal rank captures lower rank
	return attacker.rank >= defender.rank;
}

// Board coordinates for display
export const JUNGLE_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
export const JUNGLE_RANKS = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

// Piece symbols for display
export const JUNGLE_SYMBOLS = {
	red: {
		elephant: '象',
		lion: '獅',
		tiger: '虎',
		leopard: '豹',
		dog: '狗',
		wolf: '狼',
		cat: '貓',
		rat: '鼠',
	},
	blue: {
		elephant: '象',
		lion: '獅',
		tiger: '虎',
		leopard: '豹',
		dog: '狗',
		wolf: '狼',
		cat: '貓',
		rat: '鼠',
	},
};

// Terrain setup
export function createInitialTerrain(): JungleTerrain[][] {
	const terrain: JungleTerrain[][] = Array(JUNGLE_ROWS)
		.fill(null)
		.map(() => Array(JUNGLE_COLS).fill({ type: 'normal' as const }));

	// River tiles (rows 3-5, cols 1-2 and 4-5)
	for (let row = 3; row <= 5; row++) {
		for (let col = 1; col <= 2; col++) {
			getTerrainRow(terrain, row)[col] = { type: 'water' };
		}
		for (let col = 4; col <= 5; col++) {
			getTerrainRow(terrain, row)[col] = { type: 'water' };
		}
	}

	// Red dens and traps (bottom)
	getTerrainRow(terrain, 8)[3] = { type: 'den', owner: 'red' };
	getTerrainRow(terrain, 8)[2] = { type: 'trap', owner: 'red' };
	getTerrainRow(terrain, 8)[4] = { type: 'trap', owner: 'red' };
	getTerrainRow(terrain, 7)[3] = { type: 'trap', owner: 'red' };

	// Blue dens and traps (top)
	getTerrainRow(terrain, 0)[3] = { type: 'den', owner: 'blue' };
	getTerrainRow(terrain, 0)[2] = { type: 'trap', owner: 'blue' };
	getTerrainRow(terrain, 0)[4] = { type: 'trap', owner: 'blue' };
	getTerrainRow(terrain, 1)[3] = { type: 'trap', owner: 'blue' };

	return terrain;
}

// Special movement rules
export function canEnterWater(piece: JunglePiece): boolean {
	return piece.type === 'rat';
}

export function canJumpRiver(piece: JunglePiece): boolean {
	return piece.type === 'lion' || piece.type === 'tiger';
}

export function isTrapActive(
	terrain: JungleTerrain,
	piece: JunglePiece
): boolean {
	return terrain.type === 'trap' && terrain.owner !== piece.color;
}

export function isInDen(terrain: JungleTerrain, piece: JunglePiece): boolean {
	return terrain.type === 'den' && terrain.owner !== piece.color;
}
