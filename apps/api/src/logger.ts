type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

type Logger = {
	debug: (message: string, fields?: LogFields) => void;
	info: (message: string, fields?: LogFields) => void;
	warn: (message: string, fields?: LogFields) => void;
	error: (message: string, fields?: LogFields) => void;
};

function emit(level: LogLevel, message: string, fields?: LogFields): void {
	const payload: Record<string, unknown> = {
		level,
		message,
		timestamp: new Date().toISOString(),
	};

	if (fields && typeof fields === 'object') {
		payload.fields = fields;
	}

	const line = JSON.stringify(payload);

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
