type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

type Logger = {
	debug: (message: string, fields?: LogFields) => void;
	info: (message: string, fields?: LogFields) => void;
	warn: (message: string, fields?: LogFields) => void;
	error: (message: string, fields?: LogFields) => void;
};

function safeStringify(value: unknown): string {
	const seen = new WeakSet<object>();

	try {
		return JSON.stringify(value, (_key, val: unknown) => {
			if (typeof val === 'bigint') {
				return val.toString();
			}
			if (val && typeof val === 'object') {
				const obj = val as object;
				if (seen.has(obj)) {
					return '[Circular]';
				}
				seen.add(obj);
			}
			return val;
		});
	} catch (error) {
		const errMessage = error instanceof Error ? error.message : String(error);
		return JSON.stringify({
			level: 'error',
			message: 'Logger serialization failed',
			timestamp: new Date().toISOString(),
			fields: { error: errMessage },
		});
	}
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
	const payload: Record<string, unknown> = {
		level,
		message,
		timestamp: new Date().toISOString(),
	};

	if (fields && typeof fields === 'object') {
		payload.fields = fields;
	}

	const line = safeStringify(payload);

	if (level === 'error') {
		console.error(line);
		return;
	}

	if (level === 'warn') {
		console.warn(line);
		return;
	}

	console.log(line);
}

export const logger: Logger = {
	debug: (message, fields) => emit('debug', message, fields),
	info: (message, fields) => emit('info', message, fields),
	warn: (message, fields) => emit('warn', message, fields),
	error: (message, fields) => emit('error', message, fields),
};
