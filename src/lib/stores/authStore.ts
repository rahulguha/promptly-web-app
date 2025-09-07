import { writable } from 'svelte/store';

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
  authStore.update(state => ({ ...state, loading: true }));
  try {
    const response = await fetch(`${API_BASE}/logout`, { credentials: 'include' });
    if (response.ok) {
      authStore.set({ isAuthenticated: false, user: null, loading: false });
    } else {
      console.error('Logout failed');
    }
  } catch (error) {
    console.error('Error during logout:', error);
  }
}
