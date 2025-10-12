<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api, type Prompt } from '$lib/api';
	import { activityTracker, ACTIVITY_TYPES } from '$lib/activityTracker';
	import { authStore } from '$lib/stores/authStore';
	import { selectedProfile } from '$lib/stores/profileStore';
	import type { Profile } from '$lib/api';
	import '$lib/styles/prompt-components.css';

	let promptId: string | null = null;
	let prompt: Prompt | null = null;
	let allPrompts: Prompt[] = [];
	let loading = true;
	let loadingPrompts = false;
	let error: string | null = null;
	let currentUser: any = null;
	let currentProfile: Profile | null = null;
	let executingLLM: string | null = null;
	let copiedToClipboard = false;

	// Subscribe to auth state
	authStore.subscribe(state => {
		currentUser = state.user;
	});

	// Subscribe to profile changes
	selectedProfile.subscribe(async (profile) => {
		currentProfile = profile;
		if (profile) {
			await loadPrompts();
		} else {
			allPrompts = [];
		}
	});

	onMount(async () => {
		// Check if there's a prompt ID from URL query parameter
		promptId = $page.url.searchParams.get('id');

		if (promptId) {
			// Load specific prompt
			try {
				prompt = await api.getPrompt(promptId);
				loading = false;
			} catch (err) {
				console.error('Failed to load prompt:', err);
				error = 'Failed to load prompt. Please try again.';
				loading = false;
			}
		} else {
			// Load all prompts for selection
			loading = false;
			if (currentProfile) {
				await loadPrompts();
			}
		}
	});

	async function loadPrompts() {
		if (!currentProfile) return;

		loadingPrompts = true;
		try {
			allPrompts = await api.getPrompts(currentProfile.id);
		} catch (err) {
			console.error('Failed to load prompts:', err);
			error = 'Failed to load prompts from library.';
		} finally {
			loadingPrompts = false;
		}
	}

	function selectPrompt(selectedPrompt: Prompt) {
		prompt = selectedPrompt;
		promptId = selectedPrompt.id;
		error = null;
	}

	function clearSelection() {
		prompt = null;
		promptId = null;
	}

	async function executeLLM(llm: 'chatgpt' | 'claude' | 'gemini' | 'perplexity') {
		if (!prompt) return;

		executingLLM = llm;
		let clipboardSuccess = false;
		let windowSuccess = false;

		try {
			// Try to copy prompt to clipboard first
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					await navigator.clipboard.writeText(prompt.content);
					clipboardSuccess = true;
					copiedToClipboard = true;
					setTimeout(() => {
						copiedToClipboard = false;
					}, 2000);
				} else {
					throw new Error('Modern clipboard API not available');
				}
			} catch (clipboardError) {
				try {
					// Fallback for older browsers or permission issues
					const textArea = document.createElement('textarea');
					textArea.value = prompt.content;
					textArea.style.position = 'fixed';
					textArea.style.left = '-999999px';
					textArea.style.top = '-999999px';
					document.body.appendChild(textArea);
					textArea.focus();
					textArea.select();
					const success = document.execCommand('copy');
					document.body.removeChild(textArea);
					if (success) {
						clipboardSuccess = true;
						copiedToClipboard = true;
						setTimeout(() => {
							copiedToClipboard = false;
						}, 2000);
					} else {
						throw new Error('Fallback copy command failed');
					}
				} catch (fallbackError) {
					// Continue anyway to try opening the window
				}
			}

			// Open the respective LLM website in a new tab
			try {
				const llmUrls = {
					chatgpt: 'https://chat.openai.com',
					claude: 'https://claude.ai',
					gemini: 'https://gemini.google.com',
					perplexity: 'https://www.perplexity.ai'
				};

				const url = llmUrls[llm];
				if (url) {
					const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
					if (newWindow) {
						windowSuccess = true;
					} else {
						throw new Error('Window.open returned null - likely blocked by popup blocker');
					}
				} else {
					throw new Error(`Invalid LLM: ${llm}`);
				}
			} catch (windowError) {
				console.error('Failed to open window:', windowError);
			}

			setTimeout(() => {
				executingLLM = null;
			}, 2000);

			// Track the LLM execution activity
			if ((clipboardSuccess || windowSuccess) && currentUser) {
				try {
					const activityType = llm === 'chatgpt' ? ACTIVITY_TYPES.PROMPT_EXECUTED_CHATGPT :
						llm === 'claude' ? ACTIVITY_TYPES.PROMPT_EXECUTED_CLAUDE :
						llm === 'gemini' ? ACTIVITY_TYPES.PROMPT_EXECUTED_GEMINI :
						ACTIVITY_TYPES.PROMPT_EXECUTED_PERPLEXITY;

					await activityTracker.trackActivity(
						currentUser.user_id,
						activityType,
						`Executed prompt "${prompt.name}" with ${llm}`,
						{
							prompt_id: prompt.id,
							prompt_name: prompt.name,
							llm: llm,
							clipboard_success: clipboardSuccess,
							window_success: windowSuccess
						}
					);
				} catch (activityError) {
					console.error('Failed to track activity:', activityError);
				}
			}

			// Show alert if window opening failed
			if (!windowSuccess) {
				const llmName = llm.charAt(0).toUpperCase() + llm.slice(1);
				const message = clipboardSuccess
					? `Prompt copied to clipboard! Could not auto-open ${llmName} - please check popup blocker settings and manually open ${llmName}.`
					: `Could not copy to clipboard or open ${llmName}. Please check browser permissions and popup blocker settings.`;
				alert(message);
			}

		} catch (error) {
			console.error('Unexpected error in executeLLM:', error);
			executingLLM = null;
			alert(`Unexpected error: ${error.message}`);
		}
	}

	function copyToClipboard() {
		if (!prompt) return;

		navigator.clipboard.writeText(prompt.content).then(() => {
			copiedToClipboard = true;
			setTimeout(() => {
				copiedToClipboard = false;
			}, 2000);
		}).catch(err => {
			console.error('Failed to copy: ', err);
			alert('Failed to copy to clipboard');
		});
	}

	function goToLibrary() {
		goto('/?tab=library');
	}
</script>

<div class="execution-container">
	<div class="execution-header">
		<h1 class="page-title">💬 Chat</h1>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading...</p>
		</div>
	{:else if !currentProfile}
		<div class="empty-state">
			<div class="empty-icon">👤</div>
			<h3>No Profile Selected</h3>
			<p>Please select a profile to access your prompts for chat execution.</p>
		</div>
	{:else if !prompt}
		<!-- Prompt Selection View -->
		<div class="selection-container">
			<div class="selection-header">
				<h2>Select a Prompt to Execute</h2>
				<p class="selection-description">Choose a prompt from your library to chat with AI assistants</p>
			</div>

			{#if loadingPrompts}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading prompts...</p>
				</div>
			{:else if allPrompts.length === 0}
				<div class="empty-state">
					<div class="empty-icon">📝</div>
					<h3>No Prompts Available</h3>
					<p>You haven't created any prompts yet. Create your first prompt in the library!</p>
					<button class="btn btn-primary" on:click={goToLibrary}>
						<span class="icon">✨</span>
						Go to Library
					</button>
				</div>
			{:else}
				<div class="prompts-list">
					{#each allPrompts as p (p.id)}
						<button class="prompt-item" on:click={() => selectPrompt(p)}>
							<div class="prompt-item-header">
								<h3 class="prompt-item-name">{p.name}</h3>
								<span class="prompt-item-arrow">→</span>
							</div>
							{#if p.template_name}
								<p class="prompt-item-template">Template: {p.template_name}</p>
							{/if}
							<div class="prompt-item-preview">
								{p.content.slice(0, 150)}{p.content.length > 150 ? '...' : ''}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Prompt Execution View -->
		<div class="execution-content">
			<div class="prompt-actions-bar">
				<button class="btn btn-secondary" on:click={clearSelection}>
					← Back to Prompts
				</button>
			</div>

			<div class="prompt-info">
				<h2>{prompt.name}</h2>
				{#if prompt.template_name}
					<p class="template-name">Template: {prompt.template_name}</p>
				{/if}
			</div>

			<div class="prompt-display">
				<div class="prompt-display-header">
					<h3>Prompt Content</h3>
					<button
						class="btn btn-icon"
						class:copied={copiedToClipboard}
						on:click={copyToClipboard}
						title="Copy to clipboard"
					>
						{copiedToClipboard ? '✓ Copied' : '📋 Copy'}
					</button>
				</div>
				<div class="prompt-content">
					{prompt.content}
				</div>
			</div>

			<div class="execution-actions">
				<h3>Execute with LLM</h3>
				<p class="action-description">
					Click on an LLM below to copy the prompt to your clipboard and open the LLM in a new window.
				</p>
				<div class="llm-buttons">
					<button
						class="btn llm-button chatgpt-btn"
						class:executing={executingLLM === 'chatgpt'}
						on:click={() => executeLLM('chatgpt')}
						disabled={executingLLM !== null}
					>
						<span class="llm-icon">🤖</span>
						<span class="llm-name">ChatGPT</span>
						{#if executingLLM === 'chatgpt'}
							<span class="executing-indicator">⏳</span>
						{/if}
					</button>
					<button
						class="btn llm-button claude-btn"
						class:executing={executingLLM === 'claude'}
						on:click={() => executeLLM('claude')}
						disabled={executingLLM !== null}
					>
						<span class="llm-icon">🔮</span>
						<span class="llm-name">Claude</span>
						{#if executingLLM === 'claude'}
							<span class="executing-indicator">⏳</span>
						{/if}
					</button>
					<button
						class="btn llm-button gemini-btn"
						class:executing={executingLLM === 'gemini'}
						on:click={() => executeLLM('gemini')}
						disabled={executingLLM !== null}
					>
						<span class="llm-icon">💎</span>
						<span class="llm-name">Gemini</span>
						{#if executingLLM === 'gemini'}
							<span class="executing-indicator">⏳</span>
						{/if}
					</button>
					<button
						class="btn llm-button perplexity-btn"
						class:executing={executingLLM === 'perplexity'}
						on:click={() => executeLLM('perplexity')}
						disabled={executingLLM !== null}
					>
						<span class="llm-icon">🧠</span>
						<span class="llm-name">Perplexity</span>
						{#if executingLLM === 'perplexity'}
							<span class="executing-indicator">⏳</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.execution-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-xl);
	}

	.execution-header {
		margin-bottom: var(--space-xl);
	}

	.page-title {
		font-size: var(--font-3xl);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl);
		text-align: center;
		gap: var(--space-md);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-icon {
		font-size: 3rem;
	}

	.selection-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.selection-header {
		text-align: center;
		padding: var(--space-lg);
	}

	.selection-header h2 {
		font-size: var(--font-2xl);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--space-sm) 0;
	}

	.selection-description {
		color: var(--color-text-muted);
		font-size: var(--font-md);
		margin: 0;
	}

	.prompts-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-md);
	}

	.prompt-item {
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		cursor: pointer;
		transition: all 0.3s ease;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.prompt-item:hover {
		border-color: var(--color-primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.prompt-item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.prompt-item-name {
		font-size: var(--font-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.prompt-item-arrow {
		font-size: var(--font-xl);
		color: var(--color-primary);
	}

	.prompt-item-template {
		font-size: var(--font-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.prompt-item-preview {
		font-size: var(--font-sm);
		color: var(--color-text-light);
		line-height: 1.5;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.execution-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-xl);
	}

	.prompt-actions-bar {
		display: flex;
		gap: var(--space-md);
	}

	.prompt-info h2 {
		font-size: var(--font-xl);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--space-sm) 0;
	}

	.template-name {
		color: var(--color-text-secondary);
		font-size: var(--font-sm);
		margin: 0;
	}

	.prompt-display {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.prompt-display-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background);
	}

	.prompt-display-header h3 {
		margin: 0;
		font-size: var(--font-md);
		font-weight: 600;
		color: var(--color-text);
	}

	.prompt-content {
		padding: var(--space-lg);
		font-size: var(--font-md);
		line-height: 1.6;
		color: var(--color-text);
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 400px;
		overflow-y: auto;
	}

	.execution-actions {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
	}

	.execution-actions h3 {
		margin: 0 0 var(--space-sm) 0;
		font-size: var(--font-lg);
		font-weight: 600;
		color: var(--color-text);
	}

	.action-description {
		color: var(--color-text-secondary);
		font-size: var(--font-sm);
		margin: 0 0 var(--space-lg) 0;
	}

	.llm-buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-md);
	}

	.llm-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-lg);
		font-size: var(--font-md);
		font-weight: 500;
		border-radius: var(--radius-md);
		transition: all 0.2s ease;
		background: var(--color-background);
		border: 2px solid var(--color-border);
	}

	.llm-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.llm-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.llm-icon {
		font-size: 1.5em;
	}

	.llm-name {
		font-weight: 600;
	}

	.executing-indicator {
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.chatgpt-btn:hover:not(:disabled) {
		border-color: #10a37f;
		background: rgba(16, 163, 127, 0.1);
	}

	.claude-btn:hover:not(:disabled) {
		border-color: #cc9b7a;
		background: rgba(204, 155, 122, 0.1);
	}

	.gemini-btn:hover:not(:disabled) {
		border-color: #8ab4f8;
		background: rgba(138, 180, 248, 0.1);
	}

	.perplexity-btn:hover:not(:disabled) {
		border-color: #20808d;
		background: rgba(32, 128, 141, 0.1);
	}

	.btn.copied {
		background: var(--color-success, #22c55e);
		color: white;
		border-color: var(--color-success, #22c55e);
	}

	@media (max-width: 768px) {
		.execution-container {
			padding: var(--space-md);
		}

		.prompts-list {
			grid-template-columns: 1fr;
		}

		.llm-buttons {
			grid-template-columns: 1fr;
		}
	}
</style>
