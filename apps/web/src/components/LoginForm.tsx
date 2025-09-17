import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '../lib/auth';

export function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await login(email, password);

        if (result.success) {
            window.location.href = '/';
        } else {
            setError(result.error || 'Login failed');
        }

        setLoading(false);
    };

    return (
        <div className='w-full max-w-md mx-auto'>
            <div className='bg-card text-card-foreground shadow-lg rounded-lg p-6'>
                <div className='space-y-2 text-center mb-6'>
                    <h1 className='text-2xl font-bold'>Sign In</h1>
                    <p className='text-muted-foreground'>
                        Enter your credentials to access your account
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
                            htmlFor='password'
                            className='text-sm font-medium'
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
                        />
                    </div>

                    {error && (
                        <div className='text-destructive text-sm text-center'>
                            {error}
                        </div>
                    )}

                    <Button type='submit' className='w-full' disabled={loading}>
                        {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                </form>

                <div className='mt-4 text-center text-sm'>
                    <span className='text-muted-foreground'>
                        Don't have an account?{' '}
                    </span>
                    <a
                        href='/register'
                        className='text-primary hover:underline font-medium'
                    >
                        Sign up
                    </a>
                </div>
            </div>
        </div>
    );
}

export default LoginForm;
