# Game Component Refactoring Guide

This guide shows how to refactor Chess, Xiangqi, and Janggi game components using the new shared components following DRY and KISS principles.

## New Shared Components

### 1. **AIStatusPanel** - Handles AI status display

- Shows AI thinking indicator
- Displays AI errors with retry button
- Renders AI debug dialog

### 2. **GameControls** - Unified game control buttons

- Start/Reset button
- Play Again button
- Debug Mode toggle
- Export Game button

### 3. **DemoSelector** - Tutorial demo selection buttons

- Renders demo selection pills
- Handles active state styling

### 4. **TutorialInstructions** - Tutorial information panels

- Demo explanation panel
- How to use instructions
- Tips section

### 5. **AIGameInstructions** - AI mode instructions

- Movement instructions
- Move indicators legend
- AI provider information

## Refactoring Pattern

### Before (Duplicated Code)

```tsx
// In each game component
{
    gameMode === 'ai' && (
        <div className='flex flex-col gap-4 max-w-2xl mx-auto'>
            <div className='text-center'>
                {isAIThinking && (
                    <div className='flex items-center justify-center gap-2 text-cyan-200'>
                        <div className='animate-spin...'></div>
                        AI is thinking...
                    </div>
                )}
                {aiError && (
                    <div className='flex flex-col items-center gap-3...'>
                        // Error display and retry button
                    </div>
                )}
                <AIDebugDialog moves={aiDebugMoves} isVisible={isDebugMode} />
            </div>
        </div>
    );
}
```

### After (Shared Component)

```tsx
{
    gameMode === 'ai' && (
        <AIStatusPanel
            aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
            hasGameStarted={hasGameStarted}
            isAIThinking={isAIThinking}
            isAIPaused={isAIPaused}
            aiError={aiError}
            aiDebugMoves={aiDebugMoves}
            isDebugMode={isDebugMode}
            onRetry={retryAIMove}
        />
    );
}
```

## Example: Refactored ChessGame Component

```tsx
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';

// In render:
<GameScaffold {...scaffoldProps}>
    {/* AI Status - Single component instead of inline JSX */}
    {gameMode === 'ai' &&
        !hasGameStarted &&
        !isLoadingConfig &&
        !aiConfigured && (
            <div className='text-center text-yellow-400 text-sm'>
                ⚠ AI not configured - Configure API key in Profile
            </div>
        )}

    {gameMode === 'ai' && (
        <AIStatusPanel
            aiConfigured={aiConfigured}
            hasGameStarted={hasGameStarted}
            isAIThinking={gameState.isAiThinking}
            isAIPaused={isAiPaused}
            aiError={aiError}
            aiDebugMoves={aiDebugMoves}
            isDebugMode={isDebugMode}
            onRetry={retryAIMove}
        />
    )}

    {/* Demo Selector */}
    {gameMode === 'tutorial' && (
        <DemoSelector
            demos={logicDemos}
            currentDemo={currentDemo}
            onDemoChange={handleDemoChange}
        />
    )}

    {/* Instructions */}
    <div className='w-full max-w-4xl mx-auto space-y-6'>
        {gameMode === 'ai' ? (
            <AIGameInstructions
                providerName={aiConfig.provider}
                modelName={aiConfig.model}
                aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
            />
        ) : (
            <TutorialInstructions
                title={getCurrentDemo().title}
                explanation={getCurrentDemo().explanation}
                tips={[
                    'Control the center and develop your pieces early.',
                    'Castle early to protect your king.',
                    // ... more tips
                ]}
                tipsTitle='Chess Tips'
            />
        )}
    </div>

    {/* Board */}
    <div className='flex justify-center'>
        <GameStartOverlay active={!hasGameStarted && gameMode !== 'tutorial'}>
            <ChessBoard {...boardProps} />
        </GameStartOverlay>
    </div>

    {/* Controls */}
    <div className='w-full max-w-4xl mx-auto'>
        {gameMode === 'ai' && (
            <GameControls
                hasGameStarted={hasGameStarted}
                isGameOver={isGameOver}
                aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
                isDebugMode={isDebugMode}
                canExport={hasGameStarted && !!gameExporterRef.current}
                onStartOrReset={handleStartOrReset}
                onReset={resetGame}
                onToggleDebug={() => setIsDebugMode(!isDebugMode)}
                onExport={() =>
                    gameExporterRef.current?.exportAndDownload(gameState.status)
                }
            />
        )}
    </div>
</GameScaffold>;
```

## Benefits

### ✅ DRY (Don't Repeat Yourself)

- Common UI patterns extracted into reusable components
- AI status logic centralized in AIStatusPanel
- Game controls unified in GameControls
- Tutorial UI shared across all games

### ✅ KISS (Keep It Simple, Stupid)

- Each component has a single, clear responsibility
- Props are simple and well-defined
- No complex inheritance or HOCs
- Easy to understand and modify

### ✅ Maintainability

- Bug fixes in one component benefit all games
- Styling changes are centralized
- New games can easily reuse these components
- Clear separation of concerns

## Implementation Steps

1. ✅ Created shared components in `/components/game/`:
    - AIStatusPanel.tsx
    - GameControls.tsx
    - DemoSelector.tsx
    - TutorialInstructions.tsx
    - AIGameInstructions.tsx

2. ✅ Refactored existing game components to use shared components:
    - ChessGame.tsx - **COMPLETED**
    - XiangqiGame.tsx - **COMPLETED**
    - (Future) JanggiGame.tsx - Ready to use the same pattern

3. ✅ Tested - Build successful, no TypeScript errors

4. ✅ Deleted duplicated code from individual game components

## Code Reduction Summary

### ChessGame.tsx

- **Removed**: ~170 lines of duplicated UI code
- **Replaced with**: 5 clean component calls
- **Result**: More maintainable, clearer structure

### XiangqiGame.tsx

- **Removed**: ~160 lines of duplicated UI code
- **Replaced with**: 5 clean component calls
- **Result**: More maintainable, clearer structure

### Total Impact

- **~330 lines** of duplicated code eliminated
- **5 reusable components** created
- **100% build success** - no breaking changes
- **Ready for new game variants** (Janggi, Shogi extensions, etc.)

## File Structure

```
apps/web/src/components/
├── game/
│   ├── GameScaffold.tsx          # Layout wrapper (existing)
│   ├── GameStartOverlay.tsx      # Start overlay (existing)
│   ├── GameModeToggle.tsx        # Mode toggle (existing)
│   ├── AIStatusPanel.tsx         # ✨ New: AI status display
│   ├── GameControls.tsx          # ✨ New: Game control buttons
│   ├── DemoSelector.tsx          # ✨ New: Tutorial demo selector
│   ├── TutorialInstructions.tsx  # ✨ New: Tutorial info panels
│   └── AIGameInstructions.tsx    # ✨ New: AI mode instructions
├── ChessGame.tsx                 # Use shared components
├── XiangqiGame.tsx               # Use shared components
└── (Future) JanggiGame.tsx       # Use shared components
```

## Notes

- The `GameScaffold` component already provides good layout structure
- Each game keeps its own game-specific logic (move validation, AI integration, etc.)
- Only UI rendering and common patterns are shared
- Game-specific styling (colors, gradients) remains in individual components
