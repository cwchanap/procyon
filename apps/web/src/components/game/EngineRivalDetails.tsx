import React from 'react';
import type { EnginePreflight } from '../../lib/chess/rival/types';
import type {
	RivalSessionError,
	RivalSessionStartState,
} from '../../hooks/useChessRivalSession';

interface EngineRivalDetailsProps {
	enginePreflight: EnginePreflight;
	startState: RivalSessionStartState;
	rivalThinking: boolean;
	rivalError: RivalSessionError | null;
	onRetry: () => void;
}

const panelClass = 'rounded-lg border border-line bg-ink-700 p-4 text-sm';

const EngineRivalDetails: React.FC<EngineRivalDetailsProps> = ({
	enginePreflight,
	startState,
	rivalThinking,
	rivalError,
	onRetry,
}) => {
	if (enginePreflight.status === 'unsupported') {
		return (
			<div className={panelClass}>
				<div className='font-semibold text-brass'>Engine unavailable</div>
				<p className='mt-1 text-ivory-dim'>{enginePreflight.message}</p>
			</div>
		);
	}

	if (startState === 'starting') {
		return (
			<div className={panelClass} role='status' aria-live='polite'>
				<div className='font-semibold text-brass'>
					Loading on-device engine...
				</div>
				<p className='mt-1 text-ivory-dim'>
					The computer opponent is preparing a local chess engine.
				</p>
			</div>
		);
	}

	if (startState === 'load-failed') {
		return (
			<div className={panelClass} role='alert'>
				<div className='font-semibold text-destructive'>Engine load failed</div>
				<p className='mt-1 text-ivory-dim'>
					The on-device computer could not start.
				</p>
				<button
					type='button'
					onClick={onRetry}
					className='mt-3 rounded-md bg-brass px-3 py-2 text-sm font-medium text-ink-900 hover:bg-brass-bright'
				>
					Try again
				</button>
			</div>
		);
	}

	if (rivalError) {
		return (
			<div className={panelClass} role='alert'>
				<div className='font-semibold text-destructive'>
					Computer move failed
				</div>
				<p className='mt-1 text-ivory-dim'>{rivalError.message}</p>
				<p className='mt-2 text-ivory-dim'>
					Start a New Game to reset the computer opponent.
				</p>
			</div>
		);
	}

	if (rivalThinking) {
		return (
			<div className={panelClass} role='status' aria-live='polite'>
				<div className='font-semibold text-brass'>Computer is thinking...</div>
				<p className='mt-1 text-ivory-dim'>
					The on-device engine is choosing its move.
				</p>
			</div>
		);
	}

	return (
		<div className={panelClass}>
			<div className='font-semibold text-brass'>Ready to load</div>
			<p className='mt-1 text-ivory-dim'>
				The on-device engine loads only after you start the game.
			</p>
		</div>
	);
};

export default EngineRivalDetails;
