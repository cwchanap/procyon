import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';

/**
 * Types for the Google Identity Services library loaded via
 * `<script src="https://accounts.google.com/gsi/client">` in Layout.astro.
 */
interface GoogleCredentialResponse {
	credential: string;
}

interface GoogleIdConfiguration {
	client_id: string;
	callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleAccountsId {
	initialize: (config: GoogleIdConfiguration) => void;
	renderButton: (
		parent: HTMLElement,
		options: {
			theme?: 'outline' | 'filled_blue' | 'filled_black';
			size?: 'large' | 'medium' | 'small';
			text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
			width?: number;
		}
	) => void;
}

declare global {
	interface Window {
		google?: {
			accounts: {
				id: GoogleAccountsId;
			};
		};
	}
}

interface GoogleSignInButtonProps {
	text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
}

export function GoogleSignInButton({
	text = 'signin_with',
}: GoogleSignInButtonProps) {
	const { signInWithGoogle } = useAuth();
	const buttonRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<{
		message: string;
		reloadable: boolean;
	} | null>(null);
	const [loading, setLoading] = useState(false);
	// True while the bounded poll waits for the GIS script; the widget space
	// reserves the button height so clearing it cannot shift the layout.
	const [pending, setPending] = useState(true);

	useEffect(() => {
		const clientId = env.PUBLIC_GOOGLE_CLIENT_ID;
		if (!clientId) {
			setError({
				message: 'Google Sign-In is not configured.',
				reloadable: false,
			});
			setPending(false);
			return;
		}

		let cancelled = false;
		let attempts = 0;
		const MAX_ATTEMPTS = 50; // ~5 seconds at 100ms intervals

		function tryInitialize() {
			if (cancelled) return;

			if (!window.google?.accounts?.id) {
				attempts++;
				if (attempts >= MAX_ATTEMPTS) {
					setError({
						message:
							'Google Sign-In library not loaded. Please refresh the page.',
						reloadable: true,
					});
					setPending(false);
					return;
				}
				setTimeout(tryInitialize, 100);
				return;
			}

			try {
				window.google.accounts.id.initialize({
					client_id: clientId,
					callback: async (response: GoogleCredentialResponse) => {
						setLoading(true);
						setError(null);
						try {
							const result = await signInWithGoogle(response.credential);
							if (result.success) {
								window.location.href = '/';
							} else {
								setError({
									message: result.error || 'Sign-in failed',
									reloadable: false,
								});
							}
						} catch {
							setError({
								message: 'Sign-in failed',
								reloadable: false,
							});
						} finally {
							setLoading(false);
						}
					},
				});
			} catch {
				setError({
					message:
						'Google Sign-In failed to initialize. Please reload the page.',
					reloadable: true,
				});
				setPending(false);
				return;
			}

			if (buttonRef.current) {
				try {
					const containerWidth =
						buttonRef.current.parentElement?.clientWidth ?? 400;
					const buttonWidth = Math.min(containerWidth, 400);
					window.google.accounts.id.renderButton(buttonRef.current, {
						theme: 'filled_black',
						size: 'large',
						text,
						width: buttonWidth,
					});
				} catch {
					setError({
						message:
							'Google Sign-In failed to initialize. Please reload the page.',
						reloadable: true,
					});
					setPending(false);
					return;
				}
			}
			setPending(false);
		}

		tryInitialize();
		return () => {
			cancelled = true;
		};
	}, [signInWithGoogle, text]);

	if (error && !env.PUBLIC_GOOGLE_CLIENT_ID) {
		return (
			<div role='alert' className='text-center text-ivory-dim text-sm'>
				Google Sign-In is not configured. Please set{' '}
				<code className='bg-ink-800 px-1 rounded'>PUBLIC_GOOGLE_CLIENT_ID</code>{' '}
				in your environment.
			</div>
		);
	}

	return (
		<div
			className='flex flex-col items-center gap-4 w-full max-w-[400px]'
			data-testid='google-signin-button'
		>
			{loading && <div className='text-ivory-dim text-sm'>Signing in...</div>}
			{error && (
				<div
					role='alert'
					className='text-destructive text-sm text-center bg-destructive/10 border border-destructive/30 rounded-lg p-3'
				>
					{error.message}
					{error.reloadable && (
						<button
							type='button'
							// The GIS script is injected once by Layout.astro; only a
							// real page reload can retry that request — polling again
							// cannot recover a failed script load.
							onClick={() => window.location.reload()}
							className='mt-3 block mx-auto rounded-md border border-destructive/40 px-3 py-1 text-xs hover:bg-destructive/20'
						>
							Reload
						</button>
					)}
				</div>
			)}
			{/* Reserves the real Google button's height; the pending status
			    overlays this same space instead of adding a flex item (a
			    sibling would add a gap-4 that vanishes when cleared). */}
			<div
				data-testid='google-signin-widget-space'
				style={{ minHeight: '40px' }}
				className='relative w-full flex items-center justify-center'
			>
				{pending && (
					<div
						role='status'
						style={{ position: 'absolute', inset: '0' }}
						className='flex items-center justify-center text-ivory-dim text-sm'
					>
						Loading Google Sign-In…
					</div>
				)}
				<div ref={buttonRef} />
			</div>
		</div>
	);
}

export default GoogleSignInButton;
