import React from 'react';
import { cn } from '../../lib/utils';
import type {
	ChessSide,
	EnginePreflight,
	GameSetup,
	LlmUsability,
	RivalKind,
} from '../../lib/chess/rival/types';
import RivalSetupSummary from './RivalSetupSummary';

interface ChessRivalSetupProps {
	setup: GameSetup;
	enginePreflight: EnginePreflight;
	llmUsability: LlmUsability;
	disabled?: boolean;
	lockReason?: string | null;
	fallbackNotice?: string | null;
	onSelectRival: (kind: RivalKind) => void;
	onSelectHumanSide: (side: ChessSide) => void;
}

interface OpponentCardProps {
	value: RivalKind;
	label: string;
	checked: boolean;
	disabled: boolean;
	onChange: (kind: RivalKind) => void;
	children: React.ReactNode;
}

function opponentStatus(
	kind: RivalKind,
	enginePreflight: EnginePreflight,
	llmUsability: LlmUsability
): string {
	if (kind === 'engine') {
		return enginePreflight.status === 'supported'
			? 'Ready'
			: `Unavailable: ${enginePreflight.message}`;
	}
	switch (llmUsability.status) {
		case 'available':
			return `${llmUsability.provider} · ${llmUsability.model}`;
		case 'loading':
			return 'Checking AI configuration';
		case 'signed-out':
			return 'Sign in required';
		case 'unconfigured':
			return 'Configure an AI provider first';
	}
}

const OpponentCard: React.FC<OpponentCardProps> = ({
	value,
	label,
	checked,
	disabled,
	onChange,
	children,
}) => (
	<label
		className={cn(
			'block rounded-lg border p-3 transition-colors',
			checked ? 'border-brass bg-brass/10' : 'border-line bg-ink-700/60',
			disabled
				? 'cursor-not-allowed opacity-70'
				: 'cursor-pointer hover:bg-ink-600'
		)}
	>
		<div className='flex items-start gap-3'>
			<input
				type='radio'
				name='rival-kind'
				value={value}
				aria-label={label}
				checked={checked}
				disabled={disabled}
				onChange={() => onChange(value)}
				className='mt-1'
			/>
			<div className='space-y-1'>
				<div className='font-medium text-ivory'>{label}</div>
				<div className='text-sm text-ivory-dim'>{children}</div>
			</div>
		</div>
	</label>
);

const ChessRivalSetup: React.FC<ChessRivalSetupProps> = ({
	setup,
	enginePreflight,
	llmUsability,
	disabled = false,
	lockReason = null,
	fallbackNotice = null,
	onSelectRival,
	onSelectHumanSide,
}) => {
	const llmModel =
		llmUsability.status === 'available' ? llmUsability.model : undefined;

	return (
		<section className='space-y-4 rounded-lg border border-line bg-ink-800 p-4'>
			<div className='space-y-1'>
				<h3 className='text-base font-semibold text-brass'>Opponent</h3>
				<RivalSetupSummary setup={setup} llmModel={llmModel} />
			</div>

			{lockReason && <p className='text-sm text-ivory-dim'>{lockReason}</p>}

			{fallbackNotice && (
				<div
					role='status'
					aria-live='polite'
					className='rounded-md border border-brass/40 bg-brass/10 p-3 text-sm text-brass'
				>
					{fallbackNotice}
				</div>
			)}

			<div role='radiogroup' aria-label='Opponent' className='space-y-3'>
				<OpponentCard
					value='engine'
					label='On-device computer'
					checked={setup.rivalKind === 'engine'}
					disabled={disabled}
					onChange={onSelectRival}
				>
					<div>Runs on this device.</div>
					<div>No account or API key required.</div>
					<div>Unrated.</div>
					<div>{opponentStatus('engine', enginePreflight, llmUsability)}</div>
				</OpponentCard>

				<OpponentCard
					value='llm'
					label='Language model'
					checked={setup.rivalKind === 'llm'}
					disabled={disabled}
					onChange={onSelectRival}
				>
					<div>Uses your configured AI provider.</div>
					<div>{opponentStatus('llm', enginePreflight, llmUsability)}</div>
				</OpponentCard>
			</div>

			<div role='radiogroup' aria-label='You play' className='space-y-2'>
				<div className='text-sm font-medium text-ivory'>You play</div>
				<div className='flex gap-2'>
					{(['white', 'black'] as const).map(side => (
						<label
							key={side}
							className={cn(
								'flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
								setup.humanSide === side
									? 'border-brass bg-brass text-ink-900'
									: 'border-line text-ivory-dim'
							)}
						>
							<input
								type='radio'
								name='human-side'
								value={side}
								aria-label={side === 'white' ? 'White' : 'Black'}
								checked={setup.humanSide === side}
								disabled={disabled}
								onChange={() => onSelectHumanSide(side)}
							/>
							{side === 'white' ? 'White' : 'Black'}
						</label>
					))}
				</div>
			</div>
		</section>
	);
};

export default ChessRivalSetup;
