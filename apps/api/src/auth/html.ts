interface AuthUser {
	id: string;
	email: string;
	username: string;
	name?: string | null;
	picture?: string | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function getInitialAuthUserScript(user: AuthUser | null): string {
	const serialized = JSON.stringify(user).replace(/</g, '\\u003c');
	return `window.__PROCYON_INITIAL_AUTH_USER__=${serialized};`;
}

export function renderServerAuthNav(user: AuthUser | null): string {
	const authHtml = user
		? `<a href="/profile" class="bg-white/10 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-white/20 flex items-center gap-3 hover:bg-white/20 transition-colors cursor-pointer"><div class="text-sm hidden sm:block"><div class="font-medium text-white">${escapeHtml(user.username)}</div><div class="text-xs text-purple-200">${escapeHtml(user.email)}</div></div><div class="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">${escapeHtml(user.username.charAt(0).toUpperCase())}</div></a>`
		: `<a href="/login" data-auth-anonymous class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary hover:bg-primary/90 h-10 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">Login</a>`;

	return `<nav class="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-lg border-b border-purple-500/20"><div class="container mx-auto px-4"><div class="flex items-center justify-between h-16"><div class="flex items-center gap-3"><a href="/" class="flex items-center gap-3 text-white hover:text-purple-200 transition-colors duration-200"><div class="w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-lg shadow-lg">♔</div><span class="text-xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Procyon Chess</span></a></div><div class="hidden sm:flex items-center gap-1"><a href="/puzzles" class="px-3 py-1.5 rounded-lg text-sm text-purple-200 hover:text-white hover:bg-white/10 transition-colors duration-200">Puzzles</a></div><div class="flex sm:hidden items-center gap-1"><a href="/puzzles" aria-label="Puzzles" class="px-3 py-1.5 rounded-lg text-sm text-purple-200 hover:text-white hover:bg-white/10 transition-colors duration-200">Puzzles</a></div><div class="flex items-center gap-4">${authHtml}</div></div></div></nav>`;
}
