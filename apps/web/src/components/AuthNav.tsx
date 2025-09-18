import React from 'react';
import { Button } from './ui/Button';
import { useAuth } from '../lib/auth';

export function AuthNav() {
    const { user, logout, isAuthenticated } = useAuth();

    return (
        <div className='fixed top-4 right-4 z-50'>
            {isAuthenticated ? (
                <div className='bg-card/80 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-border/50 flex items-center gap-3'>
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
                <Button
                    variant='default'
                    size='lg'
                    onClick={() => (window.location.href = '/login')}
                    className='bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200'
                >
                    Login
                </Button>
            )}
        </div>
    );
}

export default AuthNav;
