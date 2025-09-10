<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore, checkAuthStatus, logoutUser } from '../lib/stores/authStore';
	import { activeTab } from '../lib/stores/tabStore';
	import { selectedProfile } from '../lib/stores/profileStore';
	import { api, type Profile } from '../lib/api';

	let isAuthenticated = false;
	let user: any = null;
	let loading = true;
	let currentProfile: Profile | null = null;
	let currentActiveTab = 'profiles';
	let allProfiles: Profile[] = [];
	let selectedProfileId: string | null = null;

	authStore.subscribe(state => {
		isAuthenticated = state.isAuthenticated;
		user = state.user;
		loading = state.loading;
		if (user) {
			console.log('User object:', user);
		}
	});

	selectedProfile.subscribe(value => {
		currentProfile = value;
		selectedProfileId = value ? value.id : null;
	});

	activeTab.subscribe(value => {
		currentActiveTab = value;
	});

	onMount(() => {
		checkAuthStatus();
	});

	// Watch for authentication changes and load profiles
	$: if (isAuthenticated && !loading) {
		loadProfiles();
	}

	async function loadProfiles() {
		try {
			allProfiles = await api.getProfiles();
		} catch (error) {
			console.error('Failed to load profiles:', error);
		}
	}

	function handleProfileChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const profileId = target.value;
		
		if (profileId === 'manage') {
			activeTab.set('profiles');
			selectedProfileId = null;
			return;
		}
		
		const profile = allProfiles.find(p => p.id === profileId) || null;
		selectedProfile.set(profile);
		
		// Switch to the appropriate tab based on profile selection
		if (profile && currentActiveTab === 'profiles') {
			activeTab.set('generate');
		}
	}

	async function handleSignIn() {
		// Redirect to the backend's Google login endpoint
		window.location.href = `${import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL}/api/auth/login`;
	}

	async function handleSignOut() {
		await logoutUser();
		goto('/'); // Redirect to home after logout
	}

	function setActiveTab(tab) {
		activeTab.set(tab);
	}
</script>

<div class="app">
	<header>
		<div class="header-content">

			<a href="/" on:click={() => { if (isAuthenticated) activeTab.set('homepage'); }}>
				<img src="/promptly-logo.png" alt="Promptly" class="logo" />
			</a>
			<div class="header-text">
				{#if isAuthenticated}
					<div class="tab-navigation">
						<div class="profile-dropdown-container">
							<select class="profile-dropdown" bind:value={selectedProfileId} on:change={handleProfileChange}>
								<option value={null} disabled>Select Profile</option>
								<option value="manage">+ Manage Profiles</option>
								{#each allProfiles as profile}
									<option value={profile.id}>{profile.name}</option>
								{/each}
							</select>
						</div>
						<button
							class="tab-button {currentActiveTab === 'personas' ? 'active' : ''}"
							on:click={() => setActiveTab('personas')}
							disabled={!currentProfile}
						>
							Personas
						</button>
						<button
							class="tab-button {currentActiveTab === 'templates' ? 'active' : ''}"
							on:click={() => setActiveTab('templates')}
							disabled={!currentProfile}
						>
							Templates
						</button>
						<button
							class="tab-button {currentActiveTab === 'generate' ? 'active' : ''}"
							on:click={() => setActiveTab('generate')}
							disabled={!currentProfile}
						>
							Prompts
						</button>
					</div>
				{:else}
					<!-- <h1>Promptly</h1>  -->
					<p> Create, Role Play, Version, Export your Prompts Securely <br/> 
					We help you with best practices </p>
				{/if}
			</div>
			<div class="auth-controls">
				{#if loading}
					<span>Loading...</span>
				{:else if isAuthenticated}
					{#if user.picture}
						<img src={user.picture} alt="{user.name}'s profile picture" class="profile-picture" />
					{/if}
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
		padding: 8px 16px;
	}
	
	.header-content {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 12px;
		max-width: 1200px;
		margin: 0 auto;
		min-height: 60px;
	}
	
	.logo {
		width: 100px;
		height: 100px;
		object-fit: cover;
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

	.profile-picture {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		margin-right: 10px;
	}

	.tab-navigation {
		display: flex;
		justify-content: center;
		background: transparent;
		padding: 0;
	}

	.tab-button {
		padding: 8px 16px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 16px;
		color: #333;
		border-bottom: 2px solid transparent;
		transition: all 0.3s ease;
	}

	.tab-button.active {
		color: #007bff;
		border-bottom: 2px solid #007bff;
		font-weight: bold;
	}

	.tab-button:disabled {
		color: #ccc;
		cursor: not-allowed;
	}

	.profile-dropdown-container {
		display: flex;
		align-items: center;
	}

	.profile-dropdown {
		padding: 8px 16px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 16px;
		color: #333;
		border-bottom: 2px solid transparent;
		transition: all 0.3s ease;
		appearance: none;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
		background-repeat: no-repeat;
		background-position: right 4px center;
		background-size: 16px;
		padding-right: 24px;
	}

	.profile-dropdown:focus {
		outline: none;
		color: #007bff;
		border-bottom: 2px solid #007bff;
	}

	.profile-dropdown option {
		background: white;
		color: #333;
		padding: 8px;
	}

	.profile-dropdown option[value="manage"] {
		border-top: 1px solid #eee;
		color: #007bff;
		font-weight: bold;
	}
</style>