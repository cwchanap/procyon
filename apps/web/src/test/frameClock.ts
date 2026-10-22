/** Controllable requestAnimationFrame clock; Bun fake timers do not run rAF. */
export function installFrameClock() {
	const pending = new Map<number, (now: number) => void>();
	let nextId = 0;
	let now = 0;
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.requestAnimationFrame = (callback: (now: number) => void) => {
		nextId += 1;
		pending.set(nextId, callback);
		return nextId;
	};
	globals.cancelAnimationFrame = (id: number) => {
		pending.delete(id);
	};
	return {
		advance(ms: number) {
			now += ms;
			const callbacks = [...pending.values()];
			pending.clear();
			for (const callback of callbacks) callback(now);
		},
		uninstall() {
			pending.clear();
			delete globals.requestAnimationFrame;
			delete globals.cancelAnimationFrame;
		},
	};
}
