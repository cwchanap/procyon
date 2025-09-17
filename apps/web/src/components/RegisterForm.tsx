import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '../lib/auth';

export function RegisterForm() {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        const result = await register(email, username, password);

        if (result.success) {
            window.location.href = '/';
        } else {
            setError(result.error || 'Registration failed');
        }

        setLoading(false);
    };

    return (
        <div className='w-full max-w-md mx-auto'>
            <div className='bg-card text-card-foreground shadow-lg rounded-lg p-6'>
                <div className='space-y-2 text-center mb-6'>
                    <h1 className='text-2xl font-bold'>Create Account</h1>
                    <p className='text-muted-foreground'>
                        Sign up to start playing chess
                    </p>
                </div>

                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='space-y-2'>
                        <label htmlFor='email' className='text-sm font-medium'>
                            Email
                        </label>
                        <Input
                            id='email'
                            type='email'
                            placeholder='Enter your email'
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className='space-y-2'>
                        <label
                            htmlFor='username'
                            className='text-sm font-medium'
                        >
                            Username
                        </label>
                        <Input
                            id='username'
                            type='text'
                            placeholder='Choose a username'
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className='space-y-2'>
                        <label
                            htmlFor='password'
                            className='text-sm font-medium'
                        >
                            Password
                        </label>
                        <Input
                            id='password'
                            type='password'
                            placeholder='Create a password'
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className='space-y-2'>
                        <label
                            htmlFor='confirmPassword'
                            className='text-sm font-medium'
                        >
                            Confirm Password
                        </label>
                        <Input
                            id='confirmPassword'
                            type='password'
                            placeholder='Confirm your password'
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className='text-destructive text-sm text-center'>
                            {error}
                        </div>
                    )}

                    <Button type='submit' className='w-full' disabled={loading}>
                        {loading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                </form>

                <div className='mt-4 text-center text-sm'>
                    <span className='text-muted-foreground'>
                        Already have an account?{' '}
                    </span>
                    <a
                        href='/login'
                        className='text-primary hover:underline font-medium'
                    >
                        Sign in
                    </a>
                </div>
            </div>
        </div>
    );
}

export default RegisterForm;
