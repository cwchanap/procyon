import type { EnginePreflight } from './types';

export interface EngineCapabilityEnvironment {
	Worker?: typeof Worker;
	WebAssembly?: typeof WebAssembly;
}

/** Minimal valid WASM module used only for capability probing. */
const MINIMAL_VALID_WASM = new Uint8Array([
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

const UNSUPPORTED_MESSAGE =
	'This device cannot run the local chess engine. Choose a language-model opponent instead.';

function resolveEnvironment(
	env?: EngineCapabilityEnvironment
): EngineCapabilityEnvironment {
	if (env !== undefined) {
		return env;
	}

	return globalThis as EngineCapabilityEnvironment;
}

export function runEnginePreflight(
	env?: EngineCapabilityEnvironment
): EnginePreflight {
	const capabilities = resolveEnvironment(env);

	if (typeof capabilities.Worker === 'undefined') {
		return { status: 'unsupported', message: UNSUPPORTED_MESSAGE };
	}

	const wasm = capabilities.WebAssembly;
	if (typeof wasm === 'undefined' || typeof wasm.validate !== 'function') {
		return { status: 'unsupported', message: UNSUPPORTED_MESSAGE };
	}

	try {
		if (!wasm.validate(MINIMAL_VALID_WASM)) {
			return { status: 'unsupported', message: UNSUPPORTED_MESSAGE };
		}
	} catch {
		return { status: 'unsupported', message: UNSUPPORTED_MESSAGE };
	}

	return { status: 'supported' };
}
