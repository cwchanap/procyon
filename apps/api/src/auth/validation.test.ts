import { describe, expect, test } from 'bun:test';
import '../test.setup';
import { registerSchema, loginSchema } from './validation';
import type { RegisterInput, LoginInput } from './validation';

describe('Authentication Validation Schemas', () => {
	describe('registerSchema', () => {
		test('should validate correct registration data', () => {
			const validData: RegisterInput = {
				email: 'user@example.com',
				username: 'testuser',
				password: 'password123',
			};

			const result = registerSchema.safeParse(validData);
			expect(result.success).toBe(true);
		});

		describe('email validation', () => {
			test('should accept valid email formats', () => {
				const validEmails = [
					'user@example.com',
					'test.user@example.co.uk',
					'user+tag@example.com',
					'user123@test-domain.com',
				];

				for (const email of validEmails) {
					const result = registerSchema.safeParse({
						email,
						username: 'testuser',
						password: 'password123',
					});
					expect(result.success).toBe(true);
				}
			});

			test('should reject invalid email formats', () => {
				const invalidEmails = [
					'notanemail',
					'@example.com',
					'user@',
					'user @example.com',
					'user@.com',
				];

				for (const email of invalidEmails) {
					const result = registerSchema.safeParse({
						email,
						username: 'testuser',
						password: 'password123',
					});
					expect(result.success).toBe(false);
					if (!result.success) {
						expect(result.error.issues.length).toBeGreaterThan(0);
						expect(result.error.issues[0]?.message).toBe(
							'Invalid email format'
						);
					}
				}
			});

			test('should require email field', () => {
				const result = registerSchema.safeParse({
					username: 'testuser',
					password: 'password123',
				});
				expect(result.success).toBe(false);
			});
		});

		describe('username validation', () => {
			test('should accept valid usernames', () => {
				const validUsernames = ['abc', 'user123', 'test_user', 'a'.repeat(50)];

				for (const username of validUsernames) {
					const result = registerSchema.safeParse({
						email: 'user@example.com',
						username,
						password: 'password123',
					});
					expect(result.success).toBe(true);
				}
			});

			test('should reject username shorter than 3 characters', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'ab',
					password: 'password123',
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.length).toBeGreaterThan(0);
					expect(result.error.issues[0]?.message).toBe(
						'Username must be at least 3 characters'
					);
				}
			});

			test('should reject username longer than 50 characters', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'a'.repeat(51),
					password: 'password123',
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.length).toBeGreaterThan(0);
					expect(result.error.issues[0]?.message).toBe(
						'Username must be at most 50 characters'
					);
				}
			});

			test('should require username field', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					password: 'password123',
				});
				expect(result.success).toBe(false);
			});

			test('should accept username with exactly 3 characters', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'abc',
					password: 'password123',
				});
				expect(result.success).toBe(true);
			});

			test('should accept username with exactly 50 characters', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'a'.repeat(50),
					password: 'password123',
				});
				expect(result.success).toBe(true);
			});
		});

		describe('password validation', () => {
			test('should accept password with 6 or more characters', () => {
				const validPasswords = ['123456', 'password', 'a'.repeat(100)];

				for (const password of validPasswords) {
					const result = registerSchema.safeParse({
						email: 'user@example.com',
						username: 'testuser',
						password,
					});
					expect(result.success).toBe(true);
				}
			});

			test('should reject password shorter than 6 characters', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'testuser',
					password: '12345',
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.length).toBeGreaterThan(0);
					expect(result.error.issues[0]?.message).toBe(
						'Password must be at least 6 characters'
					);
				}
			});

			test('should require password field', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'testuser',
				});
				expect(result.success).toBe(false);
			});

			test('should accept password with exactly 6 characters', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'testuser',
					password: '123456',
				});
				expect(result.success).toBe(true);
			});

			test('should accept special characters in password', () => {
				const result = registerSchema.safeParse({
					email: 'user@example.com',
					username: 'testuser',
					password: 'P@ssw0rd!',
				});
				expect(result.success).toBe(true);
			});
		});

		describe('multiple validation errors', () => {
			test('should return all validation errors', () => {
				const result = registerSchema.safeParse({
					email: 'invalidemail',
					username: 'ab',
					password: '123',
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.length).toBe(3);
				}
			});
		});
	});

	describe('loginSchema', () => {
		test('should validate correct login data', () => {
			const validData: LoginInput = {
				email: 'user@example.com',
				password: 'anypassword',
			};

			const result = loginSchema.safeParse(validData);
			expect(result.success).toBe(true);
		});

		describe('email validation', () => {
			test('should accept valid email', () => {
				const result = loginSchema.safeParse({
					email: 'user@example.com',
					password: 'password',
				});
				expect(result.success).toBe(true);
			});

			test('should reject invalid email', () => {
				const result = loginSchema.safeParse({
					email: 'notanemail',
					password: 'password',
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.length).toBeGreaterThan(0);
					expect(result.error.issues[0]?.message).toBe('Invalid email format');
				}
			});

			test('should require email field', () => {
				const result = loginSchema.safeParse({
					password: 'password',
				});
				expect(result.success).toBe(false);
			});
		});

		describe('password validation', () => {
			test('should accept any non-empty password', () => {
				const passwords = ['a', '12', 'short', 'long'.repeat(100)];

				for (const password of passwords) {
					const result = loginSchema.safeParse({
						email: 'user@example.com',
						password,
					});
					expect(result.success).toBe(true);
				}
			});

			test('should reject empty password', () => {
				const result = loginSchema.safeParse({
					email: 'user@example.com',
					password: '',
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.length).toBeGreaterThan(0);
					expect(result.error.issues[0]?.message).toBe('Password is required');
				}
			});

			test('should require password field', () => {
				const result = loginSchema.safeParse({
					email: 'user@example.com',
				});
				expect(result.success).toBe(false);
			});
		});

		test('should not validate username during login', () => {
			// Login only requires email and password, not username
			const result = loginSchema.safeParse({
				email: 'user@example.com',
				password: 'password',
				username: 'shouldbeignored',
			});
			expect(result.success).toBe(true);
		});
	});

	describe('Type inference', () => {
		test('RegisterInput type should match schema', () => {
			const data: RegisterInput = {
				email: 'user@example.com',
				username: 'testuser',
				password: 'password123',
			};

			const result = registerSchema.parse(data);
			expect(result).toEqual(data);
		});

		test('LoginInput type should match schema', () => {
			const data: LoginInput = {
				email: 'user@example.com',
				password: 'password123',
			};

			const result = loginSchema.parse(data);
			expect(result).toEqual(data);
		});
	});
});
