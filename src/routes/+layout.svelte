<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore, checkAuthStatus, logoutUser } from '../lib/stores/authStore';

	let isAuthenticated = false;
	let user = null;
	let loading = true;

	authStore.subscribe(state => {
		isAuthenticated = state.isAuthenticated;
		user = state.user;
		loading = state.loading;
	});

	onMount(() => {
		checkAuthStatus();
	});

	async function handleSignIn() {
		// Redirect to the backend's Google login endpoint
		window.location.href = `${import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL}/api/auth/login`;
	}

	async function handleSignOut() {
		await logoutUser();
		goto('/'); // Redirect to home after logout
	}
</script>

<div class="app">
	<header>
		<div class="header-content">
			<img src="/promptly-logo.png" alt="Promptly" class="logo" />
			<div class="header-text">
				<h1>Promptly</h1> 
				<p>opensourced Prompt Management System</p>
			</div>
			<div class="auth-controls">
				{#if loading}
					<span>Loading...</span>
				{:else if isAuthenticated}
					<span class="user-name">Hello, {user.name}</span>
					<button on:click={handleSignOut} class="auth-button">Sign Out</button>
				{:else}
					<button on:click={handleSignIn} class="auth-button">Sign In</button>
				{/if}
			</div>
		</div>
	</header>
	
	<main>
		<slot />
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #fafafa;
	}
	
	.app {
		min-height: 100vh;
	}
	
	header {
		background: #ebdf8f;
		color: rgb(9, 9, 9);
		padding: 2px 2px;
	}
	
	.header-content {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0px;
		max-width: 1200px;
		margin: 0 auto;
	}
	
	.logo {
		width: 100px;
		height: 100px;
		object-fit: contain;
	}
	
	.header-text {
		text-align: center;
		flex: 1;
	}
	
	header h1 {
		margin: 0;
		font-size: 2em;
	}
	
	header p {
		margin: 1px 0 0 0;
		opacity: 0.9;
	}
	
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1px;
	}

	.auth-controls {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto; /* Pushes auth controls to the right */
	}

	.auth-button {
		background-color: #4CAF50; /* Green */
		border: none;
		color: white;
		padding: 10px 20px;
		text-align: center;
		text-decoration: none;
		display: inline-block;
		font-size: 16px;
		margin: 4px 2px;
		cursor: pointer;
		border-radius: 8px;
		transition: background-color 0.3s ease;
	}

	.auth-button:hover {
		background-color: #45a049;
	}

	.user-name {
		font-weight: bold;
		margin-right: 10px;
	}
</style>