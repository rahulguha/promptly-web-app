<script lang="ts">
	import { api, type PromptTemplate, type Prompt, type Persona, type Intent, type PromptEvaluationResponse } from './api.js';
	import { onMount } from 'svelte';
	import RichDropdown from './RichDropdown.svelte';

	import { selectedProfile } from './stores/profileStore';
	import { eventBus } from './stores/eventBus';
	import type { Profile } from '$lib/api';
	import { authStore } from './stores/authStore';
	import { activityTracker, ACTIVITY_TYPES } from './activityTracker';
	import './styles/prompt-components.css';
	import { browser } from '$app/environment';

	let templates: PromptTemplate[] = [];
	let personas: Persona[] = [];
	let generatedPrompts: Prompt[] = [];
	let intents: Intent[] = [];
	let selectedTemplateId = '';
	let selectedTemplateVersion = 1;
	export let selectedIntentId = '';
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
	let liveTemplatePreview = '';
	let previewTextarea: HTMLTextAreaElement;

	// Reactive statement to update live preview as variables change
	$: {
		if (selectedTemplate && currentProfile) {
			const systemPrompt = generateSystemPrompt(currentProfile, selectedIntentId, selectedTemplate);
			let content = cleanTemplateContent(selectedTemplate.template);

			// Replace variables with their current values
			for (const [variable, value] of Object.entries(variables)) {
				const placeholder = `{{${variable}}}`;
				content = content.replaceAll(placeholder, value || placeholder);
			}

			liveTemplatePreview = systemPrompt + '\n' + content;

			// Scroll to the [User Section] (Task area) after preview updates
			if (previewTextarea && browser) {
				setTimeout(() => {
					const userSectionIndex = liveTemplatePreview.indexOf('[User Section]');
					if (userSectionIndex !== -1) {
						// Calculate approximate line position
						const textBeforeUserSection = liveTemplatePreview.substring(0, userSectionIndex);
						const linesBefore = textBeforeUserSection.split('\n').length;
						const lineHeight = 24; // Approximate line height in pixels
						const scrollPosition = Math.max(0, (linesBefore - 2) * lineHeight);
						previewTextarea.scrollTop = scrollPosition;
					}
				}, 10);
			}
		} else {
			liveTemplatePreview = '';
		}
	}

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

	eventBus.subscribe(async event => {
		if (event && (event.event === 'personaCreated' || event.event === 'templateCreated')) {
			if (currentProfile) {
				loadData(currentProfile.id);
			}
		}
		if (event && event.event === 'editPrompt' && event.data) {
			// Load the prompt for editing - wait for data to load first
			const prompt = event.data;
			if (currentProfile) {
				await loadData(currentProfile.id);
			}
			// Wait a bit for reactive updates
			setTimeout(() => {
				editPrompt(prompt);
			}, 100);
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
			const [promptsData, templatesData, personasData] = await Promise.all([
				api.getPrompts(profileId),
				api.getTemplates(profileId),
				api.getPersonas(profileId)
			]);
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

		// Validate that query variable is populated (only if query exists in variables)
		if ('query' in variables && (!variables.query || !variables.query.trim())) {
			alert('Please fill in the {{query}} field before generating a prompt.');
			return;
		}

		try {
			if (editingPrompt) {
				updatePrompt();
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
		editingPrompt = prompt;
		let templateKey = `${prompt.template_id}:${prompt.template_version}`;

		// Find the template - first try exact version match
		let template = templates.find(t => t.id === prompt.template_id && t.version === prompt.template_version);

		// If not found, try to find any version of this template (fallback for data inconsistency)
		if (!template) {
			template = templates.find(t => t.id === prompt.template_id);
			if (template) {
				templateKey = `${template.id}:${template.version}`;
			}
		}

		if (template) {
			selectedTemplateId = templateKey;
			selectedTemplate = template;
			displayedVariables = extractVariables(template.template);
			variables = { ...prompt.variable_values || {} };
			promptName = prompt.name;
			showEditForm = true;
		} else {
			alert('Cannot edit prompt: Template not found. Please refresh and try again.');
		}
	}

	function updatePrompt() {
		if (!editingPrompt) return;

		// Try to find exact version match first
		let template = templates.find(t => t.id === editingPrompt.template_id && t.version === editingPrompt.template_version);

		// If not found, try to find any version of this template (fallback for data inconsistency)
		if (!template) {
			template = templates.find(t => t.id === editingPrompt.template_id);
		}

		if (!template) {
			alert('Cannot update prompt: Template not found. Please refresh and try again.');
			return;
		}

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

		// Show results inline instead of saving immediately
		generatedPromptContent = content;
		evaluationResults = null; // Clear previous evaluation results
	}

	async function saveUpdatedPrompt() {
		if (!editingPrompt) return;

		// Find the actual template being used (with fallback for version mismatch)
		let template = templates.find(t => t.id === editingPrompt.template_id && t.version === editingPrompt.template_version);
		if (!template) {
			template = templates.find(t => t.id === editingPrompt.template_id);
		}
		if (!template) {
			alert('Cannot update prompt: Template not found.');
			return;
		}

		// Use the suggested prompt if available, otherwise use the generated prompt
		const promptContent = evaluationResults?.suggestedPrompt || generatedPromptContent;

		const updatedPrompt = await api.updatePrompt(editingPrompt.id, {
			name: promptName,
			template_id: template.id,
			template_version: template.version,  // Use the actual template version
			variable_values: variables,
			content: promptContent
		});

		generatedPrompts = generatedPrompts.map(p => p.id === updatedPrompt.id ? updatedPrompt : p);
		alert('Prompt updated successfully!');
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
		showOriginalPrompt = true;
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


	let showOriginalPrompt = true;

	async function evaluatePrompt() {
		if (!generatedPromptContent.trim()) return;

		try {
			isEvaluating = true;
			evaluationResults = null;

			const response = await api.evaluatePrompt({
				prompt: generatedPromptContent
			});

			evaluationResults = response;

			// Collapse original prompt and show improved version
			if (evaluationResults) {
				showOriginalPrompt = false;
			}

		} catch (error) {
			console.error('Error evaluating prompt:', error);
			alert(`Failed to evaluate prompt: ${error.message}\n\nThis is a server error. Please check the backend logs for more details.`);
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
			// Send name, content, and template info to backend for proper association
			const prompt = await api.generatePrompt(
				promptName,
				suggestedPromptContent,
				selectedTemplateId,
				variables,
				currentProfile.id
			);

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

				alert('Prompt saved successfully!');
			} else {
				console.error('Failed to save prompt: No data returned from API');
				// Track failure
				if (currentUser) {
					await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROMPT_CREATED, 'No data returned from API');
				}
			}
		} catch (error) {
			console.error('Error saving prompt:', error);
			// Track error
			if (currentUser) {
				await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROMPT_CREATED, `Prompt creation error: ${error}`);
			}
		}
	}

</script>

<div class="prompt-generator">
	<div class="generator-form">
		{#if showEditForm && editingPrompt}
			<div class="editing-alert">
				<div class="alert-content">
					<p class="alert-message">You are editing: <strong>{editingPrompt.name}</strong></p>
					<button type="button" class="cancel-link" on:click={resetEditForm}>
						Cancel
					</button>
				</div>
			</div>
		{/if}
		
		<div class="template-section">
			<!-- <h3 class="template-label">📝 Choose Template</h3> -->
			<RichDropdown
				items={templateOptions}
				bind:selectedValue={selectedTemplateId}
				placeholder="Browse available templates..."
			/>
		</div>

		{#if selectedTemplate || (showEditForm && editingPrompt)}
			<div class="prompt-creation-container">
				<div class="creation-form">
					<div class="form-section">
						<div class="prompt-name-field">
							<!-- <label for="prompt-name" class="prompt-name-label">✨ Prompt Name</label> -->
							<input
								id="prompt-name"
								class="form-input prompt-name-input"
								bind:value={promptName}
								placeholder="Prompt Name - e.g., Study Guide Generator, Email Assistant"
								required
							/>
						</div>
					</div>

					<!-- Live Template Preview -->
					{#if liveTemplatePreview}
						<div class="form-section">
							<div class="section-header">
								<h3 class="section-title">👁️ Live Preview</h3>
								<p class="section-subtitle">Focused on Task section where your variables are used</p>
							</div>
							<textarea
								bind:this={previewTextarea}
								class="form-textarea preview-textarea"
								value={liveTemplatePreview}
								readonly
								rows="10"
							></textarea>
						</div>
					{/if}

					{#if displayedVariables.length > 0}
						<div class="form-section">
							<div class="section-header">
								<h3 class="section-title">🔄 Template Variables</h3>
								<!-- <p class="section-subtitle">Fill in the variables to customize your prompt</p> -->
							</div>
							<div class="variables-grid">
								{#each displayedVariables as variable}
									<div class="form-field">
										<label for="var-{variable}" class="field-label">{variable}</label>
										<input
											id="var-{variable}"
											class="form-input"
											bind:value={variables[variable]}
											placeholder={`Enter ${variable.toLowerCase().replace('_', ' ')}`}
										/>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="form-actions">
						<button class="btn btn-primary" on:click={(e) => generatePrompt(e)}>
							{editingPrompt ? 'Update Prompt' : 'Generate Prompt'}
						</button>
						{#if generatedPromptContent}
							<button
								type="button"
								class="btn btn-primary"
								on:click={evaluatePrompt}
								disabled={isEvaluating}
							>
								{isEvaluating ? 'Evaluating...' : 'Improve with LLM'}
							</button>
							{#if editingPrompt}
								<button
									type="button"
									class="btn btn-success"
									on:click={saveUpdatedPrompt}
									disabled={!promptName.trim()}
								>
									Save Updated Prompt
								</button>
							{:else}
								<button
									type="button"
									class="btn btn-success"
									on:click={saveGeneratedPrompt}
									disabled={!promptName.trim() || !evaluationResults?.suggestedPrompt}
								>
									Save Prompt
								</button>
							{/if}
						{/if}
						{#if editingPrompt}
							<button type="button" class="cancel-link" on:click={resetEditForm}>
								Cancel Edit
							</button>
						{/if}
					</div>
				</div>
				{#if generatedPromptContent}
					<div class="prompt-results">
						<div class="results-header">
							<h3 class="results-title">📝 Generated Results</h3>
							<p class="results-subtitle">Review and refine your generated prompt</p>
						</div>

						<div class="results-grid">
							{#if showOriginalPrompt}
								<div class="result-panel">
									<div class="panel-header">
										{#if evaluationResults}
											<button
												class="collapse-btn"
												on:click={() => showOriginalPrompt = false}
												title="Collapse original prompt"
											>
												▼
											</button>
										{/if}
										<div class="panel-header-content">
											<h4 class="panel-title">Your Generated Prompt</h4>
											<p class="panel-subtitle">Edit and customize as needed</p>
										</div>
									</div>
									<textarea
										class="form-textarea result-textarea"
										bind:value={generatedPromptContent}
										placeholder="Generated prompt will appear here..."
										rows="15"
									></textarea>
								</div>
							{:else if evaluationResults}
								<div class="result-panel-collapsed">
									<div class="collapsed-header" on:click={() => showOriginalPrompt = true} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && (showOriginalPrompt = true)}>
										<h4 class="collapsed-title">▶ Your Original Prompt</h4>
										<p class="collapsed-subtitle">Click to expand</p>
									</div>
								</div>
							{/if}

							{#if evaluationResults}
								<div class="result-panel claude-panel" class:expanded={!showOriginalPrompt}>
									<div class="panel-header">
										<h4 class="panel-title">🤖 Claude's Improved Version</h4>
										<p class="panel-subtitle">AI-optimized for better results</p>
									</div>
									<textarea
										class="form-textarea result-textarea claude-textarea"
										value={evaluationResults.suggestedPrompt}
										readonly
										placeholder="Claude's improved prompt will appear here..."
										rows="15"
									></textarea>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

		{/if}
	</div>

	<div class="prompts-library">
		<div class="library-header">
			<div class="header-content">
				<div class="header-text">
					<h3 class="library-title">📋 Your Prompt Library</h3>
					<p class="library-subtitle">
						{filteredPrompts.length === 0 ? 'No prompts generated yet' : `${filteredPrompts.length} prompt${filteredPrompts.length === 1 ? '' : 's'} available`}
					</p>
				</div>
				<div class="filter-section">
					<label class="filter-label">🔍 Filter</label>
					<RichDropdown
						items={filterOptions}
						bind:selectedValue={filterTemplateId}
						placeholder="All templates"
					/>
				</div>
			</div>
			<div class="usage-instructions">
				<div class="instruction-card">
					<div class="instruction-icon">🚀</div>
					<div class="instruction-text">
						<strong>Quick Start:</strong> Click any AI platform button to copy the prompt and open that platform.
						<span class="mobile-only">Then paste (long press → Paste) to use your prompt.</span>
						<span class="desktop-only">Then paste (Ctrl+V) to use your prompt.</span>
					</div>
				</div>
			</div>
		</div>
		{#if filteredPrompts.length === 0}
			<div class="empty-prompts">
				<div class="empty-icon">💡</div>
				<h4>No Prompts Yet</h4>
				<p>Create your first prompt using a template above to get started</p>
			</div>
		{:else}
			<div class="prompts-grid">
				{#each filteredPrompts as prompt}
					<div class="prompt-card">
						<div class="card-header">
							<div class="prompt-info">
								<div class="prompt-title-row">
									<button
										class="expand-toggle"
										on:click={() => togglePromptExpansion(prompt.id)}
										title={expandedPrompts.has(prompt.id) ? 'Collapse' : 'Expand'}
									>
										{expandedPrompts.has(prompt.id) ? '▼' : '▶'}
									</button>
									<h4 class="prompt-title">{prompt.name || 'Unnamed Prompt'}</h4>
								</div>
							</div>
						</div>

						<div class="card-actions actions-right">
							<div class="llm-icons">
								<button 
									class="btn btn-llm chatgpt-icon" 
									on:click={() => directCopyAndOpenLLM(prompt, 'chatgpt')} 
									title="Execute with ChatGPT - Copies prompt and opens ChatGPT"
								>
									🤖
								</button>
								<button 
									class="btn btn-llm claude-icon" 
									on:click={() => directCopyAndOpenLLM(prompt, 'claude')} 
									title="Execute with Claude - Copies prompt and opens Claude"
								>
									🔮
								</button>
								<button 
									class="btn btn-llm gemini-icon" 
									on:click={() => directCopyAndOpenLLM(prompt, 'gemini')} 
									title="Execute with Gemini - Copies prompt and opens Gemini"
								>
									💎
								</button>
								<button 
									class="btn btn-llm perplexity-icon" 
									on:click={() => directCopyAndOpenLLM(prompt, 'perplexity')} 
									title="Execute with Perplexity - Copies prompt and opens Perplexity"
								>
									🧠
								</button>
							</div>
							<div class="divider"></div>
							<button class="btn btn-icon" on:click={() => editPrompt(prompt)} title="Edit prompt">
								✏️
							</button>
							<button class="btn btn-icon delete-btn" on:click={() => deletePrompt(prompt)} title="Delete prompt">
								🗑️
							</button>
						</div>
						{#if expandedPrompts.has(prompt.id)}
							<div class="prompt-details">
								<div class="detail-section">
									<h5 class="detail-title">📝 Final Prompt Content</h5>
									<div class="prompt-content-display">
										<pre class="prompt-text">{prompt.content}</pre>
									</div>
								</div>
								{#if prompt.variable_values && Object.keys(prompt.variable_values).length > 0}
									<div class="detail-section">
										<h5 class="detail-title">🔄 Variable Values Used</h5>
										<div class="variables-display">
											{#each Object.entries(prompt.variable_values) as [key, value]}
												<div class="variable-item">
													<span class="variable-key">{key}:</span>
													<span class="variable-value">{value}</span>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
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
/* Prompt Generator Mobile-First Styles */
.prompt-generator {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  width: 100%;
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

	.expand-toggle {
		background: transparent !important;
		border: none;
		color: var(--color-text-muted);
		font-size: 14px;
		cursor: pointer;
		padding: 4px;
		transition: all 0.2s ease;
		min-width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: var(--space-sm);
	}

	.expand-toggle:hover {
		background: transparent !important;
		color: var(--color-primary);
		transform: scale(1.1);
	}

	.prompt-title-row {
		display: flex;
		align-items: center;
		gap: 0;
		margin-bottom: 6px;
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

	/* Intent Section Styles */
	.intent-section {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.intent-label {
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		margin: 0;
	}

	.intent-select {
		max-width: 300px;
		flex: 0 1 auto;
	}

	/* Template Section Styles */
	.template-section {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: var(--space-sm);
	}

	.template-label {
		font-weight: 600;
		color: var(--color-text);
		white-space: nowrap;
		margin: 0;
		font-size: var(--font-lg);
	}

	.template-section :global(.rich-dropdown) {
		flex: 1;
		max-width: 500px;
	}

	/* Prompt Name Field Styles */
	.form-section {
		margin-bottom: var(--space-sm);
	}

	.prompt-name-field {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: 0;
	}

	.prompt-name-label {
		font-weight: 600;
		color: var(--color-text);
		white-space: nowrap;
		margin: 0;
		font-size: var(--font-lg);
		min-width: 140px;
	}

	.prompt-name-input {
		flex: 1;
		max-width: 500px;
	}

	/* Action Link Styles */
	.action-link {
		background: none;
		border: none;
		color: var(--color-primary);
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		font-size: var(--font-md);
		font-weight: 500;
	}

	.action-link:hover {
		color: var(--color-primary-dark);
		text-decoration: none;
	}

	.action-link:disabled {
		color: var(--color-text-light);
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Cancel Link Styles */
	.cancel-link {
		background: none;
		border: none;
		color: var(--color-text-muted);
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		font-size: var(--font-md);
		font-weight: normal;
	}

	.cancel-link:hover {
		color: var(--color-text);
		text-decoration: none;
	}

	.alert-content {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.alert-message {
		margin: 0;
		flex: 1;
	}

	/* Override button styles with transparent backgrounds */
	:global(.btn-primary) {
		background: transparent !important;
		background-color: transparent !important;
		color: var(--color-text) !important;
		border: 2px solid var(--color-primary) !important;
		box-shadow: none !important;
	}

	:global(.btn-primary:hover) {
		background: rgba(0, 124, 186, 0.05) !important;
		background-color: rgba(0, 124, 186, 0.05) !important;
		border-color: var(--color-primary-dark) !important;
		color: var(--color-text) !important;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
	}

	:global(.btn-success) {
		background: transparent !important;
		background-color: transparent !important;
		color: var(--color-text) !important;
		border: 2px solid var(--color-success) !important;
		box-shadow: none !important;
	}

	:global(.btn-success:hover) {
		background: rgba(76, 175, 80, 0.05) !important;
		background-color: rgba(76, 175, 80, 0.05) !important;
		border-color: var(--color-success-hover) !important;
		color: var(--color-text) !important;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
	}

	/* Collapsed Panel Styles */
	.result-panel-collapsed {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.collapsed-header {
		padding: var(--space-md);
		cursor: pointer;
		transition: all 0.2s ease;
		background: var(--color-background);
		border-left: 4px solid var(--color-primary);
	}

	.collapsed-header:hover {
		background: var(--color-surface);
		border-left-color: var(--color-primary-dark);
	}

	.collapsed-title {
		margin: 0 0 var(--space-xs) 0;
		font-size: var(--font-md);
		color: var(--color-text);
		font-weight: 600;
	}

	.collapsed-subtitle {
		margin: 0;
		font-size: var(--font-sm);
		color: var(--color-text-muted);
	}

	.claude-panel.expanded {
		grid-column: 1 / -1;
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
	}

	.panel-header-content {
		flex: 1;
	}

	.collapse-btn {
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: var(--space-xs) var(--space-sm);
		cursor: pointer;
		color: var(--color-text-muted);
		font-size: var(--font-md);
		transition: all 0.2s ease;
		flex-shrink: 0;
		margin-right: var(--space-xs);
	}

	.collapse-btn:hover {
		background: var(--color-background);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
</style>