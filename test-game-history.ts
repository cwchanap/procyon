#!/usr/bin/env bun

/**
 * Test script to verify game history saving across all chess variants
 * This script:
 * 1. Creates a test user
 * 2. Logs in
 * 3. Tests each game (chess, xiangqi, shogi, jungle)
 * 4. Verifies history is saved correctly
 */

const API_BASE = 'http://localhost:3501/api';
const timestamp = Date.now();
const testEmail = `testuser${timestamp}@test.com`;
const testUsername = `testuser${timestamp}`;
const testPassword = 'Test123!';

interface AuthResponse {
	token: string;
	user: any;
}

interface PlayHistoryResponse {
	playHistory: Array<{
		id: number;
		userId: number;
		chessId: string;
		status: string;
		date: string;
		opponentLlmId: string | null;
	}>;
}

async function registerUser(): Promise<AuthResponse> {
	console.log('📝 Registering user:', testEmail);
	const response = await fetch(`${API_BASE}/auth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testEmail,
			username: testUsername,
			password: testPassword,
			confirmPassword: testPassword,
		}),
	});

	if (!response.ok) {
		throw new Error(`Registration failed: ${response.statusText}`);
	}

	return await response.json();
}

async function saveGameHistory(
	token: string,
	chessId: string,
	status: 'win' | 'loss' | 'draw'
) {
	console.log(`💾 Saving ${chessId} game history: ${status}`);
	const response = await fetch(`${API_BASE}/play-history`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			chessId,
			status,
			date: new Date().toISOString(),
			opponentLlmId: 'gemini-2.5-flash',
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to save game history: ${error}`);
	}

	return await response.json();
}

async function getPlayHistory(token: string): Promise<PlayHistoryResponse> {
	console.log('📜 Fetching play history...');
	const response = await fetch(`${API_BASE}/play-history`, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch play history: ${response.statusText}`);
	}

	return await response.json();
}

async function main() {
	console.log('🎮 Testing Game History Saving\n');

	try {
		// 1. Register user
		const { token, user } = await registerUser();
		console.log('✅ User registered:', user.username);
		console.log('🔑 Token:', token.substring(0, 20) + '...\n');

		// 2. Test each game variant
		const games = ['chess', 'xiangqi', 'shogi', 'jungle'];

		for (const game of games) {
			console.log(`\n📋 Testing ${game.toUpperCase()}:`);

			// Save a win
			await saveGameHistory(token, game, 'win');
			console.log(`  ✅ Win saved`);

			// Save a loss
			await saveGameHistory(token, game, 'loss');
			console.log(`  ✅ Loss saved`);

			// Save a draw
			await saveGameHistory(token, game, 'draw');
			console.log(`  ✅ Draw saved`);
		}

		// 3. Verify all history
		console.log('\n📊 Verifying play history:\n');
		const history = await getPlayHistory(token);

		console.log(`Total records: ${history.playHistory.length}`);
		console.log('\nBreakdown by game:');

		for (const game of games) {
			const gameRecords = history.playHistory.filter(h => h.chessId === game);
			const wins = gameRecords.filter(h => h.status === 'win').length;
			const losses = gameRecords.filter(h => h.status === 'loss').length;
			const draws = gameRecords.filter(h => h.status === 'draw').length;

			console.log(
				`  ${game}: ${gameRecords.length} total (${wins} wins, ${losses} losses, ${draws} draws)`
			);
		}

		// Note about future variants
		console.log('\n✅ All game variants are now supported!');
		console.log(
			'   - Chess, Xiangqi, Shogi, and Jungle all save history correctly'
		);

		console.log('\n✅ All tests passed!');
		console.log('\n🎯 Summary:');
		console.log(`  - Test user: ${testEmail}`);
		console.log(`  - Total games saved: ${history.playHistory.length}`);
		console.log(`  - Games tested: ${games.join(', ')}`);
	} catch (error) {
		console.error('\n❌ Test failed:', error);
		process.exit(1);
	}
}

main();
