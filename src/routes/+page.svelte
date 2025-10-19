<script lang="ts">
	import Homepage from '$lib/Homepage.svelte';
	import PersonaManager from '$lib/PersonaManager.svelte';
	import TemplateManager from '$lib/TemplateManager.svelte';
	import PromptLibrary from '$lib/PromptLibrary.svelte';
	import { selectedProfile } from '$lib/stores/profileStore';
	import { authStore } from '$lib/stores/authStore';
	import { api, type Profile } from '$lib/api';
	import { onMount, getContext, tick } from 'svelte';
	import type { Writable } from 'svelte/store';

	// Get the activeTab context from the layout
	const activeTabStore = getContext<Writable<string>>('activeTab');

	let currentProfile: Profile | null = null;
	let allProfiles: Profile[] = [];
	let isAuthenticated = false;
	let loading = true;
	let activeTab = 'library';
	let tabVersion = 0; // Force reactivity counter

	// Subscribe to the context store and force component update with tick()
	activeTabStore.subscribe(async value => {
		activeTab = value;
		tabVersion = tabVersion + 1;
		await tick(); // Force Svelte to process updates
	});

	// Subscribe to auth store
	authStore.subscribe(async state => {
		const wasAuthenticated = isAuthenticated;
		isAuthenticated = state.isAuthenticated;
		loading = state.loading;

		// On login, try to restore previous profile or select first
		if (isAuthenticated && !wasAuthenticated) {
			try {
				allProfiles = await api.getProfiles();

				if (allProfiles.length > 0) {
					// Try to restore previously selected profile from localStorage
					const storedProfileId = selectedProfile.getStoredProfileId();

					let profileToSelect = null;

					if (storedProfileId) {
						// Try to find the stored profile
						profileToSelect = allProfiles.find(p => p.id === storedProfileId);
					}

					// Fallback to first profile if stored profile not found
					if (!profileToSelect) {
						profileToSelect = allProfiles[0];
					}

					selectedProfile.set(profileToSelect);
					activeTabStore.set('library');
				} else {
					// No profiles exist, go to profiles tab to create one
					activeTabStore.set('profiles');
				}
			} catch (error) {
				console.error('Failed to load profiles on login:', error);
				activeTabStore.set('profiles');
			}
		}

		// Clear all state when user logs out (but keep localStorage for next login)
		if (!state.isAuthenticated && !loading) {
			selectedProfile.clear();
			currentProfile = null;
			allProfiles = [];
			activeTabStore.set('library');
		}
	});

	// Subscribe to selected profile
	selectedProfile.subscribe(value => {
		currentProfile = value;
	});

	onMount(async () => {
		if (isAuthenticated) {
			try {
				allProfiles = await api.getProfiles();

				// Try to restore profile from localStorage if not already set
				if (!currentProfile && allProfiles.length > 0) {
					const storedProfileId = selectedProfile.getStoredProfileId();

					let profileToSelect = null;

					if (storedProfileId) {
						profileToSelect = allProfiles.find(p => p.id === storedProfileId);
					}

					// Fallback to first profile
					if (!profileToSelect) {
						profileToSelect = allProfiles[0];
					}

					selectedProfile.set(profileToSelect);
				}
			} catch (error) {
				console.error('Failed to load profiles:', error);
			}
		}
	});
</script>

{#if loading}
	<div class="loading-container">
		<div class="loading-spinner"></div>
		<h2 class="loading-text">Loading your workspace...</h2>
		<p class="loading-subtitle">Please wait while we set up your prompt management environment</p>
	</div>
{:else if !isAuthenticated}
	<div class="homepage-container">
		<Homepage />
	</div>
{:else}
	<!-- Main app for authenticated users -->
	<div class="app-container">
		<div class="tab-content">
			{#key tabVersion}
			{#if activeTab === 'homepage'}
				<div class="content-section">
					<Homepage />
				</div>
			{:else if activeTab === 'profiles'}
				<div class="content-section">
					<div class="section-header">
						<h1 class="section-title">Profile Management</h1>
						<p class="section-description">Create and manage user profiles with different attributes and preferences</p>
					</div>
					{#await import('$lib/ProfileManager.svelte') then { default: ProfileManager }}
						<ProfileManager />
					{:catch error}
						<div class="error-container">
							<div class="error-icon">⚠️</div>
							<h3>Unable to load Profile Manager</h3>
							<p class="error-message">{error.message}</p>
							<button class="btn btn-primary" on:click={() => window.location.reload()}>Refresh Page</button>
						</div>
					{/await}
				</div>
			{:else if activeTab === 'personas'}
				<div class="content-section">
					{#if currentProfile}
						<PersonaManager />
					{:else}
						<div class="empty-state">
							<div class="empty-state-icon">👤</div>
							<h3>No Profile Selected</h3>
							<p>Please select a profile from the dropdown above to manage personas.</p>
							<p class="empty-state-hint">Personas define the roles and context for your prompt conversations.</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'templates'}
				<div class="content-section">
					{#if currentProfile}
						<TemplateManager />
					{:else}
						<div class="empty-state">
							<div class="empty-state-icon">📝</div>
							<h3>No Profile Selected</h3>
							<p>Please select a profile from the dropdown above to manage templates.</p>
							<p class="empty-state-hint">Templates help you create consistent, reusable prompt structures.</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'generator'}
				<div class="content-section">
					{#if currentProfile}
						{#await import('$lib/PromptGenerator.svelte') then { default: PromptGenerator }}
							<PromptGenerator />
						{:catch error}
							<div class="error-container">
								<div class="error-icon">⚠️</div>
								<h3>Unable to load Prompt Generator</h3>
								<p class="error-message">{error.message}</p>
								<button class="btn btn-primary" on:click={() => window.location.reload()}>Refresh Page</button>
							</div>
						{/await}
					{:else}
						<div class="empty-state">
							<div class="empty-state-icon">✨</div>
							<h3>No Profile Selected</h3>
							<p>Please select a profile from the dropdown above to generate prompts.</p>
							<p class="empty-state-hint">Use the generator to create new prompts from your templates.</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'library'}
				<div class="content-section">
					{#if currentProfile}
						<PromptLibrary />
					{:else}
						<div class="empty-state">
							<div class="empty-state-icon">📚</div>
							<h3>No Profile Selected</h3>
							<p>Please select a profile from the dropdown above to view your prompt library.</p>
							<p class="empty-state-hint">Start by selecting a profile to access your saved prompts.</p>
						</div>
					{/if}
				</div>
			{/if}
			{/key}
		</div>
	</div>
{/if}

<style>
	/* App Container */
	.app-container {
		min-height: calc(100vh - 120px);
		display: flex;
		flex-direction: column;
	}

	.tab-content {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.content-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		padding: var(--space-md);
		background: var(--color-surface);
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		margin-bottom: var(--space-md);
	}

	@media (min-width: 768px) {
		.content-section {
			padding: var(--space-xl);
			margin-bottom: var(--space-lg);
			border-radius: 16px;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		}
	}

	/* Section Headers */
	.section-header {
		margin-bottom: var(--space-lg);
		padding-bottom: var(--space-md);
		border-bottom: 2px solid var(--color-border);
	}

	.section-title {
		margin: 0 0 var(--space-sm) 0;
		font-size: var(--font-2xl);
		color: var(--color-text);
		font-weight: 700;
		line-height: 1.2;
	}

	@media (min-width: 768px) {
		.section-title {
			font-size: var(--font-3xl);
		}
	}

	.section-description {
		margin: 0;
		font-size: var(--font-md);
		color: var(--color-text-muted);
		line-height: 1.5;
		max-width: 600px;
	}

	@media (min-width: 768px) {
		.section-description {
			font-size: var(--font-lg);
		}
	}

	/* Loading States */
	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		padding: var(--space-2xl) var(--space-md);
		text-align: center;
		gap: var(--space-lg);
	}

	.loading-spinner {
		width: 48px;
		height: 48px;
		border: 4px solid var(--color-border);
		border-top: 4px solid var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.loading-text {
		margin: 0;
		font-size: var(--font-xl);
		color: var(--color-text);
		font-weight: 600;
	}

	.loading-subtitle {
		margin: 0;
		font-size: var(--font-md);
		color: var(--color-text-muted);
		max-width: 400px;
		line-height: 1.5;
	}

	/* Empty States */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl) var(--space-md);
		text-align: center;
		gap: var(--space-md);
		min-height: 300px;
		background-color: var(--color-background);
		border: 2px dashed var(--color-border);
		border-radius: 12px;
	}

	.empty-state-icon {
		font-size: 3rem;
		margin-bottom: var(--space-sm);
		opacity: 0.6;
	}

	.empty-state h3 {
		margin: 0 0 var(--space-sm) 0;
		font-size: var(--font-xl);
		color: var(--color-text);
		font-weight: 600;
	}

	.empty-state p {
		margin: 0;
		font-size: var(--font-md);
		color: var(--color-text-muted);
		line-height: 1.5;
		max-width: 400px;
	}

	.empty-state-hint {
		font-size: var(--font-sm) !important;
		color: var(--color-text-light) !important;
		font-style: italic;
		margin-top: var(--space-sm) !important;
	}

	/* Error States */
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl) var(--space-md);
		text-align: center;
		gap: var(--space-lg);
		min-height: 300px;
		background-color: #fef2f2;
		border: 2px solid #fecaca;
		border-radius: 12px;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: var(--space-sm);
	}

	.error-container h3 {
		margin: 0 0 var(--space-sm) 0;
		font-size: var(--font-xl);
		color: #dc2626;
		font-weight: 600;
	}

	.error-message {
		margin: 0 0 var(--space-lg) 0;
		font-size: var(--font-md);
		color: #7f1d1d;
		line-height: 1.5;
		max-width: 400px;
		padding: var(--space-sm) var(--space-md);
		background-color: #fee2e2;
		border-radius: 6px;
		font-family: monospace;
	}

	/* Homepage Container */
	.homepage-container {
		min-height: calc(100vh - 120px);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: var(--space-lg) var(--space-md);
	}

	/* Responsive Adjustments */
	@media (max-width: 767px) {
		.app-container {
			min-height: calc(100vh - 100px);
		}

		.section-title {
			text-align: center;
		}

		.section-description {
			text-align: center;
		}

		.empty-state,
		.error-container,
		.loading-container {
			min-height: 250px;
			padding: var(--space-xl) var(--space-md);
		}
	}

	/* Animation for content transitions */
	.content-section {
		animation: fadeIn 0.3s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>