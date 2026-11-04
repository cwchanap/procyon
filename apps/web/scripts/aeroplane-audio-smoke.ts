/**
 * HPA-692 Phase 3 early real-browser codec smoke (not a unit test).
 * Loads the real dev game in real browser engines, clicks Start (prime)
 * and Roll (cue), and records REAL evidence: HTTP fetch of .m4a bytes,
 * native decodeAudioData results (duration/channels/sampleRate — byteLength
 * is captured at call time because Chromium detaches the input buffer
 * synchronously), and real AudioBufferSourceNode starts. A buffer-source
 * start proves the context reached 'running', since the game only starts
 * sources then. No human listening is claimed.
 */
import { chromium, webkit, firefox, type BrowserType } from '@playwright/test';

interface Evidence {
	engine: string;
	pageLoad: string;
	aacSupport: string;
	userActivation: string;
	fetchedM4a: string[];
	decodeResults: string[];
	started: string[];
	gameFunctioning: string;
	otherErrors: string[];
}

async function smoke(
	engine: string,
	type: BrowserType,
	options: Record<string, unknown> = {}
): Promise<Evidence> {
	const evidence: Evidence = {
		engine,
		pageLoad: '',
		aacSupport: 'unknown',
		userActivation: 'unknown',
		fetchedM4a: [],
		decodeResults: [],
		started: [],
		gameFunctioning: 'unknown',
		otherErrors: [],
	};
	const browser = await type.launch(options as never);
	try {
		const page = await browser.newPage();
		const knownNoise = [
			/did not match/, // pre-existing SSR float-precision warnings
			/Could not connect to the server/, // API server intentionally not running
			/Cross-Origin Request Blocked/,
			/ERR_CONNECTION_REFUSED/,
		];
		page.on('pageerror', error =>
			evidence.otherErrors.push(`pageerror: ${error.message}`)
		);
		page.on('console', message => {
			if (
				message.type() === 'error' &&
				!knownNoise.some(pattern => pattern.test(message.text()))
			) {
				evidence.otherErrors.push(`console: ${message.text()}`);
			}
		});
		await page.addInitScript(() => {
			const smoke: Record<'cues' | 'decodes' | 'starts', string[]> = {
				cues: [],
				decodes: [],
				starts: [],
			};
			(window as unknown as Record<string, unknown>).__aeroSmoke = smoke;
			const originalFetch = window.fetch.bind(window);
			const recordingFetch = async (
				input: RequestInfo | URL,
				init?: RequestInit
			) => {
				const response = await originalFetch(input, init);
				const url = typeof input === 'string' ? input : input.toString();
				if (url.includes('/aeroplane/sfx/')) {
					const name = url.slice(url.lastIndexOf('/') + 1);
					smoke.cues.push(
						`${name} HTTP ${response.status} ${response.headers.get('content-type')}`
					);
				}
				return response;
			};
			window.fetch = recordingFetch as unknown as typeof fetch;
			const proto = AudioContext.prototype as unknown as Record<
				string,
				unknown
			>;
			const originalDecode = proto.decodeAudioData as (
				bytes: ArrayBuffer
			) => Promise<AudioBuffer>;
			proto.decodeAudioData = function (
				this: AudioContext,
				bytes: ArrayBuffer
			) {
				// Chromium detaches the input synchronously; capture size first.
				const byteLength = bytes.byteLength;
				return originalDecode
					.call(this, bytes)
					.then(buffer => {
						smoke.decodes.push(
							`ok duration=${buffer.duration.toFixed(3)}s channels=${buffer.numberOfChannels} rate=${buffer.sampleRate} bytes=${byteLength}`
						);
						return buffer;
					})
					.catch(error => {
						smoke.decodes.push(`FAILED ${String(error)} bytes=${byteLength}`);
						throw error;
					});
			};
			const sourceProto = AudioBufferSourceNode.prototype as unknown as Record<
				string,
				unknown
			>;
			const originalStart = sourceProto.start as () => void;
			sourceProto.start = function (
				this: AudioBufferSourceNode,
				...rest: unknown[]
			) {
				smoke.starts.push(
					`start@${Math.round(performance.now())}ms buffer=${this.buffer?.duration.toFixed(3)}s channels=${this.buffer?.numberOfChannels}`
				);
				return (originalStart as (...args: unknown[]) => void).apply(
					this,
					rest
				);
			};
		});
		const response = await page.goto('http://localhost:3500/aeroplane', {
			waitUntil: 'networkidle',
		});
		evidence.pageLoad = `HTTP ${response?.status()}`;
		evidence.aacSupport = await page.evaluate(
			() =>
				`canPlay=${new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') || 'no'}`
		);
		await page.getByRole('button', { name: /start match/i }).click();
		// Let the preload decodes settle so the first roll cue can start.
		await page.waitForTimeout(700);
		await page.getByRole('button', { name: /roll die/i }).click();
		await page.waitForTimeout(1200);
		const roll = page.getByRole('button', { name: /roll die/i });
		if (await roll.isEnabled()) await roll.click().catch(() => undefined);
		await page.waitForTimeout(1800);
		const raw = await page.evaluate(() => {
			const smoke = (
				window as unknown as {
					__aeroSmoke: Record<'cues' | 'decodes' | 'starts', string[]>;
				}
			).__aeroSmoke;
			const face = document.querySelector('[data-testid="aeroplane-die-face"]');
			const feed = document.querySelectorAll(
				'[data-testid="aeroplane-event-feed"] > *'
			);
			return {
				cues: smoke.cues,
				decodes: smoke.decodes,
				starts: smoke.starts,
				activation: String(
					(
						navigator as Navigator & {
							userActivation?: { hasBeenActive?: boolean };
						}
					).userActivation?.hasBeenActive
				),
				game: `dieFace=${face?.textContent ?? 'missing'} feedEntries=${feed.length}`,
			};
		});
		evidence.fetchedM4a = raw.cues ?? [];
		evidence.decodeResults = raw.decodes ?? [];
		evidence.started = raw.starts ?? [];
		evidence.userActivation = raw.activation;
		evidence.gameFunctioning = raw.game;
		return evidence;
	} finally {
		await browser.close();
	}
}

const engines: Array<[string, BrowserType, Record<string, unknown>?]> = [
	['google-chrome (branded)', chromium, { channel: 'chrome' }],
	['webkit (Safari engine)', webkit],
	['firefox (macOS build; Linux AAC risk noted separately)', firefox],
	['playwright-oss-chromium (no proprietary codecs)', chromium],
];

for (const [name, type, options] of engines) {
	try {
		console.log(
			JSON.stringify(await smoke(name, type, options ?? {}), null, 2)
		);
	} catch (error) {
		console.log(
			JSON.stringify({ engine: name, smokeError: String(error) }, null, 2)
		);
	}
}
