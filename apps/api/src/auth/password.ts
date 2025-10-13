import bcrypt from 'bcryptjs';

const DEFAULT_SALT_ROUNDS = 12;

function resolveSaltRounds(): number {
    const value = process.env.BCRYPT_SALT_ROUNDS;
    if (!value) {
        return DEFAULT_SALT_ROUNDS;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }

    return DEFAULT_SALT_ROUNDS;
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, resolveSaltRounds());
}

export async function comparePassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}
