<script lang="ts">
	import Homepage from '$lib/Homepage.svelte';
	import PersonaManager from '$lib/PersonaManager.svelte';
	import TemplateManager from '$lib/TemplateManager.svelte';
	import PromptGenerator from '$lib/PromptGenerator.svelte';
	import { selectedProfile } from '$lib/stores/profileStore';
	import { authStore } from '$lib/stores/authStore';
	import { activeTab as activeTabStore } from '$lib/stores/tabStore';
	import { api, type Profile } from '$lib/api';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let activeTab: string;
	activeTabStore.subscribe(value => {
		activeTab = value;
	});

	let currentProfile: Profile | null = null;
	let allProfiles: Profile[] = [];
	let selectedProfileId: string | null = null;
	let isAuthenticated = false;
	let loading = true;

	authStore.subscribe(state => {
		const wasAuthenticated = isAuthenticated;
		isAuthenticated = state.isAuthenticated;
		loading = state.loading;

		// On login, stay on profiles tab until user selects a profile
		if (isAuthenticated && !wasAuthenticated) {
			activeTabStore.set('profiles');
		}
		
		// Clear all state when user logs out
		if (!state.isAuthenticated && !loading) {
			selectedProfile.set(null);
			currentProfile = null;
			allProfiles = [];
			selectedProfileId = null;
			activeTabStore.set('profiles');
		}
	});

	selectedProfile.subscribe(value => {
		const previousProfile = currentProfile;
		currentProfile = value;
		selectedProfileId = value ? value.id : null;
		
		// When a profile is selected for the first time, switch to prompts tab
		if (value && !previousProfile && isAuthenticated) {
			activeTabStore.set('generate');
		}
	});

	onMount(async () => {
		if (isAuthenticated) {
			try {
				allProfiles = await api.getProfiles();
			} catch (error) {
				console.error('Failed to load profiles:', error);
			}
		}
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
		const profile = allProfiles.find(p => p.id === profileId) || null;
		selectedProfile.set(profile);
	}
</script>

{#if loading}
	<div class="loading">
		<h2>Loading...</h2>
	</div>
{:else if !isAuthenticated}
	<Homepage />
{:else}
	<!-- Main app for authenticated users -->
	<div class="prompt-management">

		<div class="tab-content">
			{#if activeTab === 'homepage'}
				<Homepage />
			{:else if activeTab === 'profiles'}
				{#await import('$lib/ProfileManager.svelte') then { default: ProfileManager }}
					<ProfileManager />
				{:catch error}
					<p>Error loading Profile Manager: {error.message}</p>
				{/await}
			{:else if activeTab === 'personas'}
				{#if currentProfile}
					<PersonaManager />
				{:else}
					<p>Please select a profile to manage personas.</p>
				{/if}
			{:else if activeTab === 'templates'}
				{#if currentProfile}
					<TemplateManager />
				{:else}
					<p>Please select a profile to manage templates.</p>
				{/if}
			{:else if activeTab === 'generate'}
				{#if currentProfile}
					<PromptGenerator />
				{:else}
					<p>Please select a profile to view and manage prompts.</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.prompt-management {
		background: white;
		border-radius: 8px;
		padding: 20px;
		box-shadow: 0 2px 4px rgba(0,0,0,0.1);
	}

	.tab-content {
		margin-top: 20px;
	}

	.profile-selector-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 20px;
		padding: 10px;
		background-color: #f0f0f0;
		border-radius: 8px;
	}

	.profile-selector-header label {
		font-weight: bold;
	}

	.profile-selector-header select {
		padding: 8px;
		border-radius: 4px;
		border: 1px solid #ccc;
		min-width: 200px;
	}

	.loading {
		text-align: center;
		padding: 60px 20px;
		color: #666;
	}

</style>