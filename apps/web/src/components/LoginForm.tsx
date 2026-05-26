import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '../lib/auth';

export function LoginForm() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [lockoutMs, setLockoutMs] = useState(0);
	const [isHydrated, setIsHydrated] = useState(false);
	const { login } = useAuth();

	React.useEffect(() => {
		setIsHydrated(true);
	}, []);

	React.useEffect(() => {
		if (lockoutMs <= 0) return;
		const interval = window.setInterval(() => {
			setLockoutMs(ms => Math.max(ms - 1000, 0));
		}, 1000);
		return () => window.clearInterval(interval);
	}, [lockoutMs]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (lockoutMs > 0) return;
		setError('');
		setLoading(true);

		const result = await login(email, password);

		if (result.success) {
			window.location.href = '/';
		} else {
			setError(result.error || 'Login failed');
			if ('retryAfterMs' in result && typeof result.retryAfterMs === 'number') {
				setLockoutMs(result.retryAfterMs);
			}
		}

		setLoading(false);
	};

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
						Enter your credentials to access your account
					</p>
				</div>

				<form onSubmit={handleSubmit} className='space-y-6'>
					<div className='space-y-2'>
						<label
							htmlFor='email'
							className='text-sm font-medium text-purple-200'
						>
							Email
						</label>
						<Input
							id='email'
							type='email'
							placeholder='Enter your email'
							value={email}
							onChange={e => setEmail(e.target.value)}
							required
							className='bg-purple-900/30 border-purple-400/50 text-white placeholder-purple-300 focus:border-purple-400 focus:ring-purple-400/50'
						/>
					</div>

					<div className='space-y-2'>
						<label
							htmlFor='password'
							className='text-sm font-medium text-purple-200'
						>
							Password
						</label>
						<Input
							id='password'
							type='password'
							placeholder='Enter your password'
							value={password}
							onChange={e => setPassword(e.target.value)}
							required
							className='bg-purple-900/30 border-purple-400/50 text-white placeholder-purple-300 focus:border-purple-400 focus:ring-purple-400/50'
						/>
					</div>

					{error && (
						<div className='text-red-400 text-sm text-center bg-red-900/20 border border-red-500/30 rounded-lg p-3'>
							{error}
						</div>
					)}
					{lockoutMs > 0 && (
						<div className='text-amber-300 text-sm text-center bg-amber-900/20 border border-amber-500/30 rounded-lg p-3'>
							Too many attempts. Try again in {Math.ceil(lockoutMs / 1000)}s.
						</div>
					)}

					<Button
						type='submit'
						className='w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200'
						disabled={loading || lockoutMs > 0}
					>
						{lockoutMs > 0
							? `Locked (${Math.ceil(lockoutMs / 1000)}s)`
							: loading
								? 'Signing In...'
								: 'Sign In'}
					</Button>
				</form>

				<div className='mt-6 text-center text-sm'>
					<span className='text-purple-300'>Don't have an account? </span>
					<a
						href='/register'
						className='text-pink-400 hover:text-pink-300 font-medium transition-colors duration-200 hover:underline'
					>
						Sign up
					</a>
				</div>
			</div>
		</div>
	);
}

export default LoginForm;
