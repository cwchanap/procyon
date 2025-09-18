import React from 'react';
import { Button } from './ui/Button';
import { useAuth } from '../lib/auth';

export function AppNavBar() {
    const { user, logout, isAuthenticated } = useAuth();

    return (
        <nav className='fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-lg border-b border-purple-500/20'>
            <div className='container mx-auto px-4'>
                <div className='flex items-center justify-between h-16'>
                    {/* Logo/Brand */}
                    <div className='flex items-center gap-3'>
                        <a
                            href='/'
                            className='flex items-center gap-3 text-white hover:text-purple-200 transition-colors duration-200'
                        >
                            <div className='w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-lg shadow-lg'>
                                ♔
                            </div>
                            <span className='text-xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
                                Procyon Chess
                            </span>
                        </a>
                    </div>

                    {/* Navigation Links */}
                    <div className='hidden md:flex items-center gap-6'>
                        <a
                            href='/'
                            className='text-purple-100 hover:text-white transition-colors duration-200 font-medium'
                        >
                            Home
                        </a>
                        <a
                            href='/chess'
                            className='text-purple-100 hover:text-white transition-colors duration-200 font-medium'
                        >
                            Play Chess
                        </a>
                    </div>

                    {/* Auth Section */}
                    <div className='flex items-center gap-4'>
                        {isAuthenticated ? (
                            <div className='flex items-center gap-3'>
                                <div className='text-sm text-right hidden sm:block'>
                                    <div className='font-medium text-white'>
                                        {user?.username}
                                    </div>
                                    <div className='text-xs text-purple-200'>
                                        {user?.email}
                                    </div>
                                </div>
                                <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={logout}
                                    className='border-purple-400/50 text-purple-200 hover:bg-purple-400/20 hover:text-white'
                                >
                                    Logout
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant='default'
                                size='default'
                                onClick={() =>
                                    (window.location.href = '/login')
                                }
                                className='bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200'
                            >
                                Login
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}

export default AppNavBar;
