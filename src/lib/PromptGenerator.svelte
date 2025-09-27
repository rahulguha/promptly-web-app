<script lang="ts">
	import { api, type PromptTemplate, type Prompt, type Persona, type Intent, type PromptEvaluationResponse } from './api.js';
	import { onMount } from 'svelte';
	import RichDropdown from './RichDropdown.svelte';

	import { selectedProfile } from './stores/profileStore';
	import { eventBus } from './stores/eventBus';
	import type { Profile } from '$lib/api';
	import { authStore } from './stores/authStore';
	import { activityTracker, ACTIVITY_TYPES } from './activityTracker';

	let templates: PromptTemplate[] = [];
	let personas: Persona[] = [];
	let generatedPrompts: Prompt[] = [];
	let intents: Intent[] = [];
	let selectedTemplateId = '';
	let selectedTemplateVersion = 1;
	let selectedIntentId = '';
	let variables: Record<string, string> = {};
	let promptName = '';
	let selectedTemplate: PromptTemplate | null = null;
	let editingPrompt: Prompt | null = null;
	let showEditForm = false;
	let filterTemplateId = '';
	let currentProfile: Profile | null = null;
	let currentUser: any = null;
	let displayedVariables: string[] = [];
	let copiedPromptId: string | null = null;
	// let showQueryModal = false;
	// let userQuery = '';
	// let selectedLLM = '';
	// let selectedPrompt: Prompt | null = null;
	let expandedPrompts: Set<string> = new Set();
	let evaluationResults: PromptEvaluationResponse | null = null;
	let isEvaluating = false;
	let generatedPromptContent = '';

	function generateSystemPrompt(profile: Profile, intentId?: string, template?: PromptTemplate): string {
		const attrs = profile.attributes;
		let systemPrompt = `[System Prompt]\nUser Profile: ${profile.name}`;

		if (profile.description) {
			systemPrompt += `\nDescription: ${profile.description}`;
		}

		// Add Meta Role if template is provided
		if (template && template.meta_role) {
			systemPrompt += `\nMeta Role: ${template.meta_role}`;
		}
		
		// Demographics
		const demographics = [];
		if (attrs.age) demographics.push(`${attrs.age} years old`);
		if (attrs.gender) demographics.push(attrs.gender);
		if (attrs.location?.city && attrs.location?.country) {
			demographics.push(`from ${attrs.location.city}, ${attrs.location.country}`);
		}
		if (demographics.length > 0) {
			systemPrompt += `\nDemographics: ${demographics.join(', ')}`;
		}
		
		// Education & Professional
		if (attrs.education_level) systemPrompt += `\nEducation: ${attrs.education_level}`;
		if (attrs.occupation) systemPrompt += `\nOccupation: ${attrs.occupation}`;
		if (attrs.expertise_level) systemPrompt += `\nExpertise Level: ${attrs.expertise_level}`;
		
		// Preferences
		if (attrs.tone_preference) systemPrompt += `\nPreferred Tone: ${attrs.tone_preference}`;
		if (attrs.preferred_languages?.length) systemPrompt += `\nLanguages: ${attrs.preferred_languages.join(', ')}`;
		if (attrs.interests?.length) systemPrompt += `\nInterests: ${attrs.interests.join(', ')}`;
		if (attrs.intent) systemPrompt += `\nIntent: ${attrs.intent}`;
		
		systemPrompt += '\n\nTailor your responses to match this user profile and their specific context.';
		
		// Add User Intent section if intent is selected
		if (intentId) {
			const selectedIntent = intents.find(intentItem => intentItem.intent === intentId);
			if (selectedIntent && selectedIntent.system_prompt) {
				systemPrompt += '\n\n[User Intent]\n' + selectedIntent.system_prompt;
			}
		}
		
		systemPrompt += '\n';
		return systemPrompt;
	}

	function extractVariables(text: string): string[] {
		const regex = /\{\{([^}]+)\}\}/g;
		const matches = text.match(regex);
		if (matches) {
			return [...new Set(matches.map(match => match.substring(2, match.length - 2).trim()))];
		}
		return [];
	}

	function cleanTemplateContent(templateContent: string): string {
		// Remove [Meta Role] section from template content to avoid duplication
		// This handles existing templates that still have MetaRole in their content
		let cleanedContent = templateContent.replace(/\[Meta Role\][\s\S]*?(?=\n\[|\n\n\[|$)/g, '').trim();

		// Add [User Section] header before the content
		if (cleanedContent) {
			cleanedContent = `[User Section]\n${cleanedContent}`;
		}

		return cleanedContent;
	}

	selectedProfile.subscribe(value => {
		currentProfile = value;
	});

	// Subscribe to auth state to get current user
	authStore.subscribe(state => {
		currentUser = state.user;
	});

	eventBus.subscribe(event => {
		if (event && (event.event === 'personaCreated' || event.event === 'templateCreated')) {
			if (currentProfile) {
				loadData(currentProfile.id);
			}
		}
	});

	$: {
		if (currentProfile) {
			loadData(currentProfile.id);
		} else {
			templates = [];
			personas = [];
			generatedPrompts = [];
		}
	}

	// Load intents when component mounts (intents are not profile-specific)
	onMount(async () => {
		try {
			intents = await api.getIntents();
		} catch (error) {
			console.error('Failed to load intents:', error);
		}
	});

	async function loadData(profileId: string) {
		try {
			console.log('Loading data for profile:', profileId);
			// Load prompts, templates (for creation), personas, and intents in parallel
			const [promptsData, templatesData, personasData] = await Promise.all([
				api.getPrompts(profileId),
				api.getTemplates(profileId), 
				api.getPersonas(profileId)
			]);
			console.log('Loaded prompts:', promptsData);
			generatedPrompts = promptsData ?? [];
			templates = templatesData ?? [];
			personas = personasData ?? [];
		} catch (error) {
			console.error('Failed to load data:', error);
			generatedPrompts = [];
			templates = [];
			personas = [];
		}
	}

	$: {
		if (selectedTemplateId) {
			const [templateId, versionStr] = selectedTemplateId.split(':');
			const version = parseInt(versionStr);
			selectedTemplate = templates.find(t => t.id === templateId && t.version === version) || null;

			if (selectedTemplate) {
				displayedVariables = extractVariables(selectedTemplate.template);
				// Only reset variables if we're not in edit mode
				if (!showEditForm || !editingPrompt) {
					const newVariables = {};
					for (const v of displayedVariables) {
						newVariables[v] = variables[v] || '';
					}
					variables = newVariables;
				} else {
					// In edit mode, preserve existing variables but add any missing ones
					const newVariables = { ...variables };
					for (const v of displayedVariables) {
						if (!(v in newVariables)) {
							newVariables[v] = '';
						}
					}
					variables = newVariables;
				}
			}
		} else {
			selectedTemplate = null;
			if (!showEditForm || !editingPrompt) {
				variables = {};
				displayedVariables = [];
			}
		}
	}

	// Ensure template is set correctly for edit mode
	$: {
		if (showEditForm && editingPrompt && templates.length > 0) {
			// Make sure the template is found and selectedTemplate is set
			const template = templates.find(t => t.id === editingPrompt.template_id && t.version === editingPrompt.template_version);
			if (template && (!selectedTemplate || selectedTemplate.id !== template.id || selectedTemplate.version !== template.version)) {
				selectedTemplate = template;
				displayedVariables = extractVariables(template.template);
			}
		}
	}


	async function generatePrompt(e: Event) {
		e.preventDefault();
		if (!selectedTemplateId || !currentProfile) return;
		
		// Validate that query variable is populated
		if (!variables.query || !variables.query.trim()) {
			alert('Please fill in the {{query}} field before generating a prompt.');
			return;
		}
		
		try {
			if (editingPrompt) {
				await updatePrompt();
			} else {
				// Parse template ID and version from the compound value
				const [templateId, versionStr] = selectedTemplateId.split(':');
				const version = parseInt(versionStr);
				const template = templates.find(t => t.id === templateId && t.version === version);
				if (!template) return;
				
				// Generate system prompt from profile
				const systemPrompt = generateSystemPrompt(currentProfile, selectedIntentId, template);
				
				// Generate content with updated variables, clean MetaRole and add User Section header
				let content = cleanTemplateContent(template.template);
				for (const [variable, value] of Object.entries(variables)) {
					const placeholder = `{{${variable}}}`;
					content = content.replaceAll(placeholder, value || '');
				}
				
				// Combine system prompt with content
				const fullContent = systemPrompt + '\n' + content;

				// Show results inline instead of modal
				generatedPromptContent = fullContent;
				evaluationResults = null; // Clear previous evaluation results
			}
		} catch (error) {
			console.error('Error generating prompt:', error);
		}
	}

	function getPersonaDisplay(personaId: string) {
		if (!personas || personas.length === 0) {
			return 'Loading...';
		}
		
		const persona = personas.find(p => p.persona_id === personaId);
		if (!persona) {
			console.warn('Persona not found for ID:', personaId, 'Available IDs:', personas.map(p => p.persona_id));
		}
		return persona ? `${persona.user_role_display} → ${persona.llm_role_display}` : 'Unknown';
	}

	function getTemplateDisplay(templateId: string, templateVersion?: number) {
		// Since we don't load templates in this component, just show ID and version
		const shortId = templateId.substring(0, 8);
		return `Template ${shortId}${templateVersion ? ` v${templateVersion}` : ''}`;
	}

	function showTemplateDetails(templateId: string, templateVersion: number) {
		// Template details not available since we don't load templates in this component
		// User should go to Templates tab to view template details
		alert(`Template ID: ${templateId}\nVersion: ${templateVersion}\n\nTo view full template details, please go to the Templates tab.`);
	}
	
	$: templateOptions = templates ? templates.map(template => {
		const persona = personas ? personas.find(p => p.persona_id === template.persona_id) : null;
		return {
			value: `${template.id}:${template.version}`,
			display: template.name ? `${template.name} (v${template.version})` : (persona ? `${persona.user_role_display} → ${persona.llm_role_display} (v${template.version})` : 'Unknown Persona'),
			meta: template.template.slice(0, 60) + '...', // Truncate for meta display
			user_role: persona?.user_role || 'unknown',
			llm_role: persona?.llm_role || 'unknown'
		};
	}) : [];

	$: intentOptions = intents.map(intentItem => ({
		value: intentItem.intent,  // Use 'intent' field as the ID
		display: intentItem.name,
		meta: intentItem.description.slice(0, 60) + '...'
	}));

	$: filterOptions = [
		{ value: '', display: 'All Templates', meta: 'Show all prompts', user_role: 'all', llm_role: 'all' },
		...templateOptions
	];

	$: filteredPrompts = filterTemplateId 
		? generatedPrompts.filter(p => {
			// Handle both compound format (id:version) and plain id for backward compatibility
			if (filterTemplateId.includes(':')) {
				const [templateId, versionStr] = filterTemplateId.split(':');
				const version = parseInt(versionStr);
				return p.template_id === templateId && p.template_version === version;
			} else {
				return p.template_id === filterTemplateId;
			}
		})
		: generatedPrompts;

	async function deletePrompt(prompt: Prompt) {
		if (confirm('Delete this prompt?')) {
			await api.deletePrompt(prompt.id);
			generatedPrompts = generatedPrompts.filter(p => p.id !== prompt.id);
		}
	}

	function editPrompt(prompt: Prompt) {
		console.log('Editing prompt:', prompt);
		console.log('Available templates:', templates);
		
		editingPrompt = prompt;
		let templateKey = `${prompt.template_id}:${prompt.template_version}`;
		console.log('Looking for template key:', templateKey);
		
		// Find the template - first try exact version match
		let template = templates.find(t => t.id === prompt.template_id && t.version === prompt.template_version);
		
		// If not found, try to find any version of this template (fallback for data inconsistency)
		if (!template) {
			console.warn('Exact template version not found, looking for any version of template:', prompt.template_id);
			template = templates.find(t => t.id === prompt.template_id);
			if (template) {
				console.log('Found template with different version:', template.version, 'instead of', prompt.template_version);
				templateKey = `${template.id}:${template.version}`;
			}
		}
		
		console.log('Found template:', template);
		
		if (template) {
			selectedTemplateId = templateKey;
			// Force set the selectedTemplate to ensure reactive statements work
			selectedTemplate = template;
			displayedVariables = extractVariables(template.template);
			variables = { ...prompt.variable_values || {} };
			promptName = prompt.name;
			showEditForm = true;
			console.log('Edit form setup complete', { selectedTemplateId, displayedVariables, variables });
		} else {
			console.error('Template not found for editing:', templateKey);
			alert('Cannot edit prompt: Template not found. Please refresh and try again.');
		}
	}

	async function updatePrompt() {
		if (!editingPrompt) return;
		
		const template = templates.find(t => t.id === editingPrompt.template_id && t.version === editingPrompt.template_version);
		if (!template) return;

		// Generate system prompt from profile
		const systemPrompt = generateSystemPrompt(currentProfile, selectedIntentId, template);
		
		// Generate new content with updated variables, clean MetaRole and add User Section header
		let content = cleanTemplateContent(template.template);
		for (const [variable, value] of Object.entries(variables)) {
			const placeholder = `{{${variable}}}`;
			content = content.replaceAll(placeholder, value || '');
		}
		
		// Combine system prompt with content
		content = systemPrompt + '\n' + content;

		const updatedPrompt = await api.updatePrompt(editingPrompt.id, {
			name: promptName,
			template_id: editingPrompt.template_id,
			template_version: editingPrompt.template_version,
			variable_values: variables,
			content: content
		});

		generatedPrompts = generatedPrompts.map(p => p.id === updatedPrompt.id ? updatedPrompt : p);
		resetEditForm();
	}

	function resetEditForm() {
		editingPrompt = null;
		showEditForm = false;
		variables = {};
		selectedTemplateId = '';
		promptName = '';
		generatedPromptContent = '';
		evaluationResults = null;
	}

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (err) {
			console.error('Failed to copy text: ', err);
			return false;
		}
	}

	async function directCopyAndOpenLLM(prompt: Prompt, llm: string) {
		const copied = await copyToClipboard(prompt.content);
		if (copied) {
			copiedPromptId = prompt.id;
			
			// Track LLM execution
			if (currentUser) {
				await activityTracker.trackPromptExecuted(currentUser, llm as 'chatgpt' | 'claude' | 'gemini' | 'perplexity', prompt.id);
			}
			
			// Open the appropriate LLM
			let url;
			switch(llm) {
				case 'chatgpt':
					url = 'https://chat.openai.com/';
					break;
				case 'claude':
					url = 'https://claude.ai/';
					break;
				case 'perplexity':
					url = 'https://www.perplexity.ai/';
					break;
				case 'gemini':
					url = 'https://gemini.google.com/';
					break;
				default:
					url = 'https://chat.openai.com/';
			}
			window.open(url, '_blank');
			
			setTimeout(() => copiedPromptId = null, 2000);
		} else {
			// Track copy failure
			if (currentUser) {
				await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROMPT_EXECUTED_CHATGPT, `Failed to copy prompt to clipboard for ${llm}`);
			}
		}
	}

	// function openQueryModal(prompt: Prompt, llm: string) {
	// 	selectedPrompt = prompt;
	// 	selectedLLM = llm;
	// 	userQuery = '';
	// 	showQueryModal = true;
	// }

	// function closeQueryModal() {
	// 	showQueryModal = false;
	// 	selectedPrompt = null;
	// 	selectedLLM = '';
	// 	userQuery = '';
	// }

	// async function executeWithQuery() {
	// 	if (!selectedPrompt || !userQuery.trim()) return;
	// 	
	// 	// Combine the prompt with the user's query
	// 	const fullContent = selectedPrompt.content + '\n\n[User Query]\n' + userQuery.trim();
	// 	
	// 	const copied = await copyToClipboard(fullContent);
	// 	if (copied) {
	// 		copiedPromptId = selectedPrompt.id;
	// 		
	// 		// Open the appropriate LLM
	// 		const url = selectedLLM === 'chatgpt' ? 'https://chat.openai.com/' : 'https://claude.ai/';
	// 		window.open(url, '_blank');
	// 		
	// 		setTimeout(() => copiedPromptId = null, 2000);
	// 		closeQueryModal();
	// 	}
	// }

	function togglePromptExpansion(promptId: string) {
		if (expandedPrompts.has(promptId)) {
			expandedPrompts.delete(promptId);
		} else {
			expandedPrompts.add(promptId);
		}
		expandedPrompts = expandedPrompts; // Trigger reactivity
	}


	async function evaluatePrompt() {
		if (!generatedPromptContent.trim()) return;

		try {
			isEvaluating = true;
			evaluationResults = null; // Clear previous results

			const response = await api.evaluatePrompt({
				prompt: generatedPromptContent
			});

			evaluationResults = response;
			console.log('Evaluation results:', evaluationResults);

		} catch (error) {
			console.error('Error evaluating prompt:', error);
			alert('Failed to evaluate prompt. Please try again.');
		} finally {
			isEvaluating = false;
		}
	}

	async function saveGeneratedPrompt() {
		if (!currentProfile || !promptName || !evaluationResults?.suggestedPrompt) return;

		// Use the suggested prompt from Claude evaluation
		const suggestedPromptContent = evaluationResults.suggestedPrompt;

		// Additional check to ensure query was populated (check if {{query}} still exists in content)
		if (suggestedPromptContent.includes('{{query}}')) {
			alert('Cannot save prompt: {{query}} variable was not filled. Please go back and fill the query field.');
			return;
		}

		try {
			console.log('Saving suggested prompt with data:', {
				name: promptName + ' (Claude Suggested)',
				contentLength: suggestedPromptContent.length
			});

			// Send name, content, and template info to backend for proper association
			const prompt = await api.generatePrompt(
				promptName + ' (Claude Suggested)',
				suggestedPromptContent,
				selectedTemplateId,
				variables,
				currentProfile.id
			);

			console.log('Received saved suggested prompt from API:', prompt);

			if (prompt) {
				// Track successful prompt creation
				if (currentUser) {
					await activityTracker.trackPromptCreated(currentUser, prompt.id, currentProfile.id);
				}

				// Reload all prompts from backend to ensure we have the latest data
				await loadData(currentProfile.id);

				// Reset form to initial state
				variables = {};
				selectedTemplateId = '';
				promptName = '';
				selectedIntentId = '';
				generatedPromptContent = '';
				evaluationResults = null;

				alert('Claude suggested prompt saved successfully!');
			} else {
				console.error('Failed to save suggested prompt: No data returned from API');
				// Track failure
				if (currentUser) {
					await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROMPT_CREATED, 'No data returned from API');
				}
			}
		} catch (error) {
			console.error('Error saving suggested prompt:', error);
			// Track error
			if (currentUser) {
				await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROMPT_CREATED, `Suggested prompt creation error: ${error}`);
			}
		}
	}

</script>

<div class="prompt-generator">
	<div class="header-with-intent">
		<h2>Create New Prompt</h2>
		<div class="intent-selector">
			<label for="intent-dropdown">Intent:</label>
			<select id="intent-dropdown" bind:value={selectedIntentId}>
				<option value="">Select Intent</option>
				{#each intents as intentItem}
					<option value={intentItem.intent}>{intentItem.name}</option>
				{/each}
			</select>
		</div>
	</div>
	
	<div class="generator-form">
		{#if showEditForm && editingPrompt}
			<div class="editing-prompt-header">
				<h3>Editing Prompt: {editingPrompt.name}</h3>
				<button type="button" class="cancel-edit-btn" on:click={resetEditForm}>Cancel Edit</button>
			</div>
		{/if}
		
		<RichDropdown 
			items={templateOptions}
			bind:selectedValue={selectedTemplateId}
			placeholder="Select Template"
		/>

		{#if selectedTemplate || (showEditForm && editingPrompt)}
			<div class="prompt-form">
				<div class="prompt-name-input">
					<label>Prompt Name:</label>
					<input bind:value={promptName} placeholder="Enter prompt name" required />
				</div>

				<div class="variables-form">
					<h4>Variables</h4>
					{#each displayedVariables as variable}
						<div class="variable-input">
							<label>{variable}:</label>
							<input bind:value={variables[variable]} placeholder={`Enter ${variable}`} />
						</div>
					{/each}
				</div>

				<div class="button-group">
					<button on:click={(e) => generatePrompt(e)}>
						{editingPrompt ? 'Update Prompt' : 'Create Prompt'}
					</button>
					{#if generatedPromptContent && !editingPrompt}
						<button
							type="button"
							class="evaluate-btn"
							on:click={evaluatePrompt}
							disabled={isEvaluating}
						>
							{isEvaluating ? 'Evaluating...' : 'Ask Claude'}
						</button>
						<button
							type="button"
							class="save-btn"
							on:click={saveGeneratedPrompt}
							disabled={!promptName.trim() || !evaluationResults?.suggestedPrompt}
						>
							Save Generated Prompt
						</button>
					{/if}
					{#if editingPrompt}
						<button type="button" on:click={resetEditForm}>Cancel Edit</button>
					{/if}
				</div>
			</div>

			{#if generatedPromptContent}
				<div class="inline-prompt-display">
					<div class="prompt-results-container">
						<div class="generated-prompt-section">
							<div class="section-header">
								<h4>Generated Prompt</h4>
							</div>
							<textarea
								bind:value={generatedPromptContent}
								placeholder="Generated prompt will appear here..."
								rows="20"
							></textarea>
						</div>

						{#if evaluationResults}
							<div class="suggested-prompt-section">
								<div class="section-header">
									<h4>Suggested Prompt</h4>
								</div>
								<textarea
									value={evaluationResults.suggestedPrompt}
									readonly
									placeholder="Suggested prompt will appear here..."
									rows="20"
								></textarea>
							</div>
						{/if}
					</div>
				</div>
			{/if}

		{/if}
	</div>

	<div class="generated-prompts">
		<div class="prompts-header">
			<h3>Generated Prompts</h3>
			<div class="filter-section">
				<RichDropdown 
					items={filterOptions}
					bind:selectedValue={filterTemplateId}
					placeholder="Filter by template"
				/>
			</div>
		</div>
		<p class="llm-instructions">Click on the LLM to copy the prompt and open the LLM screen. Paste (Ctrl+V) there to use the prompt</p>
		{#each filteredPrompts as prompt}
			<div class="prompt-card">
				<div class="prompt-header">
					<div class="prompt-meta">
						<div class="prompt-name-with-expand">
							<button class="expand-btn-left" on:click={() => togglePromptExpansion(prompt.id)} title={expandedPrompts.has(prompt.id) ? 'Collapse' : 'Expand'}>
								{expandedPrompts.has(prompt.id) ? '▼' : '▶'}
							</button>
							<div class="prompt-name-highlight">
								<strong>{prompt.name || '[No name]'}</strong>
							</div>
						</div>
						<div class="prompt-template-simple">
							Template: <a 
								class="template-simple-link" 
								href="javascript:void(0)"
								on:click={() => showTemplateDetails(prompt.template_id, prompt.template_version)}
								title="Click to view template details"
							>
								{getTemplateDisplay(prompt.template_id, prompt.template_version)}
							</a>
						</div>
					</div>
					<div class="prompt-actions">
						<button class="llm-btn chatgpt-btn" on:click={() => directCopyAndOpenLLM(prompt, 'chatgpt')} title="Copy prompt and open ChatGPT">
							{copiedPromptId === prompt.id ? 'Copied!' : 'ChatGPT'}
						</button>
						<button class="llm-btn claude-btn" on:click={() => directCopyAndOpenLLM(prompt, 'claude')} title="Copy prompt and open Claude">
							{copiedPromptId === prompt.id ? 'Copied!' : 'Claude'}
						</button>
						<button class="llm-btn perplexity-btn" on:click={() => directCopyAndOpenLLM(prompt, 'perplexity')} title="Copy prompt and open Perplexity">
							{copiedPromptId === prompt.id ? 'Copied!' : 'Perplexity'}
						</button>
						<button class="llm-btn gemini-btn" on:click={() => directCopyAndOpenLLM(prompt, 'gemini')} title="Copy prompt and open Gemini">
							{copiedPromptId === prompt.id ? 'Copied!' : 'Gemini'}
						</button>
						<button class="icon-btn edit-btn" on:click={() => editPrompt(prompt)} title="Edit">
							✏️
						</button>
						<button class="icon-btn delete-btn" on:click={() => deletePrompt(prompt)} title="Delete">
							🗑️
						</button>
					</div>
				</div>
				{#if expandedPrompts.has(prompt.id)}
					<div class="prompt-content">
						<strong>Final Content:</strong>
						<pre>{prompt.content}</pre>
					</div>
					{#if prompt.variable_values && Object.keys(prompt.variable_values).length > 0}
						<div class="prompt-values">
							<strong>Values Used:</strong>
							{#each Object.entries(prompt.variable_values) as [key, value]}
								<span class="value-tag">{key}: {value}</span>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
</div>

<!-- Query Modal - Commented out for direct copy functionality -->
<!-- {#if showQueryModal}
	<div class="modal-overlay" on:click={closeQueryModal}>
		<div class="modal" on:click|stopPropagation>
			<h3>Test Prompt with {selectedLLM === 'chatgpt' ? 'ChatGPT' : 'Claude'}</h3>
			<p>Enter your question or request to test this prompt:</p>
			<textarea
				bind:value={userQuery}
				placeholder="e.g., Create a practice quiz for algebra..."
				autofocus
			></textarea>
			<div class="modal-actions">
				<button type="button" class="secondary" on:click={closeQueryModal}>Cancel</button>
				<button type="button" class="primary" on:click={executeWithQuery} disabled={!userQuery.trim()}>
					Test in {selectedLLM === 'chatgpt' ? 'ChatGPT' : 'Claude'}
				</button>
			</div>
		</div>
	</div>
{/if} -->


<style>
	.prompt-generator {
		margin: 20px;
	}

	.header-with-intent {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.header-with-intent h2 {
		margin: 0;
	}

	.intent-selector {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.intent-selector label {
		font-weight: bold;
		color: #333;
	}

	.intent-selector select {
		padding: 8px 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: white;
		font-size: 14px;
		min-width: 180px;
		cursor: pointer;
	}

	.intent-selector select:focus {
		outline: none;
		border-color: #007cba;
		box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
	}

	.editing-prompt-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: #fff3cd;
		border: 1px solid #ffeaa7;
		border-radius: 8px;
		padding: 15px 20px;
		margin-bottom: 20px;
	}

	.editing-prompt-header h3 {
		margin: 0;
		color: #856404;
		font-size: 16px;
	}

	.cancel-edit-btn {
		background: #6c757d;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		font-size: 14px;
		cursor: pointer;
	}

	.cancel-edit-btn:hover {
		background: #5a6268;
	}
	
	.generator-form {
		max-width: 800px;
		margin-bottom: 30px;
	}

	.prompt-form {
		background: #f8f9fa;
		padding: 20px;
		border-radius: 8px;
		margin-bottom: 20px;
		border: 1px solid #e9ecef;
	}

	
	.generator-form :global(.rich-dropdown) {
		margin-bottom: 15px;
	}
	
	template-preview {
		background: #f5f5f5;
		padding: 15px;
		border-radius: 4px;
		margin: 15px 0;
	}
	
	template-preview pre {
		margin: 0;
		font-size: 12px;
		white-space: pre-wrap;
	}
	
	.variables-form {
		border: 1px solid #eee;
		padding: 15px;
		border-radius: 4px;
		margin: 15px 0;
	}
	
	.variable-input {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}
	
	.variable-input label {
		min-width: 100px;
		font-weight: bold;
	}
	
	.variable-input input {
		flex: 1;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.prompt-name-input {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 15px 0;
	}

	.prompt-name-input label {
		min-width: 100px;
		font-weight: bold;
	}

	.prompt-name-input input {
		flex: 1;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
	}
	
	.generated-prompts {
		margin-top: 30px;
	}
	
	.prompts-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}
	
	.filter-section {
		min-width: 250px;
	}
	
	.prompt-card {
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 15px;
		background: white;
	}
	
	.prompt-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 15px;
	}
	
	.prompt-meta {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: #666;
	}

	.prompt-name-with-expand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.expand-btn-left {
		background: none;
		border: none;
		color: #007cba;
		font-size: 14px;
		font-weight: bold;
		cursor: pointer;
		padding: 4px;
		border-radius: 3px;
		transition: all 0.2s ease;
		min-width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.expand-btn-left:hover {
		background: #e3f2fd;
		color: #005a87;
		transform: scale(1.1);
	}

	.prompt-name-highlight {
		font-size: 18px;
		flex: 1;
	}

	.prompt-name-highlight strong {
		color: #2c3e50;
		font-weight: 700;
		background: linear-gradient(135deg, #ebdf8f, #f4e79a);
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #d4c85a;
	}

	.prompt-template-simple {
		font-size: 14px;
		color: #666;
	}

	.template-simple-link {
		color: #007cba;
		text-decoration: none;
		border: none;
		background: none;
	}


	.template-simple-link:hover {
		color: #005a87;
		text-decoration: underline;
	}
	
	.prompt-actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	
	.icon-btn {
		padding: 6px;
		font-size: 16px;
		border-radius: 4px;
		background: #f8f9fa;
		border: 1px solid #dee2e6;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
	}
	
	.icon-btn:hover {
		background: #e9ecef;
	}
	
	.edit-btn:hover {
		background: #d4edda;
		border-color: #c3e6cb;
	}
	
	.delete-btn:hover {
		background: #f8d7da;
		border-color: #f5c6cb;
	}


	.llm-btn {
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 500;
		border-radius: 4px;
		border: 1px solid;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		transition: all 0.2s ease;
	}

	.chatgpt-btn {
		background: #10a37f;
		color: white;
		border-color: #10a37f;
	}

	.chatgpt-btn:hover {
		background: #0d8a6a;
		border-color: #0d8a6a;
	}

	.claude-btn {
		background: #ff6b35;
		color: white;
		border-color: #ff6b35;
	}

	.claude-btn:hover {
		background: #e55a2b;
		border-color: #e55a2b;
	}

	.perplexity-btn {
		background: #1fb8cd;
		color: white;
		border-color: #1fb8cd;
	}

	.perplexity-btn:hover {
		background: #1a9fb1;
		border-color: #1a9fb1;
	}

	.gemini-btn {
		background: #4285f4;
		color: white;
		border-color: #4285f4;
	}

	.gemini-btn:hover {
		background: #3367d6;
		border-color: #3367d6;
	}

	.llm-instructions {
		color: #666;
		font-size: 14px;
		margin: 0 0 20px 0;
		padding: 10px;
		background: #f8f9fa;
		border-radius: 6px;
		border-left: 4px solid #007cba;
	}
	
	.prompt-content pre {
		background: #f8f8f8;
		padding: 15px;
		border-radius: 4px;
		border-left: 4px solid #007cba;
		white-space: pre-wrap;
		font-size: 14px;
	}
	
	.prompt-values {
		margin-top: 15px;
	}
	
	.value-tag {
		display: inline-block;
		background: #e1f5fe;
		padding: 4px 8px;
		border-radius: 4px;
		margin: 2px;
		font-size: 12px;
	}
	
	button {
		padding: 10px 15px;
		background: #007cba;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
	
	button:hover {
		background: #005a87;
	}

	.button-group {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}

	.evaluate-btn {
		background: #28a745;
		color: white;
		border: 1px solid #28a745;
		padding: 10px 15px;
		border-radius: 4px;
		cursor: pointer;
	}

	.evaluate-btn:hover {
		background: #218838;
		border-color: #1e7e34;
	}

	.evaluate-btn:disabled {
		background: #6c757d;
		border-color: #6c757d;
		cursor: not-allowed;
	}

	.save-btn {
		background: #17a2b8;
		color: white;
		border: 1px solid #17a2b8;
		padding: 10px 15px;
		border-radius: 4px;
		cursor: pointer;
	}

	.save-btn:hover {
		background: #138496;
		border-color: #117a8b;
	}

	.save-btn:disabled {
		background: #6c757d;
		border-color: #6c757d;
		cursor: not-allowed;
	}

	template-link {
		background: none;
		border: none;
		color: #007cba;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		font-size: inherit;
		font-family: inherit;
	}

	template-link:hover {
		background: none;
		color: #005a87;
		text-decoration: none;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: white;
		padding: 30px;
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		max-width: 600px;
		width: 90%;
	}

	.modal h3 {
		margin-top: 0;
		margin-bottom: 20px;
		color: #333;
	}

	.modal textarea {
		width: 100%;
		min-height: 120px;
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: inherit;
		resize: vertical;
		margin-bottom: 20px;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.modal-actions button {
		padding: 10px 20px;
		border-radius: 4px;
		border: 1px solid;
		cursor: pointer;
		font-weight: 500;
	}

	.modal-actions .primary {
		background: #007cba;
		color: white;
		border-color: #007cba;
	}

	.modal-actions .primary:hover {
		background: #005a87;
		border-color: #005a87;
	}

	.modal-actions .secondary {
		background: white;
		color: #666;
		border-color: #ddd;
	}

	.modal-actions .secondary:hover {
		background: #f8f9fa;
	}

	.modal-actions .evaluate-btn {
		background: #28a745;
		color: white;
		border-color: #28a745;
	}

	.modal-actions .evaluate-btn:hover {
		background: #218838;
		border-color: #1e7e34;
	}

	.modal-actions .evaluate-btn:disabled {
		background: #6c757d;
		border-color: #6c757d;
		cursor: not-allowed;
	}

	/* Prompt Preview Modal Specific Styles */
	.prompt-preview-modal {
		width: 90%;
		max-width: 1000px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		padding-bottom: 15px;
		border-bottom: 2px solid #007cba;
	}

	.modal-header h3 {
		margin: 0;
		color: #2c3e50;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 24px;
		color: #666;
		cursor: pointer;
		padding: 0;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 15px;
	}

	.close-btn:hover {
		background: #f0f0f0;
		color: #333;
	}

	.modal-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 20px;
		overflow-y: auto;
	}

	.prompt-name-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.prompt-name-section label {
		font-weight: bold;
		color: #333;
	}

	.prompt-name-section input {
		padding: 10px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 14px;
	}

	.prompt-name-section input:focus {
		outline: none;
		border-color: #007cba;
		box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
	}

	.prompt-content-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.prompt-content-section label {
		font-weight: bold;
		color: #333;
	}

	.prompt-content-section textarea {
		flex: 1;
		padding: 15px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 13px;
		line-height: 1.5;
		resize: vertical;
		min-height: 300px;
	}

	.prompt-content-section textarea:focus {
		outline: none;
		border-color: #007cba;
		box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
	}

	/* Evaluation Results Section */
	.evaluation-results-section {
		border-top: 2px solid #e9ecef;
		padding-top: 20px;
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	.evaluation-results-section h4 {
		margin: 0 0 15px 0;
		color: #28a745;
		font-size: 18px;
		font-weight: 600;
		border-bottom: 1px solid #28a745;
		padding-bottom: 5px;
	}

	.evaluation-grade {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.evaluation-grade label {
		font-weight: bold;
		color: #333;
		font-size: 14px;
	}

	.grade-display {
		background: linear-gradient(135deg, #d4edda, #c3e6cb);
		border: 1px solid #28a745;
		border-radius: 6px;
		padding: 12px 16px;
		font-size: 16px;
		font-weight: 600;
		color: #155724;
		text-align: center;
		min-height: 20px;
	}

	.evaluation-suggestion {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.evaluation-suggestion label {
		font-weight: bold;
		color: #333;
		font-size: 14px;
	}

	.evaluation-suggestion textarea {
		flex: 1;
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 13px;
		line-height: 1.5;
		background: #f8f9fa;
		color: #495057;
		resize: vertical;
		min-height: 150px;
	}

	.evaluation-suggestion textarea:focus {
		outline: none;
		border-color: #28a745;
		box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
	}

	/* Inline Prompt Display Styles */
	.inline-prompt-display {
		margin-top: 30px;
		padding: 20px;
		background: #f8f9fa;
		border-radius: 8px;
		border: 1px solid #e9ecef;
	}

	.prompt-results-container {
		display: flex;
		gap: 20px;
		width: 100%;
	}

	.generated-prompt-section,
	.suggested-prompt-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		background: white;
		border-radius: 6px;
		padding: 15px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 15px;
		padding-bottom: 10px;
		border-bottom: 2px solid #e9ecef;
	}


	.section-header h4 {
		margin: 0;
		color: #2c3e50;
		font-size: 16px;
		font-weight: 600;
	}

	.generated-prompt-section .section-header {
		border-bottom-color: #007cba;
	}

	.suggested-prompt-section .section-header {
		border-bottom-color: #28a745;
	}

	.generated-prompt-section h4 {
		color: #007cba;
	}

	.suggested-prompt-section h4 {
		color: #28a745;
	}



	.inline-prompt-display textarea {
		flex: 1;
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 13px;
		line-height: 1.5;
		resize: vertical;
		min-height: 300px;
	}

	.generated-prompt-section textarea {
		background: #fff;
		color: #2c3e50;
	}

	.generated-prompt-section textarea:focus {
		outline: none;
		border-color: #007cba;
		box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
	}

	.suggested-prompt-section textarea {
		background: #f8f9fa;
		color: #495057;
	}

	.suggested-prompt-section textarea:focus {
		outline: none;
		border-color: #28a745;
		box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
	}

	/* Responsive design */
	@media (max-width: 1024px) {
		.prompt-results-container {
			flex-direction: column;
		}

		.generated-prompt-section,
		.suggested-prompt-section {
			flex: none;
		}

		.button-group {
			flex-direction: column;
			align-items: stretch;
		}

		.button-group button {
			width: 100%;
		}
	}
</style>