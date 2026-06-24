import React from 'react';
import { Panel } from './ui/Panel';
import { GoogleSignInButton } from './GoogleSignInButton';

export function LoginForm() {
	return (
		<div className='w-full max-w-md mx-auto'>
			<Panel className='p-8'>
				<div className='space-y-2 text-center mb-8'>
					<h1 className='text-3xl font-semibold font-display text-ivory'>
						Sign In
					</h1>
					<p className='text-ivory-dim'>Sign in with your Google account</p>
				</div>

				<div className='flex justify-center'>
					<GoogleSignInButton text='signin_with' />
				</div>
			</Panel>
		</div>
	);
}

export default LoginForm;
