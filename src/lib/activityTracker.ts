import { api, type TrackActivityRequest } from './api';

// Activity types from environment
export const ACTIVITY_TYPES = {
  LOGOUT: 'Logout',
  PROFILE_CREATED: 'Profile_Created',
  PROFILE_UPDATED: 'Profile_Updated',
  PERSONA_CREATED: 'Persona_Created',
  PERSONA_UPDATED: 'Persona_Updated',
  TEMPLATE_CREATED: 'Template_Created',
  TEMPLATE_UPDATED: 'Template_Updated',
  PROMPT_CREATED: 'Prompt_Created',
  PROMPT_EXECUTED_CHATGPT: 'Prompt_Executed_ChatGPT',
  PROMPT_EXECUTED_CLAUDE: 'Prompt_Executed_Claude',
  PROMPT_EXECUTED_GEMINI: 'Prompt_Executed_Gemini',
  PROMPT_EXECUTED_PERPLEXITY: 'Prompt_Executed_Perplexity',
} as const;

export type ActivityType = typeof ACTIVITY_TYPES[keyof typeof ACTIVITY_TYPES];

export const ACTIVITY_RESULTS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  PARTIAL: 'partial',
} as const;

export type ActivityResult = typeof ACTIVITY_RESULTS[keyof typeof ACTIVITY_RESULTS];

interface User {
  id?: string;
  sub?: string;
  user_id?: string;  // Added to match auth system
  email?: string;
  name?: string;     // Added to match auth system
  picture?: string;  // Added to match auth system
  [key: string]: any;
}

interface TrackActivityParams {
  user: User;
  activityType: ActivityType;
  activityResult: ActivityResult;
  activityDetails?: Record<string, string>;
}

export class ActivityTracker {
  private static instance: ActivityTracker;
  private isEnabled: boolean = true;

  private constructor() {}

  public static getInstance(): ActivityTracker {
    if (!ActivityTracker.instance) {
      ActivityTracker.instance = new ActivityTracker();
    }
    return ActivityTracker.instance;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public async track({
    user,
    activityType,
    activityResult,
    activityDetails = {}
  }: TrackActivityParams): Promise<boolean> {
    if (!this.isEnabled) {
      console.log('Activity tracking is disabled');
      return true;
    }

    try {
      // Validate required user data
      if (!user || (!user.id && !user.sub && !user.user_id) || !user.email) {
        console.warn('Activity tracking skipped: Missing required user data', { user });
        return false;
      }

      const userId = user.id || user.sub || user.user_id || '';
      const email = user.email || '';

      const request: TrackActivityRequest = {
        user_id: userId,
        email: email,
        timestamp: Date.now(),
        activity_type: activityType,
        activity_result: activityResult,
        activity_details: activityDetails
      };

      const response = await api.trackActivity(request);
      return true;

    } catch (error) {
      console.error('Failed to track activity:', error);
      // Don't throw - activity tracking should not break the main flow
      return false;
    }
  }

  // Convenience methods for common activities
  public async trackLogout(user: User): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.LOGOUT,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
    });
  }

  public async trackProfileCreated(user: User, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.PROFILE_CREATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: profileId ? { profile_id: profileId } : undefined,
    });
  }

  public async trackProfileUpdated(user: User, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.PROFILE_UPDATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: profileId ? { profile_id: profileId } : undefined,
    });
  }

  public async trackPersonaCreated(user: User, personaId?: string, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.PERSONA_CREATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: {
        ...(personaId && { persona_id: personaId }),
        ...(profileId && { profile_id: profileId }),
      },
    });
  }

  public async trackPersonaUpdated(user: User, personaId?: string, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.PERSONA_UPDATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: {
        ...(personaId && { persona_id: personaId }),
        ...(profileId && { profile_id: profileId }),
      },
    });
  }

  public async trackTemplateCreated(user: User, templateId?: string, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.TEMPLATE_CREATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: {
        ...(templateId && { template_id: templateId }),
        ...(profileId && { profile_id: profileId }),
      },
    });
  }

  public async trackTemplateUpdated(user: User, templateId?: string, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.TEMPLATE_UPDATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: {
        ...(templateId && { template_id: templateId }),
        ...(profileId && { profile_id: profileId }),
      },
    });
  }

  public async trackPromptCreated(user: User, promptId?: string, profileId?: string): Promise<boolean> {
    return this.track({
      user,
      activityType: ACTIVITY_TYPES.PROMPT_CREATED,
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: {
        ...(promptId && { prompt_id: promptId }),
        ...(profileId && { profile_id: profileId }),
      },
    });
  }

  public async trackPromptExecuted(user: User, llmType: 'chatgpt' | 'claude' | 'gemini' | 'perplexity', promptId?: string): Promise<boolean> {
    const activityTypeMap = {
      chatgpt: ACTIVITY_TYPES.PROMPT_EXECUTED_CHATGPT,
      claude: ACTIVITY_TYPES.PROMPT_EXECUTED_CLAUDE,
      gemini: ACTIVITY_TYPES.PROMPT_EXECUTED_GEMINI,
      perplexity: ACTIVITY_TYPES.PROMPT_EXECUTED_PERPLEXITY,
    };

    return this.track({
      user,
      activityType: activityTypeMap[llmType],
      activityResult: ACTIVITY_RESULTS.SUCCESS,
      activityDetails: {
        llm_platform: llmType,
        ...(promptId && { prompt_id: promptId }),
      },
    });
  }

  // Error tracking methods
  public async trackError(user: User, activityType: ActivityType, error: string, details?: Record<string, string>): Promise<boolean> {
    return this.track({
      user,
      activityType,
      activityResult: ACTIVITY_RESULTS.FAILURE,
      activityDetails: {
        error_message: error,
        ...details,
      },
    });
  }
}

// Export singleton instance
export const activityTracker = ActivityTracker.getInstance();