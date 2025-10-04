import { test, expect, describe } from 'bun:test';
import { hashPassword, comparePassword } from './password';

describe('Password Utilities', () => {
    describe('hashPassword', () => {
        test('should hash password', async () => {
            const password = 'testPassword123';
            const hash = await hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.length).toBeGreaterThan(0);
        });

        test('should produce different hashes for same password', async () => {
            const password = 'testPassword123';
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);

            expect(hash1).not.toBe(hash2); // Due to salt
        });

        test('should handle empty password', async () => {
            const hash = await hashPassword('');
            expect(hash).toBeDefined();
        });

        test('should handle long password', async () => {
            const longPassword = 'a'.repeat(1000);
            const hash = await hashPassword(longPassword);
            expect(hash).toBeDefined();
        });

        test('should handle special characters', async () => {
            const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const hash = await hashPassword(specialPassword);
            expect(hash).toBeDefined();
        });
    });

    describe('comparePassword', () => {
        test('should return true for correct password', async () => {
            const password = 'testPassword123';
            const hash = await hashPassword(password);
            const isMatch = await comparePassword(password, hash);

            expect(isMatch).toBe(true);
        });

        test('should return false for incorrect password', async () => {
            const password = 'testPassword123';
            const wrongPassword = 'wrongPassword456';
            const hash = await hashPassword(password);
            const isMatch = await comparePassword(wrongPassword, hash);

            expect(isMatch).toBe(false);
        });

        test('should be case sensitive', async () => {
            const password = 'TestPassword123';
            const hash = await hashPassword(password);
            const isMatch = await comparePassword('testpassword123', hash);

            expect(isMatch).toBe(false);
        });

        test('should handle empty password comparison', async () => {
            const hash = await hashPassword('');
            const isMatch = await comparePassword('', hash);

            expect(isMatch).toBe(true);
        });

        test('should return false for completely wrong hash format', async () => {
            const password = 'testPassword123';
            const fakeHash = 'notAValidHash';

            // bcrypt.compare should return false for invalid hash
            const isMatch = await comparePassword(password, fakeHash);
            expect(isMatch).toBe(false);
        });

        test('should handle unicode characters', async () => {
            const password = '你好世界🌍';
            const hash = await hashPassword(password);
            const isMatch = await comparePassword(password, hash);

            expect(isMatch).toBe(true);
        });
    });

    describe('Integration tests', () => {
        test('should work with realistic user flow', async () => {
            // User registers
            const registrationPassword = 'MySecureP@ssw0rd!';
            const storedHash = await hashPassword(registrationPassword);

            // User logs in with correct password
            const loginAttempt1 = await comparePassword(
                registrationPassword,
                storedHash
            );
            expect(loginAttempt1).toBe(true);

            // User logs in with wrong password
            const loginAttempt2 = await comparePassword(
                'WrongPassword',
                storedHash
            );
            expect(loginAttempt2).toBe(false);

            // User logs in with slightly different password
            const loginAttempt3 = await comparePassword(
                'MySecureP@ssw0rd',
                storedHash
            ); // Missing !
            expect(loginAttempt3).toBe(false);
        });

        test('should handle multiple users with same password', async () => {
            const password = 'commonPassword123';
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);

            // Hashes should be different (salted)
            expect(hash1).not.toBe(hash2);

            // But both should validate correctly
            expect(await comparePassword(password, hash1)).toBe(true);
            expect(await comparePassword(password, hash2)).toBe(true);
        });
    });
});
