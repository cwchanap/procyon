import type { Position } from './types';

export interface CoordinateScheme {
	files: string[];
	ranks: string[];
}

export function posToNotation(scheme: CoordinateScheme, pos: Position): string {
	return `${scheme.files[pos.col]}${scheme.ranks[pos.row]}`;
}

export function notationToPos(scheme: CoordinateScheme, str: string): Position {
	if (str.length < 2) {
		throw new Error(`Invalid notation: ${str}`);
	}
	const file = str[0]!;
	const rank = str.slice(1);
	const col = scheme.files.indexOf(file);
	const row = scheme.ranks.indexOf(rank);
	if (col === -1 || row === -1) {
		throw new Error(`Invalid notation: ${str}`);
	}
	return { row, col };
}

export function tryNotationToPos(
	scheme: CoordinateScheme,
	str: string
): Position | null {
	try {
		return notationToPos(scheme, str);
	} catch {
		return null;
	}
}
