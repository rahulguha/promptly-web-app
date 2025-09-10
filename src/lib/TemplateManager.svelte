<script lang="ts">
	import { api, type PromptTemplate, type Persona } from './api.js';
	import { onMount } from 'svelte';
	import RichDropdown from './RichDropdown.svelte';

	import { selectedProfile } from './stores/profileStore';
	import type { Profile } from '$lib/api';
	import { authStore } from './stores/authStore';
	import { activityTracker, ACTIVITY_TYPES } from './activityTracker';

	let templates: PromptTemplate[] = [];
	let personas: Persona[] = [];
	let showForm = false;
	let editingTemplate: PromptTemplate | null = null;
	let creatingVersion = false;
	let newTemplate = {
		name: '',
		persona_id: '',
		task: '',
		answer_guideline: '',
		variables: ['']
	};

	let calculatedTemplate = '';
	let currentProfile: Profile | null = null;
	let currentUser: any = null;

	selectedProfile.subscribe(value => {
		currentProfile = value;
	});

	// Subscribe to auth state to get current user
	authStore.subscribe(state => {
		currentUser = state.user;
	});

	$: {
		if (currentProfile) {
			loadTemplatesAndPersonas(currentProfile.id);
		} else {
			templates = [];
			personas = [];
		}
	}

	async function loadTemplatesAndPersonas(profileId: string) {
		try {
			console.log('Loading templates and personas for profile:', profileId);
			const [templatesData, personasData] = await Promise.all([
				api.getTemplates(profileId),
				api.getPersonas(profileId)
			]);
			console.log('Loaded templates:', templatesData);
			console.log('Loaded personas:', personasData);
			templates = templatesData || []; // Ensure it's never null/undefined
			personas = personasData || []; // Ensure it's never null/undefined
		} catch (error) {
			console.error('Failed to load data:', error);
			templates = []; // Fallback to empty array on error
			personas = []; // Fallback to empty array on error
		}
	}

	$: {
		const selectedPersona = personas ? personas.find(p => p.persona_id === newTemplate.persona_id) : null;
		const metaRole = selectedPersona ? `I am a ${selectedPersona.user_role_display}.\nYou are a ${selectedPersona.llm_role_display}. 
Please respond clearly, in a way that fits my background as a ${selectedPersona.user_role_display}, 
while staying in your role as a ${selectedPersona.llm_role_display}.` : '';
		
		let templateParts = [];
		if (metaRole) {
			templateParts.push(`[Meta Role]
${metaRole}`);
		}
		if (newTemplate.task) {
			templateParts.push(`[Task]
${newTemplate.task}`);
		}
		if (newTemplate.answer_guideline) {
			templateParts.push(`[Answer Guideline]
${newTemplate.answer_guideline}`);
		}
		calculatedTemplate = templateParts.join('\n\n');
	}

	function extractVariables(text: string): string[] {
		const regex = /\{\{([^}]+)\}\}/g;
		const matches = text.match(regex);
		if (matches) {
			return [...new Set(matches.map(match => match.substring(2, match.length - 2).trim()))];
		}
		return [];
	}

	$: {
		const taskVars = extractVariables(newTemplate.task);
		const guidelineVars = extractVariables(newTemplate.answer_guideline);
		const allVars = [...new Set([...taskVars, ...guidelineVars])];
		
		// Only update if the variables have actually changed to avoid infinite loops
		if (JSON.stringify(allVars) !== JSON.stringify(newTemplate.variables)) {
			newTemplate.variables = allVars;
		}
	}

	function addVariable() {
		newTemplate.variables = [...newTemplate.variables, ''];
	}

	function removeVariable(index: number) {
		newTemplate.variables = newTemplate.variables.filter((_, i) => i !== index);
	}

	async function createTemplate() {
		try {
			console.log('Creating template with data:', newTemplate);
			console.log('Current templates before create:', templates);
			
			const variables = newTemplate.variables.filter(v => v.trim());
			
			// Validate that {{query}} variable is required
			if (!variables.includes('query')) {
				alert('Templates must include a {{query}} variable. Please add "query" to the variables list.');
				return;
			}
			
			const created = await api.createTemplate({
				...newTemplate,
				variables
			});
			console.log('Created template response:', created);
			
			if (created) {
				// Track successful template creation
				if (currentUser) {
					await activityTracker.trackTemplateCreated(currentUser, created.id, currentProfile?.id);
				}
				
				// Ensure templates is an array before spreading
				if (!Array.isArray(templates)) {
					console.warn('templates is not an array, resetting to empty array:', templates);
					templates = [];
				}
				templates = [...templates, created];
				console.log('Updated templates:', templates);
				dispatchEvent('templateCreated', created);
				resetForm();
			} else {
				console.error('Failed to create template: No data returned');
				// Track failure
				if (currentUser) {
					await activityTracker.trackError(currentUser, ACTIVITY_TYPES.TEMPLATE_CREATED, 'No data returned from API');
				}
			}
		} catch (error) {
			console.error('Error creating template:', error);
			// Track error
			if (currentUser) {
				await activityTracker.trackError(currentUser, ACTIVITY_TYPES.TEMPLATE_CREATED, `Template creation error: ${error}`);
			}
		}
	}

	async function updateTemplate() {
		if (!editingTemplate) return;
		
		try {
			const variables = newTemplate.variables.filter(v => v.trim());
			
			// Validate that {{query}} variable is required
			if (!variables.includes('query')) {
				alert('Templates must include a {{query}} variable. Please add "query" to the variables list.');
				return;
			}
			
			let updated;
			if (creatingVersion) {
				// Create new version
				updated = await api.createTemplateVersion(editingTemplate.id, {
					persona_id: newTemplate.persona_id,
					task: newTemplate.task,
					answer_guideline: newTemplate.answer_guideline,
					variables
				});
				templates = [...templates, updated];
			} else {
				// Update existing template
				updated = await api.updateTemplate(editingTemplate.id, {
					name: newTemplate.name,
					persona_id: newTemplate.persona_id,
					version: editingTemplate.version,
					task: newTemplate.task,
					answer_guideline: newTemplate.answer_guideline,
					variables
				});
				templates = templates.map(t => t.id === updated.id && t.version === updated.version ? updated : t);
			}
			
			// Track successful template update
			if (currentUser && updated) {
				await activityTracker.trackTemplateUpdated(currentUser, updated.id, currentProfile?.id);
			}
			
			resetForm();
		} catch (error) {
			console.error('Error updating template:', error);
			// Track error
			if (currentUser) {
				await activityTracker.trackError(currentUser, ACTIVITY_TYPES.TEMPLATE_UPDATED, `Template update error: ${error}`);
			}
		}
	}

	async function deleteTemplate(template: PromptTemplate) {
		const personaDisplay = getPersonaDisplay(template.persona_id);
		if (confirm(`Delete template v${template.version} for ${personaDisplay}?`)) {
			await api.deleteTemplate(template.id, template.version);
			templates = templates.filter(t => !(t.id === template.id && t.version === template.version));
		}
	}

	function editTemplate(template: PromptTemplate) {
		editingTemplate = template;
		creatingVersion = false;
		newTemplate = {
			name: template.name,
			persona_id: template.persona_id,
			task: template.task,
			answer_guideline: template.answer_guideline,
			variables: [...template.variables]
		};
		showForm = true;
	}

	function createNewVersion(template: PromptTemplate) {
		editingTemplate = template;
		creatingVersion = true;
		newTemplate = {
			name: template.name,
			persona_id: template.persona_id,
			task: template.task,
			answer_guideline: template.answer_guideline,
			variables: [...template.variables]
		};
		showForm = true;
	}

	function resetForm() {
		newTemplate = { name: '', persona_id: '', task: '', answer_guideline: '', variables: [''] };
		editingTemplate = null;
		creatingVersion = false;
		showForm = false;
	}

	function getPersonaDisplay(personaId: string) {
		const persona = personas.find(p => p.persona_id === personaId);
		return persona ? `${persona.user_role_display} → ${persona.llm_role_display}` : 'Unknown';
	}
	
	$: personaOptions = personas ? personas.map(persona => ({
		value: persona.persona_id,
		display: `${persona.user_role_display} → ${persona.llm_role_display}`,
		meta: `${persona.user_role} → ${persona.llm_role}`,
		user_role: persona.user_role,
		llm_role: persona.llm_role
	})) : [];
</script>

<div class="template-manager">
	<h2>Templates</h2>
	
	<button onclick={() => showForm = !showForm}>
		{showForm ? 'Cancel' : 'Add Template'}
	</button>

	{#if showForm}
		<div class="form-header">
			<h3>
				{#if creatingVersion}
					Creating New Version of Template (v{editingTemplate?.version}) 
				{:else if editingTemplate}
					Editing Template (v{editingTemplate?.version})
				{:else}
					Create New Template
				{/if}
			</h3>
		</div>
		<form onsubmit={(e) => { e.preventDefault(); editingTemplate ? updateTemplate() : createTemplate(); }} class="template-form">
			<input type="text" bind:value={newTemplate.name} placeholder="Template Name" required />

			<RichDropdown 
				items={personaOptions}
				bind:selectedValue={newTemplate.persona_id}
				placeholder="Select Persona"
			/>

			<textarea 
				bind:value={newTemplate.task} 
				placeholder="Task"
				rows="4"
				required
			></textarea>

			<textarea 
				bind:value={newTemplate.answer_guideline} 
				placeholder="Answer Guideline"
				rows="4"
				required
			></textarea>

			<div class="variables-section">
				<h4>Detected Variables</h4>
				{#if newTemplate.variables.length > 0}
					<div class="variable-tags">
						{#each newTemplate.variables as variable}
							<span class="variable-tag">{variable}</span>
						{/each}
					</div>
				{:else}
					<p>No variables detected. Use {'{{variable_name}}'} in your task or guideline.</p>
				{/if}
			</div>

			<div class="readonly-template">
				<h4>Generated Template</h4>
				<pre>{calculatedTemplate}</pre>
			</div>

			<button type="submit">
				{#if creatingVersion}
					Create New Version
				{:else if editingTemplate}
					Update Template
				{:else}
					Create Template
				{/if}
			</button>
			{#if editingTemplate}
				<button type="button" onclick={resetForm}>Cancel Edit</button>
			{/if}
		</form>
	{/if}

	<div class="templates-list">
		{#each templates as template}
			<div class="template-item">
				<div class="template-actions">
					<button class="icon-btn edit-btn" onclick={() => editTemplate(template)} title="Edit">
						✏️
					</button>
					<button class="icon-btn version-btn" onclick={() => createNewVersion(template)} title="Create new Version">
						📝
					</button>
					<button class="icon-btn delete-btn" onclick={() => deleteTemplate(template)} title="Delete">
						🗑️
					</button>
				</div>
				<div class="template-display">
					<div class="template-name">{template.name} <span class="template-version">v{template.version}</span></div>
					<!-- <div class="template-persona">{getPersonaDisplay(template.persona_id)}</div> -->
					<div class="template-preview">{template.template.slice(0, 80)}...</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.template-manager {
		margin: 20px;
	}

	.form-header {
		margin: 20px 0 10px 0;
	}

	.form-header h3 {
		color: #007cba;
		margin: 0;
		font-size: 18px;
	}
	
	.template-form {
		display: flex;
		flex-direction: column;
		gap: 15px;
		max-width: 600px;
		margin: 20px 0;
	}
	
	.template-form select,
	.template-form textarea {
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
	}
	
	.variables-section {
		border: 1px solid #eee;
		padding: 15px;
		border-radius: 4px;
	}
	
	.variable-input {
		display: flex;
		gap: 10px;
		margin-bottom: 10px;
	}
	
	.variable-input input {
		flex: 1;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.variable-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.variable-tag {
		background-color: #e0e0e0;
		padding: 4px 8px;
		border-radius: 4px;
		font-family: monospace;
	}

	.readonly-template {
		border: 1px solid #eee;
		padding: 15px;
		border-radius: 4px;
		background-color: #f8f8f8;
	}

	.readonly-template pre {
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	
	.templates-list {
		margin-top: 20px;
	}
	
	.template-item {
		display: flex;
		align-items: center;
		gap: 15px;
		padding: 12px 15px;
		border-bottom: 1px solid #eee;
		background: white;
	}
	
	.template-item:hover {
		background: #f8f8f8;
	}
	
	.template-actions {
		display: flex;
		gap: 8px;
	}
	
	.template-display {
		flex: 1;
	}
	
	.template-name {
		font-size: 14px;
		font-weight: bold;
		color: #007cba;
		margin-bottom: 4px;
	}

	.template-version {
		font-size: 12px;
		font-weight: normal;
		color: #28a745;
	}

	.template-persona {
		font-size: 14px;
		font-weight: bold;
		color: #007cba;
		margin-bottom: 4px;
	}
	
	.template-preview {
		font-size: 12px;
		color: #666;
		font-style: italic;
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

	.version-btn:hover {
		background: #d1ecf1;
		border-color: #bee5eb;
	}
	
	.delete-btn:hover {
		background: #f8d7da;
		border-color: #f5c6cb;
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
	
	button[type="button"] {
		background: #666;
	}
	
	button[type="button"]:hover {
		background: #444;
	}
</style>