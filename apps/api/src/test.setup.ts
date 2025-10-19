import { afterAll } from 'bun:test';

// Force low bcrypt salt rounds in tests so hashing doesn't block the event loop.
const previousSaltRounds = process.env.BCRYPT_SALT_ROUNDS;
process.env.BCRYPT_SALT_ROUNDS = '4';

afterAll(() => {
	if (previousSaltRounds === undefined) {
		delete process.env.BCRYPT_SALT_ROUNDS;
		return;
	}

	process.env.BCRYPT_SALT_ROUNDS = previousSaltRounds;
});
