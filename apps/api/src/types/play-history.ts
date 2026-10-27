export interface AeroplaneHistoryDetails {
	/** Absent on pre-Tycoon Standard submissions. */
	mode?: 'standard' | 'sky-tycoon';
	/** Terminal four-colour balances; required for Sky Tycoon. */
	coins?: Record<'red' | 'yellow' | 'blue' | 'green', number>;
	rulePreset: 'classic' | 'quick-chill' | 'custom';
	victoryTarget: 2 | 4;
	diceMode: 'fair' | 'relaxed';
	launchRule: 'six' | 'five-or-six';
	finishRule: 'exact' | 'bounce';
	stacking: boolean;
	blockades: boolean;
	chatter: boolean;
	humanColor: 'red' | 'yellow' | 'blue' | 'green';
	durationSeconds: number;
	planesFinished: number;
	capturesMade: number;
	capturesSuffered: number;
	aiPlayers: Array<{
		color: 'red' | 'yellow' | 'blue' | 'green';
		personality: 'cautious' | 'aggressive' | 'unpredictable';
	}>;
}
