import { writable } from 'svelte/store';
import { activityTracker, ACTIVITY_TYPES } from '../activityTracker';

interface User {
  user_id: string;
  name: string;
  email: string;
  picture?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: true, // Start as true to indicate we are checking auth status
};

export const authStore = writable<AuthState>(initialState);

const API_BASE = "/v1/api/auth";

function generateSQLiteFilename(user: User) {
  const filename = `${user.user_id}-${user.email}-promptly.db`;
  console.log('Generated SQLite filename:', filename);
  return filename;
}

// Function to check authentication status (e.g., call /auth/me endpoint)
export async function checkAuthStatus() {
  authStore.update(state => ({ ...state, loading: true }));
  try {
    const response = await fetch(`${API_BASE}/me`, { credentials: 'include' });
    if (response.ok) {
      const user = await response.json();
      generateSQLiteFilename(user); // Generate and log the filename
      authStore.set({ isAuthenticated: true, user, loading: false });
    } else {
      authStore.set({ isAuthenticated: false, user: null, loading: false });
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    authStore.set({ isAuthenticated: false, user: null, loading: false });
  }
}

export async function logoutUser() {
  // Get current user for activity tracking before logout
  let currentUser: User | null = null;
  const unsubscribe = authStore.subscribe(state => {
    currentUser = state.user;
  });
  unsubscribe(); // Immediately unsubscribe after getting current state
  
  authStore.update(state => ({ ...state, loading: true }));
  
  try {
    const response = await fetch(`${API_BASE}/logout`, { credentials: 'include' });
    if (response.ok) {
      // Track logout activity before clearing user state
      if (currentUser) {
        await activityTracker.trackLogout(currentUser);
      }
      
      authStore.set({ isAuthenticated: false, user: null, loading: false });
    } else {
      console.error('Logout failed');
      // Still track the logout attempt even if API call failed
      if (currentUser) {
        await activityTracker.trackError(currentUser, ACTIVITY_TYPES.LOGOUT, 'API logout failed');
      }
    }
  } catch (error) {
    console.error('Error during logout:', error);
    // Track logout error
    if (currentUser) {
      await activityTracker.trackError(currentUser, ACTIVITY_TYPES.LOGOUT, `Logout error: ${error}`);
    }
  }
}
