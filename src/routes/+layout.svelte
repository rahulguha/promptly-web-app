<script lang="ts">
	import '../app.css';
	import { onMount, setContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore, checkAuthStatus, logoutUser } from '$lib/stores/authStore';
	import { writable } from 'svelte/store';
	import { selectedProfile } from '$lib/stores/profileStore';
	import { api, type Profile } from '$lib/api';

	let isAuthenticated = false;
	let user: any = null;
	let loading = true;
	let currentProfile: Profile | null = null;
	let allProfiles: Profile[] = [];
	let selectedProfileId: string | null = null;
	let mobileMenuOpen = false;

	// Create a local writable store for the active tab
	const activeTabContext = writable('library');

	// Set context so child components can access it
	setContext('activeTab', activeTabContext);

	let currentActiveTab = 'library';

	// Subscribe to our context store
	activeTabContext.subscribe(value => {
		currentActiveTab = value;
	});

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

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

	onMount(() => {
		authStore.init();
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
			activeTabContext.set('profiles');
			selectedProfileId = null;
			return;
		}

		const profile = allProfiles.find(p => p.id === profileId) || null;
		selectedProfile.set(profile);

		// Switch to the appropriate tab based on profile selection
		if (profile && currentActiveTab === 'profiles') {
			activeTabContext.set('library');
		}
	}

	async function handleSignIn() {
		authStore.login();
	}

	async function handleSignOut() {
		authStore.logout();
		goto('/'); // Redirect to home after logout
	}

	function setActiveTab(tab) {
		activeTabContext.set(tab);
		mobileMenuOpen = false; // Close menu when tab is selected
	}
</script>

<div class="app">
	<header>
		<div class="header-content">
			<!-- Logo -->
			<a href="/" on:click={() => { if (isAuthenticated) activeTab.set('homepage'); }} class="logo-link">
				<img src="/promptly-logo.png" alt="Promptly" class="logo" />
			</a>

			<!-- Mobile Menu Toggle -->
			{#if isAuthenticated}
				<button
					class="mobile-menu-toggle mobile-only"
					on:click={toggleMobileMenu}
					aria-label="Toggle navigation menu"
					aria-expanded={mobileMenuOpen}
				>
					<span class="hamburger-line" class:open={mobileMenuOpen}></span>
					<span class="hamburger-line" class:open={mobileMenuOpen}></span>
					<span class="hamburger-line" class:open={mobileMenuOpen}></span>
				</button>
			{/if}

			<!-- Header Text (Desktop) / Mobile Menu Overlay -->
			<div class="header-text" class:menu-open={mobileMenuOpen}>
				{#if isAuthenticated}
					<!-- Mobile Menu Overlay -->
					{#if mobileMenuOpen}
						<div class="mobile-menu-overlay" on:click={closeMobileMenu}></div>
					{/if}

					<!-- Navigation -->
					<nav class="main-navigation" class:mobile-open={mobileMenuOpen}>
						<!-- Profile Dropdown -->
						<div class="profile-dropdown-container">
							<div class="profile-section-header mobile-only">
								<h3>Select Profile</h3>
								<p class="profile-help-text">Choose a profile to manage personas, templates, and prompts</p>
							</div>

							<label for="profile-select" class="sr-only">Select Profile</label>
							<select
								id="profile-select"
								class="profile-dropdown"
								bind:value={selectedProfileId}
								on:change={handleProfileChange}
							>
								<option value={null} disabled>
									{#if allProfiles.length === 0}
										No profiles available
									{:else}
										Select Profile ({allProfiles.length} available)
									{/if}
								</option>
								<option value="manage" class="manage-option">
									✨ Manage Profiles
								</option>
								{#each allProfiles as profile}
									<option value={profile.id} class="profile-option">
										{profile.name}
										{#if profile.description}
											• {profile.description.slice(0, 30)}{profile.description.length > 30 ? '...' : ''}
										{/if}
									</option>
								{/each}
							</select>

							<!-- Current Profile Display (Mobile) -->
							{#if currentProfile}
								<div class="current-profile-display mobile-only">
									<div class="current-profile-info">
										<div class="current-profile-name">📋 {currentProfile.name}</div>
										{#if currentProfile.description}
											<div class="current-profile-description">{currentProfile.description}</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>

						<!-- Tab Navigation -->
						<div class="tab-navigation">
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
								class="tab-button {currentActiveTab === 'generator' ? 'active' : ''}"
								on:click={() => setActiveTab('generator')}
								disabled={!currentProfile}
							>
								Generator
							</button>
							<button
								class="tab-button {currentActiveTab === 'library' ? 'active' : ''}"
								on:click={() => setActiveTab('library')}
								disabled={!currentProfile}
							>
								Library
							</button>
							<a
								href="/prompt-execution"
								class="tab-button tab-link"
							>
								Chat
							</a>
						</div>
					</nav>
				{:else}
					<div class="welcome-text">
						<p class="desktop-only"> Create, Role Play, Version, Export your Prompts Securely <br/>
						We help you with best practices </p>
						<p class="mobile-only">Create & manage prompts securely</p>
					</div>
				{/if}
			</div>

			<!-- Auth Controls -->
			<div class="auth-controls">
				{#if loading}
					<span class="loading-text">Loading...</span>
				{:else if isAuthenticated}
					<div class="user-info">
						{#if user.picture}
							<img src={user.picture} alt="{user.name}'s profile picture" class="profile-picture" />
						{/if}
						<span class="user-name desktop-only">Hello, {user.name}</span>
					</div>
					<button on:click={handleSignOut} class="auth-button btn btn-success">
						<span class="desktop-only">Sign Out</span>
						<span class="mobile-only">Out</span>
					</button>
				{:else}
					<button on:click={handleSignIn} class="auth-button btn btn-success">Sign In</button>
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
	
	/* Header Styles */
	header {
		background: var(--color-secondary);
		color: var(--color-text);
		padding: var(--space-sm) var(--space-md);
		position: sticky;
		top: 0;
		z-index: 1000;
		box-shadow: 0 2px 4px var(--color-shadow);
	}

	.header-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		max-width: var(--container-wide);
		margin: 0 auto;
		min-height: 60px;
		position: relative;
	}

	/* Logo */
	.logo-link {
		display: flex;
		align-items: center;
		text-decoration: none;
		flex-shrink: 0;
	}

	.logo {
		width: 60px;
		height: 60px;
		object-fit: cover;
		border-radius: 8px;
	}

	/* Mobile Menu Toggle */
	.mobile-menu-toggle {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		width: var(--touch-target);
		height: var(--touch-target);
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--space-sm);
		border-radius: 4px;
		transition: background-color 0.3s ease;
		position: relative;
		z-index: 1001;
	}

	.mobile-menu-toggle:hover {
		background-color: rgba(0, 0, 0, 0.1);
	}

	.hamburger-line {
		width: 20px;
		height: 2px;
		background-color: var(--color-text);
		margin: 2px 0;
		transition: 0.3s;
		border-radius: 1px;
	}

	.hamburger-line.open:nth-child(1) {
		transform: rotate(-45deg) translate(-4px, 4px);
	}

	.hamburger-line.open:nth-child(2) {
		opacity: 0;
	}

	.hamburger-line.open:nth-child(3) {
		transform: rotate(45deg) translate(-4px, -4px);
	}

	@media (min-width: 768px) {
		.mobile-menu-toggle {
			display: none;
		}
	}

	/* Header Text / Navigation Container */
	.header-text {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		position: relative;
	}

	.welcome-text {
		text-align: center;
	}

	.welcome-text p {
		margin: 0;
		opacity: 0.9;
		font-size: var(--font-sm);
		line-height: 1.4;
	}

	/* Mobile Menu Overlay */
	.mobile-menu-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 999;
		display: block;
	}

	/* Main Navigation */
	.main-navigation {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: var(--color-surface);
		z-index: 1000;
		padding: 80px var(--space-md) var(--space-md);
		overflow-y: auto;
	}

	.main-navigation.mobile-open {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	/* Tablet+ Navigation */
	@media (min-width: 768px) {
		.main-navigation {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: var(--space-lg);
			position: static;
			background: none;
			padding: 0;
			overflow: visible;
		}

		.mobile-menu-overlay {
			display: none;
		}

		.logo {
			width: 80px;
			height: 80px;
		}
	}

	@media (min-width: 1024px) {
		.logo {
			width: 100px;
			height: 100px;
		}
	}

	/* Profile Dropdown */
	.profile-dropdown-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	@media (min-width: 768px) {
		.profile-dropdown-container {
			flex-direction: row;
			align-items: center;
		}
	}

	.profile-dropdown {
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background-color: var(--color-surface);
		cursor: pointer;
		font-size: var(--font-md);
		color: var(--color-text);
		transition: all 0.3s ease;
		appearance: none;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
		background-repeat: no-repeat;
		background-position: right var(--space-sm) center;
		background-size: 16px;
		padding-right: calc(var(--space-md) + 24px);
		min-height: var(--touch-target);
		width: 100%;
	}

	@media (min-width: 768px) {
		.profile-dropdown {
			border: none;
			background-color: transparent;
			border-bottom: 2px solid transparent;
			border-radius: 0;
			width: auto;
			min-width: 108px;
			max-width: 180px;
		}
	}

	.profile-dropdown:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.1);
	}

	@media (min-width: 768px) {
		.profile-dropdown:focus {
			border-bottom-color: var(--color-primary);
			box-shadow: none;
		}
	}

	.profile-dropdown option {
		background: var(--color-surface);
		color: var(--color-text);
		padding: var(--space-sm);
	}

	.profile-dropdown option[value="manage"] {
		border-top: 1px solid var(--color-border);
		color: var(--color-primary);
		font-weight: bold;
	}

	/* Auth Controls */
	.auth-controls {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.user-name {
		font-weight: 500;
		font-size: var(--font-sm);
		color: var(--color-text-muted);
	}

	.profile-picture {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 2px solid var(--color-border);
		transition: border-color 0.3s ease;
	}

	.profile-picture:hover {
		border-color: var(--color-primary);
	}

	@media (min-width: 768px) {
		.profile-picture {
			width: 40px;
			height: 40px;
		}
	}

	.loading-text {
		font-size: var(--font-sm);
		color: var(--color-text-muted);
	}

	/* Main Content */
	main {
		padding: var(--space-md);
	}

	@media (min-width: 768px) {
		main {
			padding: var(--space-lg);
		}
	}

	@media (min-width: 1024px) {
		main {
			max-width: var(--container-wide);
			margin: 0 auto;
			padding: var(--space-xl);
		}
	}
</style>