# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Promptly is a SvelteKit-based web application for prompt management, featuring user authentication, profile management, persona creation, template management, and prompt generation. The application uses TypeScript and communicates with a backend API.

## Development Commands

- `npm run dev` - Start development server on port 5175
- `npm run build` - Build the application for production
- `npm run preview` - Preview the built application

## Architecture Overview

### Core Data Flow
The application follows a hierarchical structure: Users → Profiles → Personas → Templates → Prompts
- Users authenticate via Google OAuth (Cognito)
- Each user can have multiple profiles with different attributes
- Profiles contain personas (user/LLM role pairs)
- Templates are associated with personas and contain variables
- Prompts are generated from templates with specific variable values

### Key Components Structure
- **Layout System**: `+layout.svelte` handles authentication UI and global layout
- **Main App**: `+page.svelte` provides tabbed interface for profile/persona/template/prompt management
- **Managers**: Dedicated Svelte components for each entity type (ProfileManager, PersonaManager, TemplateManager, PromptGenerator)
- **API Layer**: Centralized in `src/lib/api.ts` with typed interfaces
- **State Management**: Svelte stores for auth (`authStore.ts`) and profile selection (`profileStore.ts`)

### Authentication Flow
- Users sign in via Google OAuth through backend endpoint `/api/auth/login`
- Auth state managed by `authStore` with user profile pictures and names displayed
- Auth check performed on app mount via `/v1/api/auth/me`
- Logout handled via `/v1/api/auth/logout`

### API Communication
- Base path: `/v1` (proxied to backend in development via Vite config)
- All API calls centralized in `src/lib/api.ts` with proper error handling
- API proxy target configurable via `VITE_API_PROXY_TARGET` environment variable
- Credentials included in requests for session management

### Environment Configuration
- `VITE_PUBLIC_BACKEND_API_BASE_URL` - Backend API base URL for client-side use
- `VITE_API_PROXY_TARGET` - Development proxy target (defaults to http://localhost:8082)

### Key Data Types
```typescript
interface Profile {
  id: string;
  name: string;
  description: string;
  attributes: { /* age, location, education, etc */ };
}

interface Persona {
  persona_id: string;
  profile_id: string;
  user_role_display: string;
  llm_role_display: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  persona_id: string;
  version: number;
  meta_role: string;
  task: string;
  answer_guideline: string;
  template: string;
  variables: string[];
}
```

### Multi-Profile System
- Profile selector in header allows switching between user profiles
- Selected profile stored in `profileStore` and used throughout the application
- Personas, templates, and prompts are all scoped to the selected profile
- Profile attributes include demographics, preferences, and expertise levels

### Component Dependencies
- Most manager components depend on having a selected profile
- Tab navigation disables persona/template/prompt tabs when no profile selected
- Profile selection triggers re-loading of associated data in other components