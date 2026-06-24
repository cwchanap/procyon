import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

interface NavItem {
	label: string;
	href: string;
	icon: string; // unicode glyph
}

const PUBLIC_NAV: NavItem[] = [
	{ label: 'Play', href: '/', icon: '♟' },
	{ label: 'Puzzles', href: '/puzzles', icon: '◆' },
];

const AUTHED_NAV: NavItem[] = [
	{ label: 'History', href: '/play-history', icon: '≡' },
	{ label: 'Profile', href: '/profile', icon: '◐' },
];

export function AppShell() {
	const { user, logout, isAuthenticated, loading } = useAuth();
	const [path, setPath] = useState('/');

	useEffect(() => {
		setPath(window.location.pathname);
	}, []);

	useEffect(() => {
		if (loading) return;
		// Signal to Layout.astro CSS that the React nav has hydrated and is
		// ready to be displayed.  The server-rendered static nav is hidden via
		// `html.procyon-auth-hydrated #procyon-server-auth-nav { display:none }`.
		document.documentElement.classList.add('procyon-auth-hydrated');
		document.documentElement.classList.remove('procyon-auth-client-pending');
	}, [loading]);

	const isActive = (href: string) =>
		href === '/' ? path === '/' : path.startsWith(href);

	// History and Profile require authentication; hide them until the auth
	// state resolves and only show them for authenticated users.
	const navItems = loading
		? PUBLIC_NAV
		: isAuthenticated
			? [...PUBLIC_NAV, ...AUTHED_NAV]
			: PUBLIC_NAV;

	const handleLogout = async () => {
		const result = await logout();
		if (!result.success) alert('Failed to sign out. Please try again.');
	};

	const userChip = loading ? (
		<div className='h-10' aria-hidden='true' />
	) : isAuthenticated ? (
		<div className='flex items-center gap-3'>
			<div className='flex h-9 w-9 items-center justify-center rounded-full bg-brass text-ink-900 text-sm font-bold'>
				{user?.username?.charAt(0)?.toUpperCase()}
			</div>
			<div className='min-w-0 flex-1'>
				<div className='truncate text-sm text-ivory'>{user?.username}</div>
				<button
					onClick={handleLogout}
					className='text-xs text-ivory-dim hover:text-brass transition-colors'
				>
					Sign Out
				</button>
			</div>
		</div>
	) : (
		<a
			href='/login'
			className='inline-flex h-10 w-full items-center justify-center rounded-md bg-brass px-4 text-sm font-medium text-ink-900 hover:bg-brass-bright transition-colors'
		>
			Login
		</a>
	);

	return (
		<>
			{/* Desktop left rail */}
			<aside className='fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-line bg-ink-800 px-4 py-6 lg:flex'>
				<a href='/' className='mb-10 flex items-center gap-3'>
					<span className='flex h-9 w-9 items-center justify-center rounded-full bg-brass text-ink-900 text-lg'>
						♔
					</span>
					<span className='font-display text-xl font-semibold tracking-wide text-ivory'>
						PROCYON
					</span>
				</a>
				<nav className='flex flex-1 flex-col gap-1'>
					{navItems.map(item => (
						<a
							key={item.href}
							href={item.href}
							className={cn(
								'group flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors',
								isActive(item.href)
									? 'border-l-brass bg-ink-700 text-brass'
									: 'border-l-transparent text-ivory-dim hover:bg-ink-600 hover:text-ivory'
							)}
						>
							<span className='w-4 text-center'>{item.icon}</span>
							{item.label}
						</a>
					))}
				</nav>
				<div className='mt-6 border-t border-line pt-4'>{userChip}</div>
			</aside>

			{/* Mobile bottom tab bar */}
			<nav className='fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-ink-800/95 backdrop-blur lg:hidden'>
				{navItems.map(item => (
					<a
						key={item.href}
						href={item.href}
						aria-label={item.label}
						className={cn(
							'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
							isActive(item.href)
								? 'text-brass'
								: 'text-ivory-dim hover:text-ivory'
						)}
					>
						<span className='text-base'>{item.icon}</span>
						{item.label}
					</a>
				))}
				{!loading && !isAuthenticated && (
					<a
						href='/login'
						aria-label='Login'
						className='flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-brass'
					>
						<span className='text-base'>→</span>
						Login
					</a>
				)}
				{!loading && isAuthenticated && (
					<button
						onClick={handleLogout}
						aria-label='Sign Out'
						className='flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-ivory-dim transition-colors hover:text-brass'
					>
						<span className='text-base'>⎋</span>
						Sign Out
					</button>
				)}
			</nav>
		</>
	);
}

export default AppShell;
