import type { EnginePreflight, LlmUsability, RivalKind } from './types';

export interface ResolveSetupInput {
	rememberedKind: RivalKind | null;
	enginePreflight: EnginePreflight;
	llmUsability: LlmUsability;
	setupTouched: boolean;
	explicitKind: RivalKind | null;
}

export interface ResolvedSetupKind {
	kind: RivalKind;
	automatic: boolean;
	notice?: 'engine-to-llm' | 'llm-to-engine';
	startBlockedReason?: 'llm-loading' | 'llm-unusable' | 'engine-unsupported';
}

function isEngineSupported(preflight: EnginePreflight): boolean {
	return preflight.status === 'supported';
}

function isLlmAvailable(usability: LlmUsability): boolean {
	return usability.status === 'available';
}

function isLlmConfirmedUnusable(usability: LlmUsability): boolean {
	return (
		usability.status === 'signed-out' || usability.status === 'unconfigured'
	);
}

function resolveDefaultKind(
	enginePreflight: EnginePreflight,
	llmUsability: LlmUsability
): RivalKind {
	if (isLlmAvailable(llmUsability)) {
		return 'llm';
	}
	return 'engine';
}

function resolveFixedKind(
	kind: RivalKind,
	enginePreflight: EnginePreflight,
	llmUsability: LlmUsability,
	automatic: boolean
): ResolvedSetupKind {
	const result: ResolvedSetupKind = { kind, automatic };

	if (kind === 'llm') {
		if (llmUsability.status === 'loading') {
			result.startBlockedReason = 'llm-loading';
		} else if (!isLlmAvailable(llmUsability)) {
			result.startBlockedReason = 'llm-unusable';
		}
	} else if (!isEngineSupported(enginePreflight)) {
		result.startBlockedReason = 'engine-unsupported';
	}

	return result;
}

function resolveAutomatic(
	rememberedKind: RivalKind | null,
	enginePreflight: EnginePreflight,
	llmUsability: LlmUsability
): ResolvedSetupKind {
	const engineSupported = isEngineSupported(enginePreflight);
	const llmAvailable = isLlmAvailable(llmUsability);

	if (rememberedKind === 'engine') {
		if (engineSupported) {
			return { kind: 'engine', automatic: true };
		}
		if (llmAvailable) {
			return { kind: 'llm', automatic: true, notice: 'engine-to-llm' };
		}
		return {
			kind: 'engine',
			automatic: true,
			startBlockedReason: 'engine-unsupported',
		};
	}

	if (rememberedKind === 'llm') {
		if (llmUsability.status === 'loading') {
			return {
				kind: 'llm',
				automatic: true,
				startBlockedReason: 'llm-loading',
			};
		}
		if (llmAvailable) {
			return { kind: 'llm', automatic: true };
		}
		if (isLlmConfirmedUnusable(llmUsability)) {
			if (engineSupported) {
				return {
					kind: 'engine',
					automatic: true,
					notice: 'llm-to-engine',
				};
			}
			return {
				kind: 'engine',
				automatic: true,
				startBlockedReason: 'engine-unsupported',
			};
		}
	}

	if (llmAvailable) {
		// No remembered preference: resolve to the LLM without a fallback
		// notice. The 'engine-to-llm' notice is reserved for an explicit
		// remembered 'engine' preference (handled above).
		return {
			kind: 'llm',
			automatic: true,
		};
	}
	if (engineSupported) {
		return { kind: 'engine', automatic: true };
	}
	return {
		kind: 'engine',
		automatic: true,
		startBlockedReason: 'engine-unsupported',
	};
}

export function resolveSetup(input: ResolveSetupInput): ResolvedSetupKind {
	const {
		rememberedKind,
		enginePreflight,
		llmUsability,
		setupTouched,
		explicitKind,
	} = input;

	if (explicitKind !== null) {
		return resolveFixedKind(explicitKind, enginePreflight, llmUsability, false);
	}

	if (setupTouched) {
		const kind =
			rememberedKind ?? resolveDefaultKind(enginePreflight, llmUsability);
		return resolveFixedKind(kind, enginePreflight, llmUsability, false);
	}

	return resolveAutomatic(rememberedKind, enginePreflight, llmUsability);
}
