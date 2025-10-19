/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MoveRecord {
	moveNumber: number;
	player: string;
	from: string;
	to: string;
	piece: string;
	timestamp: Date;
	aiPrompt?: string;
	aiResponse?: string;
	aiReasoning?: string;
	aiConfidence?: number;
}

export interface GameExportData {
	gameVariant: string;
	startTime: Date;
	endTime?: Date;
	finalStatus: string;
	moves: MoveRecord[];
	aiConfig?: {
		provider: string;
		model: string;
		enabled: boolean;
	};
}

export class GameExporter {
	private moves: MoveRecord[] = [];
	private startTime: Date;
	private gameVariant: string;
	private aiConfig?: any;

	constructor(gameVariant: string, aiConfig?: any) {
		this.gameVariant = gameVariant;
		this.startTime = new Date();
		this.aiConfig = aiConfig;
	}

	addMove(
		moveNumber: number,
		player: string,
		from: string,
		to: string,
		piece: string,
		aiData?: {
			prompt?: string;
			response?: string;
			reasoning?: string;
			confidence?: number;
		}
	): void {
		this.moves.push({
			moveNumber,
			player,
			from,
			to,
			piece,
			timestamp: new Date(),
			aiPrompt: aiData?.prompt,
			aiResponse: aiData?.response,
			aiReasoning: aiData?.reasoning,
			aiConfidence: aiData?.confidence,
		});
	}

	exportToText(finalStatus: string): string {
		const endTime = new Date();
		const duration = Math.floor(
			(endTime.getTime() - this.startTime.getTime()) / 1000
		);

		let output = '';
		output += '='.repeat(80) + '\n';
		output += `GAME EXPORT - ${this.gameVariant.toUpperCase()}\n`;
		output += '='.repeat(80) + '\n\n';

		output += `Start Time: ${this.startTime.toISOString()}\n`;
		output += `End Time: ${endTime.toISOString()}\n`;
		output += `Duration: ${duration} seconds\n`;
		output += `Final Status: ${finalStatus}\n`;

		if (this.aiConfig) {
			output += `\nAI Configuration:\n`;
			output += `  Provider: ${this.aiConfig.provider}\n`;
			output += `  Model: ${this.aiConfig.model}\n`;
			output += `  Enabled: ${this.aiConfig.enabled}\n`;
		}

		output += '\n' + '='.repeat(80) + '\n';
		output += 'MOVE HISTORY\n';
		output += '='.repeat(80) + '\n\n';

		for (const move of this.moves) {
			output += `Move ${move.moveNumber} - ${move.player.toUpperCase()}\n`;
			output += `  Piece: ${move.piece}\n`;
			output += `  Move: ${move.from} → ${move.to}\n`;
			output += `  Time: ${move.timestamp.toISOString()}\n`;

			if (move.aiPrompt) {
				output += '\n  AI PROMPT:\n';
				output += '  ' + '-'.repeat(76) + '\n';
				// Indent each line of the prompt
				const promptLines = move.aiPrompt.split('\n');
				for (const line of promptLines) {
					output += `  ${line}\n`;
				}
				output += '  ' + '-'.repeat(76) + '\n';
			}

			if (move.aiResponse) {
				output += '\n  AI RAW RESPONSE:\n';
				output += '  ' + '-'.repeat(76) + '\n';
				const responseLines = move.aiResponse.split('\n');
				for (const line of responseLines) {
					output += `  ${line}\n`;
				}
				output += '  ' + '-'.repeat(76) + '\n';
			}

			if (move.aiReasoning) {
				output += `\n  AI Reasoning: ${move.aiReasoning}\n`;
			}

			if (move.aiConfidence !== undefined) {
				output += `  AI Confidence: ${move.aiConfidence}%\n`;
			}

			output += '\n' + '-'.repeat(80) + '\n\n';
		}

		output += '='.repeat(80) + '\n';
		output += `TOTAL MOVES: ${this.moves.length}\n`;
		output += '='.repeat(80) + '\n';

		return output;
	}

	exportToJSON(finalStatus: string): string {
		const data: GameExportData = {
			gameVariant: this.gameVariant,
			startTime: this.startTime,
			endTime: new Date(),
			finalStatus,
			moves: this.moves,
			aiConfig: this.aiConfig
				? {
						provider: this.aiConfig.provider,
						model: this.aiConfig.model,
						enabled: this.aiConfig.enabled,
					}
				: undefined,
		};

		return JSON.stringify(data, null, 2);
	}

	downloadAsFile(filename: string, content: string): void {
		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	exportAndDownload(
		finalStatus: string,
		format: 'text' | 'json' = 'text'
	): void {
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, '-')
			.split('T')[0];
		const extension = format === 'json' ? 'json' : 'txt';
		const filename = `${this.gameVariant}-game-${timestamp}.${extension}`;

		const content =
			format === 'json'
				? this.exportToJSON(finalStatus)
				: this.exportToText(finalStatus);

		this.downloadAsFile(filename, content);
	}

	clear(): void {
		this.moves = [];
		this.startTime = new Date();
	}
}
