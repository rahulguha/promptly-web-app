// In development, Vite's proxy will forward requests from /v1 to the API server.
// In production, we use the full API URL directly.
// const API_BASE = import.meta.env.PROD
//  ? import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL || "/v1"
//   : import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL || "/v1";
const API_BASE = import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL || "/v1";

console.log("PROD:", import.meta.env.PROD);
console.log("ENV VAR:", import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL);
console.log("API_BASE:", API_BASE);

export interface Persona {
  persona_id: string;
  profile_id: string;
  user_role_display: string;
  llm_role_display: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  attributes: {
    gender?: string;
    age?: number;
    location?: {
      city?: string;
      state?: string;
      country?: string;
      postal_code?: string;
    };
    education_level?: string;
    occupation?: string;
    interests?: string[];
    expertise_level?: string;
    tone_preference?: string;
    preferred_languages?: string[];
    intent?: string;
  };
}

export interface PromptTemplate {
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

export interface Prompt {
  id: string;
  name: string;
  template_id: string;
  template_version: number;
  variable_values: Record<string, string>;
  content: string;
  profile_id: string;
}

export interface Intent {
  intent: string; // This is the ID field in the API response
  name: string;
  description: string;
  system_prompt: string;
  keywords: string[];
  tag: string;
}

export interface TrackActivityRequest {
  user_id: string;
  email: string;
  timestamp: number;
  activity_type: string;
  activity_result: string;
  activity_details?: Record<string, string>;
}

export interface TrackActivityResponse {
  message: string;
}

export interface PromptEvaluationRequest {
  prompt: string;
}

export interface PromptEvaluationResponse {
  inputGrade: string;
  suggestedPrompt: string;
  improvedGrade: string;
}

// Define a type for our API request options that allows a structured body.
type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function getAuthHeaders() {
  const token = localStorage.getItem("jwt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  // Add JWT token to all requests
  const authHeaders = getAuthHeaders();
  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const fetchOptions: RequestInit = {
    method: options.method,
    headers: options.headers,
    mode: options.mode,
    credentials: options.credentials,
    cache: options.cache,
    redirect: options.redirect,
    referrerPolicy: options.referrerPolicy,
    signal: options.signal,
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
    headers.set("Content-Type", "application/json");
  }

  fetchOptions.headers = headers;

  const res = await fetch(`${API_BASE}${endpoint}`, fetchOptions);

  if (!res.ok) {
    if (res.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem("jwt_token");
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      throw new Error("Authentication required");
    }

    let message = `HTTP error! status: ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) {
        message = body.error;
      }
    } catch (e) {
      // Not a JSON error response, or no body
    }
    throw new Error(message);
  }

  // For DELETE requests, we don't expect a JSON body in the success response.
  if (options.method?.toUpperCase() === "DELETE" || res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export const api = {
  // Personas
  getPersonas(profile_id: string): Promise<Persona[]> {
    return apiRequest(`/personas?profile_id=${profile_id}`);
  },

  createPersona(
    persona: Omit<Persona, "persona_id">,
    profile_id: string
  ): Promise<Persona> {
    return apiRequest("/personas", {
      method: "POST",
      body: { ...persona, profile_id },
    });
  },

  updatePersona(
    id: string,
    persona: Omit<Persona, "persona_id">
  ): Promise<Persona> {
    return apiRequest(`/personas/${id}`, { method: "PUT", body: persona });
  },

  deletePersona(id: string): Promise<void> {
    return apiRequest(`/personas/${id}`, { method: "DELETE" });
  },

  // Profiles
  getProfiles(): Promise<Profile[]> {
    return apiRequest("/profiles");
  },

  createProfile(profile: Omit<Profile, "id">): Promise<Profile> {
    return apiRequest("/profiles", { method: "POST", body: profile });
  },

  updateProfile(id: string, profile: Omit<Profile, "id">): Promise<Profile> {
    return apiRequest(`/profiles/${id}`, { method: "PUT", body: profile });
  },

  deleteProfile(id: string): Promise<void> {
    return apiRequest(`/profiles/${id}`, { method: "DELETE" });
  },

  // Templates
  getTemplates(profile_id: string): Promise<PromptTemplate[]> {
    return apiRequest(`/templates?profile_id=${profile_id}`);
  },

  createTemplate(
    template: Omit<PromptTemplate, "id">
  ): Promise<PromptTemplate> {
    return apiRequest("/templates", { method: "POST", body: template });
  },

  updateTemplate(
    id: string,
    template: Omit<PromptTemplate, "id">
  ): Promise<PromptTemplate> {
    return apiRequest(`/templates/${id}`, { method: "PUT", body: template });
  },

  createTemplateVersion(
    id: string,
    template: Omit<PromptTemplate, "id" | "version">
  ): Promise<PromptTemplate> {
    return apiRequest(`/templates/${id}/version`, {
      method: "POST",
      body: template,
    });
  },

  deleteTemplate(id: string, version: number): Promise<void> {
    return apiRequest(`/templates/${id}?version=${version}`, {
      method: "DELETE",
    });
  },

  // Prompts
  generatePrompt(
    name: string,
    content: string,
    templateId: string,
    variables: Record<string, string>,
    profileId: string
  ): Promise<Prompt> {
    // Parse template ID and version
    const [template_id, versionStr] = templateId.split(":");
    const template_version = parseInt(versionStr);

    console.log("API generatePrompt called with:", {
      name,
      templateId,
      template_id,
      template_version,
      variables,
      profileId,
    });

    return apiRequest("/generate-prompt", {
      method: "POST",
      body: {
        name: name,
        content: content,
        template_id: template_id,
        template_version: template_version,
        variable_values: variables,
        profile_id: profileId,
      },
    });
  },

  getPrompts(profile_id: string): Promise<Prompt[]> {
    return apiRequest(`/prompts?profile_id=${profile_id}`);
  },

  updatePrompt(id: string, prompt: Omit<Prompt, "id">): Promise<Prompt> {
    return apiRequest(`/prompts/${id}`, { method: "PUT", body: prompt });
  },

  deletePrompt(id: string): Promise<void> {
    return apiRequest(`/prompts/${id}`, { method: "DELETE" });
  },

  // Intents
  getIntents(): Promise<Intent[]> {
    return apiRequest("/intents");
  },

  // Activity Tracking
  trackActivity(request: TrackActivityRequest): Promise<TrackActivityResponse> {
    return apiRequest("/track/activity", {
      method: "POST",
      body: request,
    });
  },

  // Prompt Evaluation
  evaluatePrompt(
    request: PromptEvaluationRequest
  ): Promise<PromptEvaluationResponse> {
    return apiRequest("/prompts/evaluate", {
      method: "POST",
      body: request,
    });
  },
};
