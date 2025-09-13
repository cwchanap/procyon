import type { ChessPiece, PieceColor, PieceType, Position } from './types';
import { BOARD_SIZE } from './types';

export function createInitialBoard(): (ChessPiece | null)[][] {
  const board: (ChessPiece | null)[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

  // Place pawns
  for (let col = 0; col < BOARD_SIZE; col++) {
    board[1]![col] = { type: 'pawn', color: 'black' };
    board[6]![col] = { type: 'pawn', color: 'white' };
  }

  // Place other pieces
  const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let col = 0; col < BOARD_SIZE; col++) {
    board[0]![col] = { type: pieceOrder[col]!, color: 'black' };
    board[7]![col] = { type: pieceOrder[col]!, color: 'white' };
  }

  return board;
}

export function isValidPosition(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

export function getPieceAt(board: (ChessPiece | null)[][], pos: Position): ChessPiece | null {
  if (!isValidPosition(pos)) return null;
  return board[pos.row]?.[pos.col] ?? null;
}

export function setPieceAt(board: (ChessPiece | null)[][], pos: Position, piece: ChessPiece | null): void {
  if (!isValidPosition(pos)) return;
  if (board[pos.row]) {
    board[pos.row]![pos.col] = piece;
  }
}

export function isSquareEmpty(board: (ChessPiece | null)[][], pos: Position): boolean {
  return getPieceAt(board, pos) === null;
}

export function isSquareOccupiedByOpponent(board: (ChessPiece | null)[][], pos: Position, color: PieceColor): boolean {
  const piece = getPieceAt(board, pos);
  return piece !== null && piece.color !== color;
}

export function isSquareOccupiedByAlly(board: (ChessPiece | null)[][], pos: Position, color: PieceColor): boolean {
  const piece = getPieceAt(board, pos);
  return piece !== null && piece.color === color;
}

export function copyBoard(board: (ChessPiece | null)[][]): (ChessPiece | null)[][] {
  return board.map(row => [...row]);
}

export function positionToAlgebraic(pos: Position): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return `${files[pos.col]}${8 - pos.row}`;
}

export function algebraicToPosition(algebraic: string): Position {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const file = algebraic[0];
  const rank = algebraic[1];

  if (!file || !rank) {
    throw new Error(`Invalid algebraic notation: ${algebraic}`);
  }

  const col = files.indexOf(file);
  const row = 8 - parseInt(rank);

  if (col === -1 || isNaN(row)) {
    throw new Error(`Invalid algebraic notation: ${algebraic}`);
  }

  return { row, col };
}