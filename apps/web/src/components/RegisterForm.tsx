import React from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';

export function RegisterForm() {
	return (
		<div className='w-full max-w-md mx-auto'>
			<div className='glass-effect shadow-xl rounded-lg p-6 backdrop-blur-lg border border-white/20'>
				<div className='space-y-2 text-center mb-6'>
					<h1 className='text-2xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
						Create Account
					</h1>
					<p className='text-purple-100'>Sign up with your Google account</p>
				</div>

				<div className='flex justify-center'>
					<GoogleSignInButton text='signup_with' />
				</div>
			</div>
		</div>
	);
}

export default RegisterForm;
