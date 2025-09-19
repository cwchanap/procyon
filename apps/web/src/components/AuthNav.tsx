import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { useAuth } from '../lib/auth';

export function AuthNav() {
    const { user, logout, isAuthenticated } = useAuth();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    const toggleDropdown = () => {
        setIsDropdownOpen(!isDropdownOpen);
    };

    const handleProfileClick = () => {
        setIsDropdownOpen(false);
        window.location.href = '/profile';
    };

    const handleLogoutClick = () => {
        setIsDropdownOpen(false);
        logout();
    };

    return (
        <div className='fixed top-4 right-4 z-50'>
            {isAuthenticated ? (
                <div className='relative' ref={dropdownRef}>
                    {/* User Badge */}
                    <button
                        onClick={toggleDropdown}
                        className='bg-card/80 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-border/50 flex items-center gap-3 hover:bg-card/90 transition-colors cursor-pointer'
                    >
                        {/* Avatar */}
                        <div className='w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold'>
                            {user?.username.charAt(0).toUpperCase()}
                        </div>
                        <div className='text-sm'>
                            <div className='font-medium text-card-foreground'>
                                {user?.username}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                                {user?.email}
                            </div>
                        </div>
                        {/* Dropdown Arrow */}
                        <svg
                            className={`w-4 h-4 text-muted-foreground transition-transform ${
                                isDropdownOpen ? 'rotate-180' : ''
                            }`}
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth={2}
                                d='M19 9l-7 7-7-7'
                            />
                        </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                        <div className='absolute right-0 mt-2 w-48 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl border border-border/50 py-2 z-50'>
                            <div className='px-4 py-2 border-b border-border/30'>
                                <div className='text-sm font-medium text-card-foreground'>
                                    {user?.username}
                                </div>
                                <div className='text-xs text-muted-foreground truncate'>
                                    {user?.email}
                                </div>
                            </div>

                            <button
                                onClick={handleProfileClick}
                                className='w-full px-4 py-2 text-left text-sm text-card-foreground hover:bg-accent/50 transition-colors flex items-center gap-2'
                            >
                                <svg
                                    className='w-4 h-4'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                >
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                                    />
                                </svg>
                                Profile
                            </button>

                            <div className='border-t border-border/30 mt-2 pt-2'>
                                <button
                                    onClick={handleLogoutClick}
                                    className='w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2'
                                >
                                    <svg
                                        className='w-4 h-4'
                                        fill='none'
                                        stroke='currentColor'
                                        viewBox='0 0 24 24'
                                    >
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth={2}
                                            d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
                                        />
                                    </svg>
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    )}
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
