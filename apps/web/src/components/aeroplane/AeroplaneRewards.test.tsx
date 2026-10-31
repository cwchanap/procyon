import { describe, expect, jest, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupReactDom } from '../../test/reactSetup';
import { installFrameClock } from '../../test/frameClock';
import type { StarBreakdown } from '../../lib/aeroplane/rewards';
import type { HumanMoment } from '../../lib/aeroplane/rewards';
import AeroplaneRewards, { pickBestMoment } from './AeroplaneRewards';

setupReactDom();

function breakdown(overrides: Partial<StarBreakdown> = {}): StarBreakdown {
	return {
		win: 10,
		captures: 6,
		finished: 3,
		coins: 0,
		total: 19,
		...overrides,
	};
}

function capture(label: string, captures: number): HumanMoment {
	return { kind: 'capture', label, captures };
}

function coinMoment(coinGain: number): HumanMoment {
	return { kind: 'coins', label: 'Big coin gain!', coinGain };
}

function renderRewards(
	props: Partial<Parameters<typeof AeroplaneRewards>[0]> = {}
) {
	return render(
		<AeroplaneRewards
			matchKey='started:1'
			winner='red'
			mode='standard'
			capturesMade={3}
			planesFinished={1}
			breakdown={breakdown()}
			moments={[]}
			reducedMotion={false}
			progress={{ status: 'waiting-auth', lifetimeStars: 0 }}
			onRetryProgress={() => {}}
			{...props}
		/>
	);
}

describe('AeroplaneRewards panel', () => {
	test('renders the win summary, breakdown rows and aggregate highlights', () => {
		const { getByTestId, getByText, getByRole } = renderRewards();
		expect(getByText('Red wins the match!')).toBeTruthy();
		expect(getByTestId('aeroplane-rewards-total').textContent).toBe('19');
		expect(getByTestId('aeroplane-rewards-moment').textContent).toContain(
			'3 captures'
		);
		expect(getByTestId('aeroplane-rewards-moment').textContent).toContain(
			'1 plane finished'
		);
		const rows = getByRole('list', { name: 'Star breakdown' });
		expect(rows.textContent).toContain('Win');
		expect(rows.textContent).toContain('Captures (3)');
		expect(rows.textContent).toContain('Planes finished (1)');
		expect(rows.textContent).not.toContain('Sky Tycoon surplus');
		// Guests see the per-match reward only.
		expect(
			globalThis.document.querySelectorAll('[role="status"]')
		).toHaveLength(1);
	});

	test('renders a loss summary with zero win stars', () => {
		const { getByText, getByTestId } = renderRewards({
			winner: 'yellow',
			breakdown: breakdown({
				win: 0,
				captures: 0,
				finished: 0,
				total: 0,
			}),
			capturesMade: 0,
			planesFinished: 0,
		});
		expect(getByText('Yellow wins the match!')).toBeTruthy();
		expect(getByTestId('aeroplane-rewards-total').textContent).toBe('0');
	});

	test('shows a Sky Tycoon surplus row when the match scored coins', () => {
		const { getByText } = renderRewards({
			mode: 'sky-tycoon',
			breakdown: breakdown({ coins: 2, total: 21 }),
		});
		expect(getByText('Sky Tycoon surplus (max 10)').textContent).toBeTruthy();
		expect(getByText('+2')).toBeTruthy();
	});

	test('a zero-coin Sky Tycoon match still discloses the capped coin row', () => {
		const { getByText } = renderRewards({
			mode: 'sky-tycoon',
			breakdown: breakdown({ coins: 0, total: 19 }),
		});
		expect(getByText('Sky Tycoon surplus (max 10)').textContent).toBeTruthy();
		expect(getByText('+0')).toBeTruthy();
	});

	test('a capped capture count discloses the cap in its row label', () => {
		const { getByText } = renderRewards({
			capturesMade: 12,
			breakdown: breakdown({ captures: 20, total: 33 }),
		});
		expect(getByText('Captures (12, max 10)').textContent).toBeTruthy();
		expect(getByText('+20')).toBeTruthy();
	});

	test('missing rAF renders the exact final number and announcement immediately', () => {
		expect(globalThis.requestAnimationFrame).toBeUndefined();
		const { getByTestId, getByText } = renderRewards();
		expect(getByTestId('aeroplane-rewards-total').textContent).toBe('19');
		expect(getByText('You earned 19 stars this match.')).toBeTruthy();
	});

	test('the live region mounts empty so the final total is announced', () => {
		// Effects never run for SSR markup: this is exactly the DOM a screen
		// reader sees on mount under reduced motion — an empty region whose
		// later insertion gets announced.
		const html = renderToStaticMarkup(
			<AeroplaneRewards
				matchKey='started:1'
				winner='red'
				mode='standard'
				capturesMade={3}
				planesFinished={1}
				breakdown={breakdown()}
				moments={[]}
				reducedMotion={true}
				progress={{ status: 'waiting-auth', lifetimeStars: 0 }}
				onRetryProgress={() => {}}
			/>
		);
		expect(html).toContain('role="status"');
		expect(html).not.toContain('You earned');
	});

	test('reduced motion renders the exact final number immediately', () => {
		const clock = installFrameClock();
		try {
			const { getByTestId, getByText } = renderRewards({
				reducedMotion: true,
			});
			expect(getByTestId('aeroplane-rewards-total').textContent).toBe('19');
			expect(getByText('You earned 19 stars this match.')).toBeTruthy();
			act(() => clock.advance(1000));
			expect(getByTestId('aeroplane-rewards-total').textContent).toBe('19');
		} finally {
			clock.uninstall();
		}
	});

	test('counts up over ~700ms and puts only the final text in the live region', () => {
		const clock = installFrameClock();
		try {
			const { getByTestId, getByText, queryByText } = renderRewards();
			expect(getByTestId('aeroplane-rewards-total').textContent).toBe('0');
			expect(queryByText(/You earned/)).toBeNull();
			act(() => clock.advance(1));
			act(() => clock.advance(350));
			// Halfway: roughly half the total, never past it.
			const halfway = Number(
				getByTestId('aeroplane-rewards-total').textContent
			);
			expect(halfway).toBeGreaterThan(0);
			expect(halfway).toBeLessThan(19);
			expect(queryByText(/You earned/)).toBeNull();
			act(() => clock.advance(400));
			expect(getByTestId('aeroplane-rewards-total').textContent).toBe('19');
			expect(getByText('You earned 19 stars this match.')).toBeTruthy();
		} finally {
			clock.uninstall();
		}
	});

	test('a new match identity restarts the count-up and cancels the old animation', () => {
		const clock = installFrameClock();
		try {
			const { getByTestId, rerender, getByText } = renderRewards();
			act(() => clock.advance(1));
			act(() => clock.advance(350));
			expect(getByTestId('aeroplane-rewards-total').textContent).not.toBe('19');
			// A different finished match with its own total restarts from zero;
			// the cancelled first animation can no longer complete.
			rerender(
				<AeroplaneRewards
					matchKey='started:2'
					winner='red'
					mode='standard'
					capturesMade={0}
					planesFinished={0}
					breakdown={breakdown({
						win: 0,
						captures: 0,
						finished: 0,
						total: 8,
					})}
					moments={[]}
					reducedMotion={false}
					progress={{ status: 'waiting-auth', lifetimeStars: 0 }}
					onRetryProgress={() => {}}
				/>
			);
			act(() => clock.advance(1)); // first frame starts the new clock
			act(() => clock.advance(350));
			expect(getByTestId('aeroplane-rewards-total').textContent).toBe('4');
			act(() => clock.advance(400));
			expect(getByTestId('aeroplane-rewards-total').textContent).toBe('8');
			expect(getByText('You earned 8 stars this match.')).toBeTruthy();
		} finally {
			clock.uninstall();
		}
	});

	test('unmount cancels the count-up animation', () => {
		const clock = installFrameClock();
		const canceled: number[] = [];
		const previousCancel = globalThis.cancelAnimationFrame;
		globalThis.cancelAnimationFrame = (id: number) => {
			canceled.push(id);
			previousCancel?.(id);
		};
		try {
			const { unmount } = renderRewards();
			act(() => clock.advance(1)); // schedules the next frame mid-count
			unmount();
			expect(canceled.length).toBeGreaterThan(0);
			act(() => clock.advance(1000)); // no late frames, no errors
		} finally {
			globalThis.cancelAnimationFrame = previousCancel;
			clock.uninstall();
		}
	});

	test('best moment: the highest multi-capture count wins regardless of order', () => {
		const first = renderRewards({
			moments: [
				capture('Double capture!', 2),
				capture('Quadruple capture!', 4),
			],
		});
		expect(first.getByTestId('aeroplane-rewards-moment').textContent).toBe(
			'Quadruple capture!'
		);
		first.unmount();

		const second = renderRewards({
			moments: [
				capture('Quadruple capture!', 4),
				capture('Double capture!', 2),
			],
		});
		expect(second.getByTestId('aeroplane-rewards-moment').textContent).toBe(
			'Quadruple capture!'
		);
		second.unmount();

		const five = renderRewards({
			moments: [
				capture('Double capture!', 2),
				capture('Multi-capture (5)!', 5),
			],
		});
		expect(five.getByTestId('aeroplane-rewards-moment').textContent).toBe(
			'Multi-capture (5)!'
		);
		five.unmount();
	});

	test('best moment: captures outrank coin gains, and the largest gain wins among coins', () => {
		// A capture beats even a far larger coin gain.
		const capturesWin = renderRewards({
			moments: [coinMoment(25), capture('Double capture!', 2)],
		});
		expect(
			capturesWin.getByTestId('aeroplane-rewards-moment').textContent
		).toBe('Double capture!');
		capturesWin.unmount();

		// Coin labels are identical, so the ranking is asserted on the pick:
		// +5 then +25 surfaces the +25 moment, whichever order they arrived in.
		expect(pickBestMoment([coinMoment(5), coinMoment(25)])?.coinGain).toBe(25);
		expect(pickBestMoment([coinMoment(25), coinMoment(5)])?.coinGain).toBe(25);
	});

	test('signed-in progress block shows lifetime stars and the next unlock', () => {
		const { getByTestId } = renderRewards({
			progress: { status: 'loaded', lifetimeStars: 30 },
		});
		const block = getByTestId('aeroplane-rewards-progress');
		expect(block.textContent).toContain('Lifetime stars: 30');
		expect(block.textContent).toContain(
			'Next unlock: Racer at 60 stars (30 to go).'
		);
	});

	test('a fully unlocked ladder reports no next unlock', () => {
		const { getByTestId } = renderRewards({
			progress: { status: 'loaded', lifetimeStars: 300 },
		});
		expect(getByTestId('aeroplane-rewards-progress').textContent).toContain(
			'Every skin is unlocked.'
		);
	});

	test('failed progress offers the hook retry; guests get neither', () => {
		const onRetryProgress = jest.fn();
		const failed = renderRewards({
			progress: { status: 'failed', lifetimeStars: 0 },
			onRetryProgress,
		});
		failed.getByRole('button', { name: 'Retry' }).click();
		expect(onRetryProgress).toHaveBeenCalledTimes(1);
		failed.unmount();

		const guest = renderRewards({
			progress: { status: 'waiting-auth', lifetimeStars: 0 },
			onRetryProgress,
		});
		expect(guest.queryByRole('button', { name: 'Retry' })).toBeNull();
		expect(guest.queryByTestId('aeroplane-rewards-progress')).toBeNull();
		guest.unmount();
	});
});
