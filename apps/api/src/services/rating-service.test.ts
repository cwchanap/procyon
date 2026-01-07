import { describe, expect, test } from 'bun:test';
import {
	getKFactor,
	calculateExpectedScore,
	getActualScore,
	calculateNewRating,
	getRankTier,
} from './rating-service';
import { GameResultStatus } from '../constants/game';

describe('Rating Service - Pure Calculation Functions', () => {
	describe('getKFactor', () => {
		test('returns 40 for provisional players (< 30 games)', () => {
			expect(getKFactor(0)).toBe(40);
			expect(getKFactor(1)).toBe(40);
			expect(getKFactor(15)).toBe(40);
			expect(getKFactor(29)).toBe(40);
		});

		test('returns 24 for settling players (30-99 games)', () => {
			expect(getKFactor(30)).toBe(24);
			expect(getKFactor(50)).toBe(24);
			expect(getKFactor(99)).toBe(24);
		});

		test('returns 16 for established players (100+ games)', () => {
			expect(getKFactor(100)).toBe(16);
			expect(getKFactor(500)).toBe(16);
			expect(getKFactor(1000)).toBe(16);
		});
	});

	describe('calculateExpectedScore', () => {
		test('returns 0.5 for equal ratings', () => {
			const expected = calculateExpectedScore(1200, 1200);
			expect(expected).toBe(0.5);
		});

		test('returns > 0.5 when player is higher rated', () => {
			const expected = calculateExpectedScore(1400, 1200);
			expect(expected).toBeGreaterThan(0.5);
			expect(expected).toBeLessThan(1.0);
		});

		test('returns < 0.5 when player is lower rated', () => {
			const expected = calculateExpectedScore(1200, 1400);
			expect(expected).toBeLessThan(0.5);
			expect(expected).toBeGreaterThan(0);
		});

		test('400 point difference yields ~0.91 expected score for higher player', () => {
			const expected = calculateExpectedScore(1600, 1200);
			// Expected score for 400 point difference is approximately 0.909
			expect(expected).toBeCloseTo(0.909, 2);
		});

		test('400 point difference yields ~0.09 expected score for lower player', () => {
			const expected = calculateExpectedScore(1200, 1600);
			// Expected score for -400 point difference is approximately 0.091
			expect(expected).toBeCloseTo(0.091, 2);
		});

		test('expected scores are symmetric (sum to 1)', () => {
			const playerA = calculateExpectedScore(1200, 1500);
			const playerB = calculateExpectedScore(1500, 1200);
			expect(playerA + playerB).toBeCloseTo(1.0, 10);
		});
	});

	describe('getActualScore', () => {
		test('returns 1.0 for win', () => {
			expect(getActualScore(GameResultStatus.Win)).toBe(1.0);
		});

		test('returns 0.5 for draw', () => {
			expect(getActualScore(GameResultStatus.Draw)).toBe(0.5);
		});

		test('returns 0.0 for loss', () => {
			expect(getActualScore(GameResultStatus.Loss)).toBe(0.0);
		});
	});

	describe('calculateNewRating', () => {
		test('win against equal opponent increases rating', () => {
			const result = calculateNewRating(
				1200,
				1200,
				GameResultStatus.Win,
				0 // Provisional K=40
			);
			expect(result.newRating).toBeGreaterThan(1200);
			expect(result.ratingChange).toBeGreaterThan(0);
			// K=40, expected=0.5, actual=1.0, change = 40 * 0.5 = 20
			expect(result.ratingChange).toBe(20);
			expect(result.newRating).toBe(1220);
		});

		test('loss against equal opponent decreases rating', () => {
			const result = calculateNewRating(
				1200,
				1200,
				GameResultStatus.Loss,
				0 // Provisional K=40
			);
			expect(result.newRating).toBeLessThan(1200);
			expect(result.ratingChange).toBeLessThan(0);
			// K=40, expected=0.5, actual=0.0, change = 40 * -0.5 = -20
			expect(result.ratingChange).toBe(-20);
			expect(result.newRating).toBe(1180);
		});

		test('draw against equal opponent has no rating change', () => {
			const result = calculateNewRating(
				1200,
				1200,
				GameResultStatus.Draw,
				0 // Provisional K=40
			);
			// K=40, expected=0.5, actual=0.5, change = 40 * 0 = 0
			expect(result.ratingChange).toBe(0);
			expect(result.newRating).toBe(1200);
		});

		test('upset win (lower rated beats higher rated) gives bigger boost', () => {
			const result = calculateNewRating(
				1200,
				1600, // 400 points higher opponent
				GameResultStatus.Win,
				0 // Provisional K=40
			);
			// Expected score ~0.09, actual=1.0, change = 40 * 0.91 ≈ 36
			expect(result.ratingChange).toBeGreaterThan(30);
			expect(result.newRating).toBeGreaterThan(1230);
		});

		test('expected win (higher rated beats lower rated) gives smaller boost', () => {
			const result = calculateNewRating(
				1600,
				1200, // 400 points lower opponent
				GameResultStatus.Win,
				0 // Provisional K=40
			);
			// Expected score ~0.91, actual=1.0, change = 40 * 0.09 ≈ 4
			expect(result.ratingChange).toBeLessThan(10);
			expect(result.ratingChange).toBeGreaterThan(0);
		});

		test('upset loss (higher rated loses to lower rated) gives bigger penalty', () => {
			const result = calculateNewRating(
				1600,
				1200, // 400 points lower opponent
				GameResultStatus.Loss,
				0 // Provisional K=40
			);
			// Expected score ~0.91, actual=0.0, change = 40 * -0.91 ≈ -36
			expect(result.ratingChange).toBeLessThan(-30);
		});

		test('K-factor affects rating change magnitude', () => {
			const provisional = calculateNewRating(
				1200,
				1200,
				GameResultStatus.Win,
				0 // K=40
			);
			const settling = calculateNewRating(
				1200,
				1200,
				GameResultStatus.Win,
				50 // K=24
			);
			const established = calculateNewRating(
				1200,
				1200,
				GameResultStatus.Win,
				200 // K=16
			);

			// Same expected outcome but different K-factors
			expect(provisional.ratingChange).toBe(20); // 40 * 0.5
			expect(settling.ratingChange).toBe(12); // 24 * 0.5
			expect(established.ratingChange).toBe(8); // 16 * 0.5
		});

		test('rating has a floor of 100', () => {
			const result = calculateNewRating(
				100,
				1600, // Very strong opponent
				GameResultStatus.Loss,
				0 // Provisional K=40
			);
			// Rating should not go below 100
			expect(result.newRating).toBe(100);
		});

		test('expected score is included in result', () => {
			const result = calculateNewRating(1200, 1200, GameResultStatus.Win, 0);
			expect(result.expectedScore).toBe(0.5);
		});
	});

	describe('getRankTier', () => {
		test('returns Master for rating >= 2000', () => {
			expect(getRankTier(2000).tier).toBe('Master');
			expect(getRankTier(2500).tier).toBe('Master');
			expect(getRankTier(2000).color).toBe('gold');
		});

		test('returns Expert for rating 1600-1999', () => {
			expect(getRankTier(1600).tier).toBe('Expert');
			expect(getRankTier(1800).tier).toBe('Expert');
			expect(getRankTier(1999).tier).toBe('Expert');
			expect(getRankTier(1600).color).toBe('purple');
		});

		test('returns Advanced for rating 1200-1599', () => {
			expect(getRankTier(1200).tier).toBe('Advanced');
			expect(getRankTier(1400).tier).toBe('Advanced');
			expect(getRankTier(1599).tier).toBe('Advanced');
			expect(getRankTier(1200).color).toBe('blue');
		});

		test('returns Intermediate for rating 800-1199', () => {
			expect(getRankTier(800).tier).toBe('Intermediate');
			expect(getRankTier(1000).tier).toBe('Intermediate');
			expect(getRankTier(1199).tier).toBe('Intermediate');
			expect(getRankTier(800).color).toBe('green');
		});

		test('returns Beginner for rating < 800', () => {
			expect(getRankTier(0).tier).toBe('Beginner');
			expect(getRankTier(500).tier).toBe('Beginner');
			expect(getRankTier(799).tier).toBe('Beginner');
			expect(getRankTier(0).color).toBe('gray');
		});

		test('returns correct minRating boundaries', () => {
			expect(getRankTier(2000).minRating).toBe(2000);
			expect(getRankTier(1600).minRating).toBe(1600);
			expect(getRankTier(1200).minRating).toBe(1200);
			expect(getRankTier(800).minRating).toBe(800);
			expect(getRankTier(0).minRating).toBe(0);
		});
	});
});
