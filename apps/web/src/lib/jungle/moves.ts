import type { JunglePiece, JunglePosition, JungleTerrain } from './types';
import {
    canCapture,
    canEnterWater,
    canJumpRiver,
    JUNGLE_ROWS,
    JUNGLE_COLS,
} from './types';
import {
    getPieceAt,
    getTerrainAt,
    isValidPosition,
    positionsEqual,
    isWaterPosition,
} from './board';

/**
 * Get all possible moves for a piece at a given position
 */
export function getPossibleMoves(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    position: JunglePosition
): JunglePosition[] {
    const piece = getPieceAt(board, position);
    if (!piece) {
        return [];
    }

    const moves: JunglePosition[] = [];
    const basicMoves = getBasicMoves(board, terrain, position, piece);

    for (const move of basicMoves) {
        if (isValidMove(board, terrain, position, move)) {
            moves.push(move);
        }
    }

    return moves;
}

/**
 * Get basic movement options for a piece (before validation)
 */
function getBasicMoves(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    position: JunglePosition,
    piece: JunglePiece
): JunglePosition[] {
    const moves: JunglePosition[] = [];
    const { row, col } = position;

    // Normal adjacent moves (up, down, left, right)
    const directions = [
        { row: -1, col: 0 }, // up
        { row: 1, col: 0 }, // down
        { row: 0, col: -1 }, // left
        { row: 0, col: 1 }, // right
    ];

    for (const dir of directions) {
        const newRow = row + dir.row;
        const newCol = col + dir.col;
        const newPos = { row: newRow, col: newCol };

        if (isValidPosition(newPos)) {
            // Check if piece can enter this terrain
            if (canEnterTerrain(piece, getTerrainAt(terrain, newPos))) {
                moves.push(newPos);
            }
        }
    }

    // Special river jumping for lions and tigers
    if (canJumpRiver(piece)) {
        const jumpMoves = getRiverJumpMoves(board, terrain, position, piece);
        moves.push(...jumpMoves);
    }

    return moves;
}

/**
 * Check if a piece can enter specific terrain
 */
function canEnterTerrain(_piece: JunglePiece, terrain: JungleTerrain): boolean {
    switch (terrain.type) {
        case 'water':
            return canEnterWater(_piece);
        case 'den':
            // Pieces cannot enter their own den
            return terrain.owner !== _piece.color;
        case 'trap':
        case 'normal':
            return true;
        default:
            return true;
    }
}

/**
 * Get river jump moves for lions and tigers
 */
function getRiverJumpMoves(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    position: JunglePosition,
    _piece: JunglePiece
): JunglePosition[] {
    const moves: JunglePosition[] = [];
    const { row, col } = position;

    // Check horizontal jump (left/right)
    if (isWaterPosition(terrain, { row, col: col - 1 })) {
        // Jump left
        let jumpCol = col - 1;
        while (
            jumpCol >= 0 &&
            isWaterPosition(terrain, { row, col: jumpCol })
        ) {
            jumpCol--;
        }
        if (
            jumpCol >= 0 &&
            canJumpAcrossRiver(board, terrain, position, { row, col: jumpCol })
        ) {
            moves.push({ row, col: jumpCol });
        }
    }

    if (isWaterPosition(terrain, { row, col: col + 1 })) {
        // Jump right
        let jumpCol = col + 1;
        while (
            jumpCol < JUNGLE_COLS &&
            isWaterPosition(terrain, { row, col: jumpCol })
        ) {
            jumpCol++;
        }
        if (
            jumpCol < JUNGLE_COLS &&
            canJumpAcrossRiver(board, terrain, position, { row, col: jumpCol })
        ) {
            moves.push({ row, col: jumpCol });
        }
    }

    // Check vertical jump (up/down)
    if (isWaterPosition(terrain, { row: row - 1, col })) {
        // Jump up
        let jumpRow = row - 1;
        while (
            jumpRow >= 0 &&
            isWaterPosition(terrain, { row: jumpRow, col })
        ) {
            jumpRow--;
        }
        if (
            jumpRow >= 0 &&
            canJumpAcrossRiver(board, terrain, position, { row: jumpRow, col })
        ) {
            moves.push({ row: jumpRow, col });
        }
    }

    if (isWaterPosition(terrain, { row: row + 1, col })) {
        // Jump down
        let jumpRow = row + 1;
        while (
            jumpRow < JUNGLE_ROWS &&
            isWaterPosition(terrain, { row: jumpRow, col })
        ) {
            jumpRow++;
        }
        if (
            jumpRow < JUNGLE_ROWS &&
            canJumpAcrossRiver(board, terrain, position, { row: jumpRow, col })
        ) {
            moves.push({ row: jumpRow, col });
        }
    }

    return moves;
}

/**
 * Check if a piece can jump across river (no rats blocking the path)
 */
function canJumpAcrossRiver(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    from: JunglePosition,
    to: JunglePosition
): boolean {
    // Check if there are any pieces in the water blocking the jump
    const minRow = Math.min(from.row, to.row);
    const maxRow = Math.max(from.row, to.row);
    const minCol = Math.min(from.col, to.col);
    const maxCol = Math.max(from.col, to.col);

    // Check horizontal jump
    if (from.row === to.row) {
        for (let col = minCol + 1; col < maxCol; col++) {
            if (getPieceAt(board, { row: from.row, col })) {
                return false; // Piece blocking the jump
            }
        }
    }
    // Check vertical jump
    else if (from.col === to.col) {
        for (let row = minRow + 1; row < maxRow; row++) {
            if (getPieceAt(board, { row, col: from.col })) {
                return false; // Piece blocking the jump
            }
        }
    }

    return true;
}

/**
 * Check if a move is valid
 */
export function isValidMove(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    from: JunglePosition,
    to: JunglePosition
): boolean {
    // Check if destination is valid
    if (!isValidPosition(to)) {
        return false;
    }

    // Check if move is to the same position
    if (positionsEqual(from, to)) {
        return false;
    }

    const piece = getPieceAt(board, from);
    if (!piece) {
        return false;
    }

    const targetPiece = getPieceAt(board, to);
    const targetTerrain = getTerrainAt(terrain, to);

    // Check if piece can enter target terrain
    if (!canEnterTerrain(piece, targetTerrain)) {
        return false;
    }

    // Check if target is occupied by own piece
    if (targetPiece && targetPiece.color === piece.color) {
        return false;
    }

    // Check capture rules
    if (targetPiece) {
        // Pieces in water cannot capture pieces on land
        const fromTerrain = getTerrainAt(terrain, from);
        const fromInWater = fromTerrain.type === 'water';
        const toInWater = targetTerrain.type === 'water';

        if (fromInWater && !toInWater) {
            return false; // Cannot capture from water to land
        }

        // Check if the attacking piece is in an enemy trap - pieces in enemy traps cannot capture
        if (fromTerrain.type === 'trap' && fromTerrain.owner !== piece.color) {
            return false; // Piece in enemy trap is reduced to rank 0 and cannot capture
        }

        // Check trap effects first - pieces in enemy traps can be captured by any piece
        // A trap makes the defender vulnerable when the trap is owned by the attacker's opponent
        if (
            targetTerrain.type === 'trap' &&
            targetTerrain.owner !== targetPiece.color
        ) {
            return true;
        }

        // Check if capture is allowed based on rank
        if (!canCapture(piece, targetPiece)) {
            return false;
        }
    }

    // Check den rules - cannot enter own den
    if (targetTerrain.type === 'den' && targetTerrain.owner === piece.color) {
        return false;
    }

    // Check if it's a river jump move for lion/tiger
    if (canJumpRiver(piece)) {
        const distance =
            Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
        if (distance > 1) {
            // This is a jump move, validate it
            return isValidRiverJump(board, terrain, from, to);
        }
    }

    // For normal moves, check if it's exactly one square away
    const rowDiff = Math.abs(from.row - to.row);
    const colDiff = Math.abs(from.col - to.col);

    // Must move exactly one square horizontally or vertically
    if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
        return true;
    }

    return false;
}

/**
 * Validate a river jump move
 */
function isValidRiverJump(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    from: JunglePosition,
    to: JunglePosition
): boolean {
    // Must be in a straight line (horizontal or vertical)
    if (from.row !== to.row && from.col !== to.col) {
        return false;
    }

    // Must start or end adjacent to water
    const fromNearWater = isNearWater(terrain, from);
    const toNearWater = isNearWater(terrain, to);

    if (!fromNearWater && !toNearWater) {
        return false;
    }

    // Check that all intervening squares are water
    if (from.row === to.row) {
        const startCol = Math.min(from.col, to.col);
        const endCol = Math.max(from.col, to.col);
        for (let col = startCol + 1; col < endCol; col++) {
            if (!isWaterPosition(terrain, { row: from.row, col })) {
                return false;
            }
        }
    } else if (from.col === to.col) {
        const startRow = Math.min(from.row, to.row);
        const endRow = Math.max(from.row, to.row);
        for (let row = startRow + 1; row < endRow; row++) {
            if (!isWaterPosition(terrain, { row, col: from.col })) {
                return false;
            }
        }
    }

    // Check if path is clear of blocking pieces
    return canJumpAcrossRiver(board, terrain, from, to);
}

/**
 * Check if a position is adjacent to water
 */
function isNearWater(
    terrain: JungleTerrain[][],
    position: JunglePosition
): boolean {
    const directions = [
        { row: -1, col: 0 },
        { row: 1, col: 0 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
    ];

    for (const dir of directions) {
        const checkPos = {
            row: position.row + dir.row,
            col: position.col + dir.col,
        };

        if (isValidPosition(checkPos) && isWaterPosition(terrain, checkPos)) {
            return true;
        }
    }

    return false;
}

/**
 * Make a move and return the new board state
 */
export function makeMove(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    from: JunglePosition,
    to: JunglePosition
): {
    newBoard: (JunglePiece | null)[][];
    capturedPiece: JunglePiece | null;
} | null {
    if (!isValidMove(board, terrain, from, to)) {
        return null;
    }

    const piece = getPieceAt(board, from);
    if (!piece) {
        return null;
    }

    const capturedPiece = getPieceAt(board, to);
    const newBoard = board.map(row => [...row]);

    // Move the piece
    newBoard[to.row]![to.col] = piece;
    newBoard[from.row]![from.col] = null;

    return { newBoard, capturedPiece };
}

/**
 * Check if a move results in winning the game
 */
export function isWinningMove(
    terrain: JungleTerrain[][],
    from: JunglePosition,
    to: JunglePosition,
    piece: JunglePiece
): boolean {
    const targetTerrain = getTerrainAt(terrain, to);

    // Win by entering opponent's den
    if (targetTerrain.type === 'den' && targetTerrain.owner !== piece.color) {
        return true;
    }

    return false;
}

/**
 * Check if a player has any valid moves
 */
export function hasValidMoves(
    board: (JunglePiece | null)[][],
    terrain: JungleTerrain[][],
    color: 'red' | 'blue'
): boolean {
    for (let row = 0; row < JUNGLE_ROWS; row++) {
        for (let col = 0; col < JUNGLE_COLS; col++) {
            const piece = board[row]![col];
            if (piece && piece.color === color) {
                const position = { row, col };
                const moves = getPossibleMoves(board, terrain, position);
                if (moves.length > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}
