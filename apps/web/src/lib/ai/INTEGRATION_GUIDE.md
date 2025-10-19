# AI Integration Guide for Xiangqi and Shogi

This guide shows how to integrate AI support for xiangqi and shogi games using the new universal AI system.

## Overview

The AI system has been refactored to support multiple game variants:

- Chess (existing)
- Xiangqi (Chinese Chess)
- Shogi (Japanese Chess)

## Key Components

- `UniversalAIService`: Main AI service that works with any game variant
- Game adapters: `ChessAdapter`, `XiangqiAdapter`, `ShogiAdapter`
- Factory functions: `createChessAI()`, `createXiangqiAI()`, `createShogiAI()`

## Usage Examples

### Chess (existing, for reference)

```typescript
import { createChessAI, AIConfig } from '@/lib/ai';

const aiConfig: AIConfig = {
  provider: 'gemini',
  apiKey: 'your-api-key',
  model: 'gemini-2.5-flash-lite',
  enabled: true,
  debug: false,
  gameVariant: 'chess',
};

const chessAI = createChessAI(aiConfig);
const aiResponse = await chessAI.makeMove(chessGameState);
```

### Xiangqi Integration

```typescript
import { createXiangqiAI } from '@/lib/ai';
import type { XiangqiGameState } from '@/lib/xiangqi/types';

// In XiangqiGame.tsx
const [aiConfig, setAIConfig] = useState<AIConfig>({
  ...defaultAIConfig,
  gameVariant: 'xiangqi',
});

const [xiangqiAI] = useState(() => createXiangqiAI(aiConfig));

// Set up debug callback
useEffect(() => {
  xiangqiAI.setDebugCallback((type, message, data) => {
    console.log(`[Xiangqi AI ${type}]:`, message, data);
    // Update debug UI as needed
  });
}, [xiangqiAI]);

// Make AI move
const handleAIMove = async () => {
  if (gameState.currentPlayer === aiPlayer) {
    const aiResponse = await xiangqiAI.makeMove(gameState);
    if (aiResponse) {
      // Parse the move and apply it to the game
      const fromPos = xiangqiAdapter.algebraicToPosition(aiResponse.move.from);
      const toPos = xiangqiAdapter.algebraicToPosition(aiResponse.move.to);

      // Apply move using xiangqi game logic
      const newGameState = makeMove(gameState, fromPos, toPos);
      setGameState(newGameState);
    }
  }
};
```

### Shogi Integration

```typescript
import { createShogiAI } from '@/lib/ai';
import type { ShogiGameState } from '@/lib/shogi';

// In ShogiGame.tsx
const [aiConfig, setAIConfig] = useState<AIConfig>({
  ...defaultAIConfig,
  gameVariant: 'shogi',
});

const [shogiAI] = useState(() => createShogiAI(aiConfig));

// Handle both regular moves and drop moves
const handleAIMove = async () => {
  if (gameState.currentPlayer === aiPlayer) {
    const aiResponse = await shogiAI.makeMove(gameState);
    if (aiResponse) {
      if (aiResponse.move.from === '*') {
        // Handle drop move
        const toPos = shogiAdapter.algebraicToPosition(aiResponse.move.to);
        // Apply drop logic
      } else {
        // Handle regular move
        const fromPos = shogiAdapter.algebraicToPosition(aiResponse.move.from);
        const toPos = shogiAdapter.algebraicToPosition(aiResponse.move.to);
        // Apply move logic
      }
    }
  }
};
```

## Adding AI to Existing Game Components

### 1. Update imports

```typescript
// Replace old AI imports
import {
  createXiangqiAI,
  createShogiAI,
  AIConfig,
  defaultAIConfig,
} from '@/lib/ai';
```

### 2. Add AI state

```typescript
const [gameMode, setGameMode] = useState<'play' | 'tutorial' | 'ai'>('play');
const [aiPlayer, setAIPlayer] = useState<'red' | 'black' | 'sente' | 'gote'>(
  'black'
);
const [aiConfig, setAIConfig] = useState<AIConfig>({
  ...defaultAIConfig,
  gameVariant: 'xiangqi', // or 'shogi'
});
```

### 3. Create AI service

```typescript
const [aiService] = useState(() => {
  return gameVariant === 'xiangqi'
    ? createXiangqiAI(aiConfig)
    : createShogiAI(aiConfig);
});
```

### 4. Add AI move handling

```typescript
useEffect(() => {
  if (
    gameMode === 'ai' &&
    gameState.currentPlayer === aiPlayer &&
    gameState.status === 'playing'
  ) {
    const makeAIMove = async () => {
      const response = await aiService.makeMove(gameState);
      if (response) {
        // Apply the AI's move to the game state
        // Implementation depends on your game logic
      }
    };

    const timer = setTimeout(makeAIMove, 1000); // Small delay for UX
    return () => clearTimeout(timer);
  }
}, [gameState, gameMode, aiPlayer, aiService]);
```

### 5. Update UI for AI mode

Add buttons to toggle AI mode and select AI player color:

```typescript
<button
    onClick={() => setGameMode(gameMode === 'ai' ? 'play' : 'ai')}
    className="glass-effect px-6 py-3 rounded-xl font-medium"
>
    {gameMode === 'ai' ? '👤 Human vs Human' : '🤖 Play vs AI'}
</button>

{gameMode === 'ai' && (
    <select
        value={aiPlayer}
        onChange={(e) => setAIPlayer(e.target.value as any)}
        className="glass-effect px-4 py-2 rounded-xl"
    >
        <option value="red">AI plays Red</option>
        <option value="black">AI plays Black</option>
    </select>
)}
```

## Game-Specific Considerations

### Xiangqi

- Uses 10x9 board with files a-i and ranks 1-10
- Has special rules for palace, river, and piece movements
- AI understands xiangqi-specific tactics like cannon batteries and flying general

### Shogi

- Uses 9x9 board with files 9-1 and ranks a-i
- Supports drop moves (format: `*5e` for dropping on 5e)
- AI handles promotion decisions and hand piece management
- Drop moves have special notation in AI responses

## Configuration

The AI config now supports `gameVariant` field:

```typescript
interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  enabled: boolean;
  debug?: boolean;
  gameVariant?: GameVariant; // 'chess' | 'xiangqi' | 'shogi'
}
```

## Debugging

Enable debug mode to see detailed AI thinking:

```typescript
const aiConfig = {
  ...config,
  debug: true,
};

// Set up debug callback to display AI reasoning
aiService.setDebugCallback((type, message, data) => {
  console.log(`[AI ${type}]:`, message, data);
  // Update debug UI
});
```

## Migration from Old AI System

The old `AIService` is still available for backward compatibility, but new implementations should use the universal system:

```typescript
// Old way (still works for chess)
import { AIService } from '@/lib/ai/service';

// New way (recommended)
import { createChessAI, createXiangqiAI, createShogiAI } from '@/lib/ai';
```
