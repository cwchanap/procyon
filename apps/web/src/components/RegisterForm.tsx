import React from 'react';
import { Panel } from './ui/Panel';
import { GoogleSignInButton } from './GoogleSignInButton';

export function RegisterForm() {
	return (
		<div className='w-full max-w-md mx-auto'>
			<Panel className='p-8'>
				<div className='space-y-2 text-center mb-6'>
					<h1 className='text-2xl font-semibold font-display text-ivory'>
						Create Account
					</h1>
					<p className='text-ivory-dim'>Sign up with your Google account</p>
				</div>

				<div className='flex justify-center'>
					<GoogleSignInButton text='signup_with' />
				</div>
			</Panel>
		</div>
	);
}

export default RegisterForm;
