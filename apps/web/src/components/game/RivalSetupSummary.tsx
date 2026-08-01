import React from 'react';
import {
	getRivalSide,
	type ActiveRivalSession,
	type ChessSide,
	type GameSetup,
} from '../../lib/chess/rival/types';

interface RivalSetupSummaryProps {
	setup?: GameSetup;
	activeSession?: ActiveRivalSession | null;
	llmModel?: string;
	className?: string;
}

function sideName(side: ChessSide): string {
	return side === 'white' ? 'White' : 'Black';
}

function engineSummary(rivalSide: ChessSide): string {
	return `On-device computer · Computer plays ${sideName(rivalSide)} · Unrated`;
}

function llmSummary(model: string, rivalSide: ChessSide): string {
	return `Language model · ${model} · Computer plays ${sideName(rivalSide)}`;
}

const RivalSetupSummary: React.FC<RivalSetupSummaryProps> = ({
	setup,
	activeSession,
	llmModel,
	className = '',
}) => {
	const summary = (() => {
		if (activeSession?.opponent.kind === 'engine') {
			return engineSummary(activeSession.rivalSide);
		}
		if (activeSession?.opponent.kind === 'llm') {
			return llmSummary(activeSession.opponent.model, activeSession.rivalSide);
		}
		if (!setup) {
			return '';
		}
		const rivalSide = getRivalSide(setup.humanSide);
		if (setup.rivalKind === 'engine') {
			return engineSummary(rivalSide);
		}
		return llmSummary(llmModel ?? 'Selected model', rivalSide);
	})();

	return <p className={`text-sm text-ivory-dim ${className}`}>{summary}</p>;
};

export default RivalSetupSummary;
