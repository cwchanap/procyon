import React from 'react';
import { Button } from '../ui/Button';
import Panel from '../ui/Panel';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	DiceMode,
	FinishRule,
	LaunchRule,
} from '../../lib/aeroplane/types';

export interface AeroplaneSetupProps {
	setup: AeroplaneConfig;
	onChange: (patch: Partial<AeroplaneConfig>) => void;
	onStart?: () => void;
	onNewMatch?: () => void;
	className?: string;
}

const COLORS: readonly AeroplaneColor[] = ['red', 'yellow', 'blue', 'green'];

const colorLabel: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

function labelize(value: string): string {
	return value
		.split('-')
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export const AeroplaneSetup: React.FC<AeroplaneSetupProps> = ({
	setup,
	onChange,
	onStart,
	onNewMatch,
	className,
}) => {
	const start = onStart ?? onNewMatch;
	const manualChange = <K extends keyof AeroplaneConfig>(
		key: K,
		value: AeroplaneConfig[K]
	) => onChange({ rulePreset: 'custom', [key]: value });

	return (
		<Panel
			accent='aeroplane'
			raised
			className={`space-y-5 p-4 sm:p-5 ${className ?? ''}`}
			aria-labelledby='aeroplane-setup-title'
		>
			<div>
				<p className='text-xs font-mono uppercase tracking-[0.2em] text-ivory-dim'>
					Match setup
				</p>
				<h2
					id='aeroplane-setup-title'
					className='mt-1 font-display text-2xl font-semibold text-ivory'
				>
					Choose your flight rules
				</h2>
			</div>

			<fieldset className='space-y-2'>
				<legend className='text-sm font-semibold text-ivory'>Preset</legend>
				<div className='grid grid-cols-3 gap-2'>
					{(
						[
							['classic', 'Classic'],
							['quick-chill', 'Quick & Chill'],
							['custom', 'Custom'],
						] as const
					).map(([value, text]) => (
						<button
							key={value}
							type='button'
							aria-pressed={setup.rulePreset === value}
							onClick={() => {
								onChange({ rulePreset: value });
							}}
							className={`min-h-11 rounded-md border px-2 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ${
								setup.rulePreset === value
									? 'border-brass bg-brass text-ink-900'
									: 'border-line bg-ink-700 text-ivory-dim hover:bg-ink-600 hover:text-ivory'
							}`}
						>
							{text}
						</button>
					))}
				</div>
			</fieldset>

			<div className='grid gap-4 sm:grid-cols-2'>
				<label className='space-y-1 text-sm text-ivory'>
					<span>Victory target</span>
					<select
						aria-label='Victory target'
						value={setup.victoryTarget}
						onChange={event =>
							manualChange('victoryTarget', Number(event.target.value) as 2 | 4)
						}
						className='min-h-11 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass'
					>
						<option value='2'>2 planes</option>
						<option value='4'>4 planes</option>
					</select>
				</label>
				<label className='space-y-1 text-sm text-ivory'>
					<span>Human colour</span>
					<select
						aria-label='Human color'
						value={setup.humanColor}
						onChange={event =>
							manualChange('humanColor', event.target.value as AeroplaneColor)
						}
						className='min-h-11 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass'
					>
						{COLORS.map(color => (
							<option key={color} value={color}>
								{colorLabel[color]}
							</option>
						))}
					</select>
				</label>
			</div>

			<div className='grid gap-4 sm:grid-cols-2'>
				<label className='space-y-1 text-sm text-ivory'>
					<span>Dice mode</span>
					<select
						aria-label='Dice mode'
						value={setup.diceMode}
						onChange={event =>
							manualChange('diceMode', event.target.value as DiceMode)
						}
						className='min-h-11 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass'
					>
						<option value='fair'>Fair Dice</option>
						<option value='relaxed'>Relaxed Dice</option>
					</select>
				</label>
				<label className='space-y-1 text-sm text-ivory'>
					<span>Launch rule</span>
					<select
						aria-label='Launch rule'
						value={setup.launchRule}
						onChange={event =>
							manualChange('launchRule', event.target.value as LaunchRule)
						}
						className='min-h-11 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass'
					>
						<option value='six'>Launch on six</option>
						<option value='five-or-six'>Launch on five or six</option>
					</select>
				</label>
			</div>

			<label className='block space-y-1 text-sm text-ivory'>
				<span>Finish rule</span>
				<select
					aria-label='Finish rule'
					value={setup.finishRule}
					onChange={event =>
						manualChange('finishRule', event.target.value as FinishRule)
					}
					className='min-h-11 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass'
				>
					<option value='exact'>Exact finish</option>
					<option value='bounce'>Bounce finish</option>
				</select>
			</label>

			<fieldset className='space-y-2'>
				<legend className='text-sm font-semibold text-ivory'>
					House rules
				</legend>
				<div className='grid gap-2 sm:grid-cols-2'>
					<label className='flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ivory transition-colors hover:bg-ink-600 motion-reduce:transition-none'>
						<input
							type='checkbox'
							aria-label='Stacking'
							checked={setup.stacking}
							onChange={event =>
								onChange(
									event.target.checked
										? { stacking: true, rulePreset: 'custom' }
										: {
												stacking: false,
												blockades: false,
												rulePreset: 'custom',
											}
								)
							}
							className='h-4 w-4 accent-aeroplane focus-visible:ring-2 focus-visible:ring-brass'
						/>
						<span>Stacking</span>
					</label>
					<label className='flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ivory transition-colors hover:bg-ink-600 motion-reduce:transition-none'>
						<input
							type='checkbox'
							aria-label='Blockades'
							checked={setup.blockades}
							onChange={event =>
								onChange(
									event.target.checked
										? {
												blockades: true,
												stacking: true,
												rulePreset: 'custom',
											}
										: { blockades: false, rulePreset: 'custom' }
								)
							}
							className='h-4 w-4 accent-aeroplane focus-visible:ring-2 focus-visible:ring-brass'
						/>
						<span>Blockades</span>
					</label>
				</div>
			</fieldset>

			<label className='flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ivory transition-colors hover:bg-ink-600 motion-reduce:transition-none'>
				<input
					type='checkbox'
					aria-label='Chatter'
					checked={setup.chatter}
					onChange={event => manualChange('chatter', event.target.checked)}
					className='h-4 w-4 accent-aeroplane focus-visible:ring-2 focus-visible:ring-brass'
				/>
				<span>Show flight chatter</span>
			</label>

			{start && (
				<Button
					type='button'
					onClick={start}
					className='min-h-11 w-full touch-manipulation'
				>
					Start match
				</Button>
			)}
			<p className='text-xs leading-relaxed text-ivory-dim'>
				{labelize(setup.rulePreset)} rules · You control the{' '}
				{colorLabel[setup.humanColor]} planes; Red starts.
			</p>
		</Panel>
	);
};

export default AeroplaneSetup;
