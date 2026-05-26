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
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const clientId = env.PUBLIC_GOOGLE_CLIENT_ID;
		if (!clientId) {
			setError('Google Sign-In is not configured.');
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
					setError(
						'Google Sign-In library not loaded. Please refresh the page.'
					);
					return;
				}
				setTimeout(tryInitialize, 100);
				return;
			}

			window.google.accounts.id.initialize({
				client_id: clientId,
				callback: async (response: GoogleCredentialResponse) => {
					setLoading(true);
					setError('');
					const result = await signInWithGoogle(response.credential);
					if (result.success) {
						window.location.href = '/';
					} else {
						setError(result.error || 'Sign-in failed');
					}
					setLoading(false);
				},
			});

			if (buttonRef.current) {
				window.google.accounts.id.renderButton(buttonRef.current, {
					theme: 'filled_black',
					size: 'large',
					text,
					width: 400,
				});
			}
		}

		tryInitialize();
		return () => {
			cancelled = true;
		};
	}, [signInWithGoogle, text]);

	if (error && !env.PUBLIC_GOOGLE_CLIENT_ID) {
		return (
			<div className='text-center text-purple-200 text-sm'>
				Google Sign-In is not configured. Please set{' '}
				<code className='bg-purple-900/50 px-1 rounded'>
					PUBLIC_GOOGLE_CLIENT_ID
				</code>{' '}
				in your environment.
			</div>
		);
	}

	return (
		<div
			className='flex flex-col items-center gap-4'
			data-testid='google-signin-button'
		>
			{loading && (
				<div className='text-purple-200 text-sm animate-pulse'>
					Signing in...
				</div>
			)}
			{error && (
				<div className='text-red-400 text-sm text-center bg-red-900/20 border border-red-500/30 rounded-lg p-3'>
					{error}
				</div>
			)}
			<div ref={buttonRef} />
		</div>
	);
}

export default GoogleSignInButton;
