import React from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';

export function LoginForm() {
	return (
		<div className='w-full max-w-md mx-auto'>
			<div className='bg-gradient-to-br from-purple-900/20 to-pink-900/20 backdrop-blur-lg border border-purple-500/30 shadow-2xl rounded-2xl p-8'>
				<div className='space-y-2 text-center mb-8'>
					<h1 className='text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
						Sign In
					</h1>
					<p className='text-purple-200'>Sign in with your Google account</p>
				</div>

				<div className='flex justify-center'>
					<GoogleSignInButton text='signin_with' />
				</div>
			</div>
		</div>
	);
}

export default LoginForm;
