import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// The site is plain static files (app/build). Any host can serve them; the Node game
			// server does it on Railway. Unknown paths such as /online/K7QM2X get index.html and
			// the app's router takes over.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		// In development the website forwards game traffic to the local game server, so a
		// phone only needs to reach one address (this one) instead of two ports.
		proxy: {
			'/api': 'http://127.0.0.1:8787',
			'/auth': 'http://127.0.0.1:8787',
			'/ws': { target: 'ws://127.0.0.1:8787', ws: true }
		}
	}
});
