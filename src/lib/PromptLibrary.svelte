<script lang="ts">
	import { api, type Prompt } from './api.js';
	import { onMount, getContext } from 'svelte';
	import { selectedProfile } from './stores/profileStore';
	import { eventBus } from './stores/eventBus';
	import type { Profile } from '$lib/api';
	import { authStore } from './stores/authStore';
	import { activityTracker, ACTIVITY_TYPES } from './activityTracker';
	import './styles/prompt-components.css';
	import type { Writable } from 'svelte/store';
	import { goto } from '$app/navigation';

	// Get the activeTab context from the layout
	const activeTabStore = getContext<Writable<string>>('activeTab');

	let generatedPrompts: Prompt[] = [];
	let currentProfile: Profile | null = null;
	let currentUser: any = null;
	let copiedPromptId: string | null = null;
	let expandedPrompts: Set<string> = new Set();
	let executingPromptId: string | null = null;

	// Subscribe to profile changes
	selectedProfile.subscribe(async (profile) => {
		currentProfile = profile;
		if (profile) {
			await loadPrompts();
		} else {
			generatedPrompts = [];
		}
	});

	// Subscribe to auth state
	authStore.subscribe(state => {
		currentUser = state.user;
	});

	// Listen for events
	eventBus.subscribe(async (event) => {
		if ((event.type === 'persona-created' || event.type === 'persona-updated' || event.type === 'template-created' || event.type === 'template-updated') && currentProfile) {
			await loadPrompts();
		}
	});

	onMount(async () => {
		if (currentProfile) {
			await loadPrompts();
		}
	});

	async function loadPrompts() {
		if (!currentProfile) return;
		try {
			generatedPrompts = await api.getPrompts(currentProfile.id);
		} catch (error) {
			console.error('Failed to load prompts:', error);
		}
	}

	async function deletePrompt(promptId: string) {
		if (!confirm('Are you sure you want to delete this prompt?')) {
			return;
		}

		try {
			await api.deletePrompt(promptId);
			generatedPrompts = generatedPrompts.filter(p => p.id !== promptId);
			
			// Track activity
			if (currentUser) {
				await activityTracker.trackActivity(
					currentUser.user_id,
					ACTIVITY_TYPES.PROMPT_DELETED,
					`Deleted prompt: ${promptId}`,
					{ prompt_id: promptId }
				);
			}
		} catch (error) {
			console.error('Failed to delete prompt:', error);
			alert('Failed to delete prompt. Please try again.');
		}
	}

	function copyToClipboard(text: string, promptId: string) {
		navigator.clipboard.writeText(text).then(() => {
			copiedPromptId = promptId;
			setTimeout(() => {
				copiedPromptId = null;
			}, 2000);
		}).catch(err => {
			console.error('Failed to copy: ', err);
		});
	}

	function toggleExpand(promptId: string) {
		if (expandedPrompts.has(promptId)) {
			expandedPrompts.delete(promptId);
		} else {
			expandedPrompts.add(promptId);
		}
		expandedPrompts = new Set(expandedPrompts);
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function editPrompt(prompt: Prompt) {
		// Set edit event
		eventBus.set({
			event: 'editPrompt',
			data: prompt
		});
		// Switch to generator tab
		activeTabStore.set('generator');
	}

	async function executeLLM(prompt: Prompt, llm: 'chatgpt' | 'claude' | 'gemini' | 'perplexity') {
		executingPromptId = prompt.id;

		let clipboardSuccess = false;
		let windowSuccess = false;

		try {
			// Try to copy prompt to clipboard first
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					await navigator.clipboard.writeText(prompt.content);
					clipboardSuccess = true;
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

			// Show visual feedback if at least clipboard worked
			if (clipboardSuccess) {
				copiedPromptId = prompt.id;
			}

			setTimeout(() => {
				copiedPromptId = null;
				executingPromptId = null;
			}, 2000);

			// Track the LLM execution activity (only if something worked)
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

			// Only show alert if window opening failed
			if (!windowSuccess) {
				const llmName = llm.charAt(0).toUpperCase() + llm.slice(1);
				const message = clipboardSuccess
					? `Prompt copied to clipboard! Could not auto-open ${llmName} - please check popup blocker settings and manually open ${llmName}.`
					: `Could not copy to clipboard or open ${llmName}. Please check browser permissions and popup blocker settings.`;
				alert(message);
			}

		} catch (error) {
			console.error('Unexpected error in executeLLM:', error);
			executingPromptId = null;
			alert(`Unexpected error: ${error.message}`);
		}
	}
</script>

<div class="prompt-library">
	<div class="component-header">
		<div class="header-content">
			<h2 class="component-title">📚 Prompt Library
			<button class="btn" on:click={() => {
				// Clear any edit events
				eventBus.set(null);
				// Switch to generator tab
				activeTabStore.set('generator');
			}}>
				<span class="icon">✨</span>
				New Prompt
			</button>
			</h2>
			<!-- <p class="component-description">Your generated prompts and templates</p> -->
		</div>
		<!-- <div class="header-actions">
			<a href="/promptgenerator" class="btn btn-primary">
				<span class="icon">✨</span>
				Generate New Prompt
			</a>
		</div> -->
	</div>

	{#if generatedPrompts.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📝</div>
			<h3>No Prompts Yet</h3>
			<p>You haven't generated any prompts yet. Create your first prompt to get started!</p>
			<button class="btn btn-primary" on:click={() => {
				// Clear any edit events
				eventBus.set(null);
				// Switch to generator tab
				activeTabStore.set('generator');
			}}>
				<span class="icon">✨</span>
				Create Your First Prompt
			</button>
		</div>
	{:else}
		<div class="prompts-grid">
			{#each generatedPrompts as prompt (prompt.id)}
				<div class="prompt-card">
					<div class="card-header">
						<div class="left-actions">
							<button
								class="btn btn-icon expand-btn"
								on:click={() => toggleExpand(prompt.id)}
								title={expandedPrompts.has(prompt.id) ? 'Collapse' : 'Expand'}
							>
								{expandedPrompts.has(prompt.id) ? '▼' : '▶'}
							</button>
							<button
								class="btn btn-icon expand-btn"
								on:click={() => editPrompt(prompt)}
								title="Edit prompt"
							>
								✏️
							</button>
							<button
								class="btn btn-icon expand-btn"
								on:click={() => goto(`/prompt-execution?id=${prompt.id}`)}
								title="Execute prompt"
							>
								▶️
							</button>
						</div>
						<h3 class="prompt-name">{prompt.name}</h3>
						<div class="card-actions actions-right">
							<div class="llm-icons">
								<button
									class="btn btn-llm chatgpt-icon"
									class:executing={executingPromptId === prompt.id}
									on:click={() => executeLLM(prompt, 'chatgpt')}
									title="Execute with ChatGPT - Copies prompt and opens ChatGPT"
								>
									{executingPromptId === prompt.id ? '⏳' : '🤖'}
								</button>
								<button
									class="btn btn-llm claude-icon"
									class:executing={executingPromptId === prompt.id}
									on:click={() => executeLLM(prompt, 'claude')}
									title="Execute with Claude - Copies prompt and opens Claude"
								>
									{executingPromptId === prompt.id ? '⏳' : '🔮'}
								</button>
								<button
									class="btn btn-llm gemini-icon"
									class:executing={executingPromptId === prompt.id}
									on:click={() => executeLLM(prompt, 'gemini')}
									title="Execute with Gemini - Copies prompt and opens Gemini"
								>
									{executingPromptId === prompt.id ? '⏳' : '💎'}
								</button>
								<button
									class="btn btn-llm perplexity-icon"
									class:executing={executingPromptId === prompt.id}
									on:click={() => executeLLM(prompt, 'perplexity')}
									title="Execute with Perplexity - Copies prompt and opens Perplexity"
								>
									{executingPromptId === prompt.id ? '⏳' : '🧠'}
								</button>
							</div>
							<div class="divider"></div>
							<button
								class="btn btn-icon copy-btn"
								class:copied={copiedPromptId === prompt.id}
								on:click={() => copyToClipboard(prompt.content, prompt.id)}
								title="Copy to clipboard"
							>
								{copiedPromptId === prompt.id ? '✓' : '📋'}
							</button>
							<button
								class="btn btn-icon delete-btn"
								on:click={() => deletePrompt(prompt.id)}
								title="Delete prompt"
							>
								🗑️
							</button>
						</div>
					</div>

					<!-- <div class="card-meta">
						<span class="meta-item">🏷️ {prompt.template_name}</span>
						<span class="meta-item">📅 {formatDate(prompt.created_at)}</span>
					</div> -->

					<div class="prompt-preview" class:expanded={expandedPrompts.has(prompt.id)}>
						<div class="prompt-content">
							{prompt.content}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.prompt-library {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.prompt-preview {
		padding: var(--space-md);
		max-height: 120px;
		overflow: hidden;
		transition: max-height 0.3s ease;
		position: relative;
	}

	.prompt-preview.expanded {
		max-height: none;
	}

	.prompt-preview:not(.expanded)::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 40px;
		background: linear-gradient(transparent, var(--color-surface));
		pointer-events: none;
	}

	.prompt-content {
		font-size: var(--font-sm);
		line-height: 1.6;
		color: var(--color-text);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.left-actions {
		display: flex;
		gap: var(--space-xs);
		align-items: center;
		margin-right: var(--space-sm);
	}

	.expand-btn {
		font-size: 1.5em;
		flex-shrink: 0;
	}
</style>