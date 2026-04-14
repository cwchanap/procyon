import { describe, expect, test } from 'bun:test';
import {
	RATING_CONFIG,
	RANK_TIERS,
	getKFactor,
	calculateExpectedScore,
	calculateNewRating,
	getRankTier,
	getActualScore,
} from './rating-service';
import { GameResultStatus } from '../constants/game';

describe('RATING_CONFIG constants', () => {
	test('defaultPlayerRating is 1200', () => {
		expect(RATING_CONFIG.defaultPlayerRating).toBe(1200);
	});

	test('defaultAiRating is 1400', () => {
		expect(RATING_CONFIG.defaultAiRating).toBe(1400);
	});

	test('floorRating is 100', () => {
		expect(RATING_CONFIG.floorRating).toBe(100);
	});

	test('scaleFactor is 400 (standard ELO)', () => {
		expect(RATING_CONFIG.scaleFactor).toBe(400);
	});

	test('kFactor provisionalThreshold is 30', () => {
		expect(RATING_CONFIG.kFactor.provisionalThreshold).toBe(30);
	});

	test('kFactor settlingThreshold is 100', () => {
		expect(RATING_CONFIG.kFactor.settlingThreshold).toBe(100);
	});

	test('kFactor provisionalValue is 40', () => {
		expect(RATING_CONFIG.kFactor.provisionalValue).toBe(40);
	});

	test('kFactor settlingValue is 24', () => {
		expect(RATING_CONFIG.kFactor.settlingValue).toBe(24);
	});

	test('kFactor establishedValue is 16', () => {
		expect(RATING_CONFIG.kFactor.establishedValue).toBe(16);
	});

	test('defaultAiRatings object is defined', () => {
		expect(RATING_CONFIG.defaultAiRatings).toBeDefined();
		expect(typeof RATING_CONFIG.defaultAiRatings).toBe('object');
	});
});

describe('RANK_TIERS structure', () => {
	test('has exactly 5 tiers', () => {
		expect(RANK_TIERS.length).toBe(5);
	});

	test('first tier is Master with gold color', () => {
		const master = RANK_TIERS[0];
		expect(master?.tier).toBe('Master');
		expect(master?.color).toBe('gold');
		expect(master?.minRating).toBe(2000);
	});

	test('last tier is Beginner with minRating 0', () => {
		const beginner = RANK_TIERS[RANK_TIERS.length - 1];
		expect(beginner?.tier).toBe('Beginner');
		expect(beginner?.color).toBe('gray');
		expect(beginner?.minRating).toBe(0);
	});

	test('all tiers have required fields', () => {
		for (const tier of RANK_TIERS) {
			expect(tier.tier).toBeDefined();
			expect(tier.color).toBeDefined();
			expect(typeof tier.minRating).toBe('number');
		}
	});
});

describe('getKFactor - exact boundary values', () => {
	test('29 games is still provisional (K=40)', () => {
		expect(getKFactor(29)).toBe(40);
	});

	test('30 games transitions to settling (K=24)', () => {
		expect(getKFactor(30)).toBe(24);
	});

	test('99 games is still settling (K=24)', () => {
		expect(getKFactor(99)).toBe(24);
	});

	test('100 games transitions to established (K=16)', () => {
		expect(getKFactor(100)).toBe(16);
	});
});

describe('calculateExpectedScore - extreme rating differences', () => {
	test('1400-point advantage yields expected score very close to 1', () => {
		const expected = calculateExpectedScore(2400, 1000);
		expect(expected).toBeGreaterThan(0.99);
	});

	test('1400-point disadvantage yields expected score very close to 0', () => {
		const expected = calculateExpectedScore(1000, 2400);
		expect(expected).toBeLessThan(0.01);
	});

	test('extreme scores are symmetric (sum to 1)', () => {
		const playerA = calculateExpectedScore(2400, 1000);
		const playerB = calculateExpectedScore(1000, 2400);
		expect(playerA + playerB).toBeCloseTo(1.0, 10);
	});

	test('same very high rating still yields 0.5', () => {
		const expected = calculateExpectedScore(3000, 3000);
		expect(expected).toBe(0.5);
	});
});

describe('calculateNewRating - floor application', () => {
	test('floor is applied when calculated rating would go below 100', () => {
		// Rating 101 loses to equal opponent: change ≈ -20, tentative ≈ 81, floored to 100
		const result = calculateNewRating(101, 102, GameResultStatus.Loss, 0);
		expect(result.newRating).toBe(100);
		expect(result.ratingChange).toBe(result.newRating - 101); // -1
		expect(result.ratingChange).toBeLessThan(0);
	});

	test('rating at exact floor with no meaningful change stays at floor', () => {
		// Rating 100 loses to very strong opponent - very small absolute change, stays at 100
		const result = calculateNewRating(100, 1600, GameResultStatus.Loss, 0);
		expect(result.newRating).toBe(100);
	});

	test('win always increases or maintains rating (never hits floor)', () => {
		const result = calculateNewRating(100, 100, GameResultStatus.Win, 0);
		expect(result.newRating).toBeGreaterThanOrEqual(100);
		expect(result.ratingChange).toBeGreaterThanOrEqual(0);
	});
});

describe('calculateNewRating - settling K-factor', () => {
	test('settling player (K=24) has smaller change than provisional (K=40) for same scenario', () => {
		const provisional = calculateNewRating(1200, 1200, GameResultStatus.Win, 0); // K=40
		const settling = calculateNewRating(1200, 1200, GameResultStatus.Win, 50); // K=24

		expect(provisional.ratingChange).toBeGreaterThan(settling.ratingChange);
		expect(settling.ratingChange).toBe(12); // K=24, expected=0.5, actual=1.0: 24*0.5=12
	});

	test('established player (K=16) has smallest change', () => {
		const established = calculateNewRating(1200, 1200, GameResultStatus.Win, 200); // K=16
		expect(established.ratingChange).toBe(8); // K=16, expected=0.5: 16*0.5=8
	});
});

describe('calculateNewRating - result structure', () => {
	test('result contains newRating, ratingChange, and expectedScore fields', () => {
		const result = calculateNewRating(1400, 1200, GameResultStatus.Win, 0);
		expect(result).toHaveProperty('newRating');
		expect(result).toHaveProperty('ratingChange');
		expect(result).toHaveProperty('expectedScore');
	});

	test('ratingChange equals newRating minus original rating', () => {
		const originalRating = 1400;
		const result = calculateNewRating(originalRating, 1200, GameResultStatus.Win, 0);
		expect(result.ratingChange).toBe(result.newRating - originalRating);
	});

	test('expectedScore is between 0 and 1 exclusive for unequal ratings', () => {
		const result = calculateNewRating(1400, 1200, GameResultStatus.Win, 0);
		expect(result.expectedScore).toBeGreaterThan(0);
		expect(result.expectedScore).toBeLessThan(1);
	});
});

describe('getActualScore', () => {
	test('win returns 1.0', () => {
		expect(getActualScore(GameResultStatus.Win)).toBe(1.0);
	});

	test('draw returns 0.5', () => {
		expect(getActualScore(GameResultStatus.Draw)).toBe(0.5);
	});

	test('loss returns 0.0', () => {
		expect(getActualScore(GameResultStatus.Loss)).toBe(0.0);
	});
});

describe('getRankTier - boundary and fallback cases', () => {
	test('returns Beginner for negative rating (fallback path)', () => {
		const tier = getRankTier(-100);
		expect(tier.tier).toBe('Beginner');
	});

	test('returns Beginner for rating of -1', () => {
		const tier = getRankTier(-1);
		expect(tier.tier).toBe('Beginner');
	});

	test('exactly 1999 rating is Expert not Master', () => {
		expect(getRankTier(1999).tier).toBe('Expert');
	});

	test('exactly 2000 rating is Master', () => {
		expect(getRankTier(2000).tier).toBe('Master');
	});

	test('exactly 1599 rating is Advanced not Expert', () => {
		expect(getRankTier(1599).tier).toBe('Advanced');
	});

	test('exactly 1600 rating is Expert', () => {
		expect(getRankTier(1600).tier).toBe('Expert');
	});

	test('exactly 1199 rating is Intermediate not Advanced', () => {
		expect(getRankTier(1199).tier).toBe('Intermediate');
	});

	test('exactly 799 rating is Beginner not Intermediate', () => {
		expect(getRankTier(799).tier).toBe('Beginner');
	});

	test('exactly 800 rating is Intermediate', () => {
		expect(getRankTier(800).tier).toBe('Intermediate');
	});

	test('returns correct tier object with all fields', () => {
		const tier = getRankTier(1200);
		expect(tier.tier).toBe('Advanced');
		expect(tier.color).toBe('blue');
		expect(tier.minRating).toBe(1200);
	});
});
