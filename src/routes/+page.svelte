<script lang="ts">
	import PersonaManager from '$lib/PersonaManager.svelte';
	import TemplateManager from '$lib/TemplateManager.svelte';
	import PromptGenerator from '$lib/PromptGenerator.svelte';
	import { selectedProfile } from '$lib/stores/profileStore';
	import { authStore } from '$lib/stores/authStore';
	import { api, type Profile } from '$lib/api';
	import { onMount } from 'svelte';

	let activeTab = 'profiles';
	let currentProfile: Profile | null = null;
	let allProfiles: Profile[] = [];
	let selectedProfileId: string | null = null;
	let isAuthenticated = false;
	let loading = true;

	authStore.subscribe(state => {
		isAuthenticated = state.isAuthenticated;
		loading = state.loading;
		
		// Clear all state when user logs out
		if (!state.isAuthenticated && !loading) {
			selectedProfile.set(null);
			currentProfile = null;
			allProfiles = [];
			selectedProfileId = null;
			activeTab = 'profiles';
		}
	});

	selectedProfile.subscribe(value => {
		currentProfile = value;
		selectedProfileId = value ? value.id : null;
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

	function setActiveTab(tab: string) {
		activeTab = tab;
	}
</script>

{#if loading}
	<div class="loading">
		<h2>Loading...</h2>
	</div>
{:else if !isAuthenticated}
	<!-- Homepage for signed-out users -->
	<div class="homepage">
		<div class="hero">
			<h1>Welcome to Promptly</h1>
			<p class="subtitle">Your intelligent prompt management system</p>
			<p class="description">
				Create, manage, and test AI prompts with profile-based personalization. 
				Build reusable templates, manage user personas, and test your prompts 
				directly with ChatGPT and Claude.
			</p>
		</div>
		
		<div class="features">
			<div class="feature">
				<h3>🎭 Profile Management</h3>
				<p>Create detailed user profiles with demographics, education, interests, and preferences to personalize your prompts.</p>
			</div>
			<div class="feature">
				<h3>🎯 Smart Personas</h3>
				<p>Define user and LLM role pairs to create contextual prompts for specific scenarios and use cases.</p>
			</div>
			<div class="feature">
				<h3>📝 Template System</h3>
				<p>Build reusable prompt templates with variables, versioning, and easy management for consistent results.</p>
			</div>
			<div class="feature">
				<h3>🚀 Direct Testing</h3>
				<p>Test your prompts instantly with ChatGPT and Claude. One-click copying and browser opening for seamless workflow.</p>
			</div>
		</div>
		
		<div class="cta">
			<p>Ready to streamline your AI workflow?</p>
		</div>
	</div>
{:else}
	<!-- Main app for authenticated users -->
	<div class="prompt-management">
	<div class="profile-selector-header">
		<label for="profile-selector">Selected Profile:</label>
		<select id="profile-selector" bind:value={selectedProfileId} on:change={handleProfileChange}>
			<option value={null} disabled>Select a profile</option>
			{#each allProfiles as profile}
				<option value={profile.id}>{profile.name}</option>
			{/each}
		</select>
	</div>

	<div class="tab-navigation">
		<button
			class="tab-button {activeTab === 'profiles' ? 'active' : ''}"
			on:click={() => setActiveTab('profiles')}
		>
			Profiles
		</button>
		<button
			class="tab-button {activeTab === 'personas' ? 'active' : ''}"
			on:click={() => setActiveTab('personas')}
			disabled={!currentProfile}
		>
			Personas
		</button>
		<button
			class="tab-button {activeTab === 'templates' ? 'active' : ''}"
			on:click={() => setActiveTab('templates')}
			disabled={!currentProfile}
		>
			Templates
		</button>
		<button
			class="tab-button {activeTab === 'generate' ? 'active' : ''}"
			on:click={() => setActiveTab('generate')}
			disabled={!currentProfile}
		>
			Generate Prompts
		</button>
	</div>

	<div class="tab-content">
		{#if activeTab === 'profiles'}
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
			<TemplateManager />
		{:else if activeTab === 'generate'}
			<PromptGenerator />
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

	/* Homepage Styles */
	.loading {
		text-align: center;
		padding: 60px 20px;
		color: #666;
	}

	.homepage {
		max-width: 1000px;
		margin: 0 auto;
		padding: 40px 20px;
	}

	.hero {
		text-align: center;
		margin-bottom: 60px;
	}

	.hero h1 {
		font-size: 3em;
		margin-bottom: 20px;
		color: #2c3e50;
		font-weight: 700;
	}

	.subtitle {
		font-size: 1.3em;
		color: #7f8c8d;
		margin-bottom: 30px;
		font-weight: 500;
	}

	.description {
		font-size: 1.1em;
		color: #555;
		line-height: 1.6;
		max-width: 600px;
		margin: 0 auto;
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 30px;
		margin-bottom: 60px;
	}

	.feature {
		background: white;
		padding: 30px;
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		text-align: center;
		border: 1px solid #f0f0f0;
	}

	.feature h3 {
		font-size: 1.2em;
		margin-bottom: 15px;
		color: #2c3e50;
	}

	.feature p {
		color: #666;
		line-height: 1.5;
	}

	.cta {
		text-align: center;
		padding: 40px;
		background: linear-gradient(135deg, #ebdf8f 0%, #f4e79a 100%);
		border-radius: 12px;
		margin-top: 40px;
	}

	.cta p {
		font-size: 1.2em;
		color: #2c3e50;
		font-weight: 500;
		margin: 0;
	}
</style>