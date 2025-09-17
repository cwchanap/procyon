import React from 'react';
import { Button } from './ui/Button';
import { useAuth } from '../lib/auth';

export function AuthNav() {
    const { user, logout, isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <div className='fixed top-4 right-4 z-50'>
                <div className='bg-card/80 backdrop-blur-sm rounded-lg px-3 py-2'>
                    <span className='text-sm text-muted-foreground'>
                        Loading...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className='fixed top-4 right-4 z-50'>
            <div className='bg-card/80 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-border/50'>
                {isAuthenticated ? (
                    <div className='flex items-center gap-3'>
                        <div className='text-sm'>
                            <div className='font-medium text-card-foreground'>
                                {user?.username}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                                {user?.email}
                            </div>
                        </div>
                        <Button
                            variant='outline'
                            size='sm'
                            onClick={logout}
                            className='text-xs'
                        >
                            Logout
                        </Button>
                    </div>
                ) : (
                    <div className='flex items-center gap-2'>
                        <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => (window.location.href = '/login')}
                            className='text-xs'
                        >
                            Sign In
                        </Button>
                        <Button
                            variant='default'
                            size='sm'
                            onClick={() => (window.location.href = '/register')}
                            className='text-xs'
                        >
                            Sign Up
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AuthNav;
