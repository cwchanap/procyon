import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';

interface GoogleCredentialResponse {
	credential: string;
}

declare global {
	interface Window {
		google?: {
			accounts?: {
				id?: {
					initialize: (config: {
						client_id: string;
						callback: (response: GoogleCredentialResponse) => void;
					}) => void;
					renderButton: (
						element: HTMLElement,
						options: Record<string, unknown>
					) => void;
				};
			};
		};
	}
}

export function LoginForm() {
	const buttonRef = useRef<HTMLDivElement | null>(null);
	const [error, setError] = useState('');
	const [isHydrated, setIsHydrated] = useState(false);
	const { signInWithGoogle } = useAuth();

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	useEffect(() => {
		if (!isHydrated || !buttonRef.current) return;
		const clientId = env.PUBLIC_GOOGLE_CLIENT_ID;
		if (!clientId) {
			setError('Google client ID is not configured.');
			return;
		}

		let cancelled = false;

		const renderGoogleButton = () => {
			if (cancelled || !buttonRef.current) return;
			const gis = window.google?.accounts?.id;
			if (!gis) {
				setError('Google sign-in script failed to load.');
				return;
			}
			gis.initialize({
				client_id: clientId,
				callback: async response => {
					if (cancelled) return;
					setError('');
					const result = await signInWithGoogle(response.credential);
					if (cancelled) return;
					if (result.success) {
						window.location.href = '/';
					} else {
						setError(result.error || 'Sign-in failed');
					}
				},
			});
			gis.renderButton(buttonRef.current, {
				theme: 'filled_black',
				size: 'large',
				shape: 'pill',
				text: 'signin_with',
				width: 320,
			});
		};

		if (window.google?.accounts?.id) {
			renderGoogleButton();
			return;
		}

		const GIS_SRC = 'https://accounts.google.com/gsi/client';
		const existing = document.querySelector<HTMLScriptElement>(
			`script[src="${GIS_SRC}"]`
		);
		const script = existing ?? document.createElement('script');
		const handleLoad = () => renderGoogleButton();
		const handleError = () => {
			if (!cancelled) setError('Google sign-in script failed to load.');
		};
		script.addEventListener('load', handleLoad);
		script.addEventListener('error', handleError);
		if (!existing) {
			script.src = GIS_SRC;
			script.async = true;
			script.defer = true;
			document.head.appendChild(script);
		}

		return () => {
			cancelled = true;
			script.removeEventListener('load', handleLoad);
			script.removeEventListener('error', handleError);
		};
	}, [isHydrated, signInWithGoogle]);

	return (
		<div
			className='w-full max-w-md mx-auto'
			data-testid='login-form'
			data-hydrated={isHydrated ? 'true' : 'false'}
		>
			<div className='bg-gradient-to-br from-purple-900/20 to-pink-900/20 backdrop-blur-lg border border-purple-500/30 shadow-2xl rounded-2xl p-8'>
				<div className='space-y-2 text-center mb-8'>
					<h1 className='text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
						Sign In
					</h1>
					<p className='text-purple-200'>
						Sign in with your Google account to continue
					</p>
				</div>

				<div className='flex justify-center' ref={buttonRef} />

				{error && (
					<div className='mt-6 text-red-400 text-sm text-center bg-red-900/20 border border-red-500/30 rounded-lg p-3'>
						{error}
					</div>
				)}
			</div>
		</div>
	);
}

export default LoginForm;
