import { writable } from "svelte/store";
import { activityTracker, ACTIVITY_TYPES } from "../activityTracker";

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

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    // Check if user is authenticated on app load
    init() {
      const token = localStorage.getItem("jwt_token");
      if (token) {
        // Validate token by calling /me endpoint
        this.validateToken();
      } else {
        set({ isAuthenticated: false, user: null, loading: false });
      }
    },

    // Validate JWT token
    async validateToken() {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        this.logout();
        return;
      }

      update((state) => ({ ...state, loading: true }));

      try {
        //const apiBase = import.meta.env.PROD
        //  ? import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL || "/v1"
        //  : "/v1";
        const apiBase =
          import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL || "/v1";

        const response = await fetch(`${apiBase}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const user = await response.json();
          generateSQLiteFilename(user);
          set({ isAuthenticated: true, user, loading: false });
        } else {
          this.logout();
        }
      } catch (error) {
        console.error("Token validation failed:", error);
        this.logout();
      }
    },

    // Login - redirect to API login endpoint
    login() {
      window.location.href = `${
        import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL
      }/api/auth/login`;
    },

    // Logout
    async logout() {
      localStorage.removeItem("jwt_token");
      set({ isAuthenticated: false, user: null, loading: false });

      // Optional: call logout endpoint
      try {
        const apiBase = import.meta.env.PROD
          ? import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL || "/v1"
          : "/v1";

        await fetch(`${apiBase}/api/auth/logout`);
      } catch (error) {
        console.log("Logout API call failed, but local logout successful");
      }
    },
  };
}

export const authStore = createAuthStore();

function generateSQLiteFilename(user: User) {
  const filename = `${user.user_id}-${user.email}-promptly.db`;
  console.log("Generated SQLite filename:", filename);
  return filename;
}

// Legacy function for backwards compatibility
export async function checkAuthStatus() {
  authStore.validateToken();
}

export async function logoutUser() {
  authStore.logout();
}
