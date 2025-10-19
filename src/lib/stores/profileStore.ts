import { writable } from 'svelte/store';
import type { Profile } from '$lib/api';

const PROFILE_STORAGE_KEY = 'selectedProfileId';

// Create a custom store that persists to localStorage
function createPersistedProfileStore() {
  const { subscribe, set, update } = writable<Profile | null>(null);

  return {
    subscribe,
    set: (profile: Profile | null) => {
      if (profile) {
        try {
          console.log('[ProfileStore] Saving profile to localStorage:', { key: PROFILE_STORAGE_KEY, id: profile.id, name: profile.name });
          localStorage.setItem(PROFILE_STORAGE_KEY, profile.id);
          console.log('[ProfileStore] Saved successfully. Verify:', localStorage.getItem(PROFILE_STORAGE_KEY));
        } catch (e) {
          console.error('Failed to save profile to localStorage:', e);
        }
      }
      // Note: We don't remove from localStorage when profile is null
      // This allows the profile to persist across sessions
      set(profile);
    },
    clear: () => {
      // Method to clear the store without affecting localStorage
      console.log('[ProfileStore] Clearing store (keeping localStorage)');
      set(null);
    },
    update,
    getStoredProfileId: (): string | null => {
      try {
        const storedId = localStorage.getItem(PROFILE_STORAGE_KEY);
        console.log('[ProfileStore] getStoredProfileId called, key:', PROFILE_STORAGE_KEY, 'value:', storedId);
        console.log('[ProfileStore] All localStorage keys:', Object.keys(localStorage));
        console.log('[ProfileStore] localStorage.selectedProfileId:', localStorage.getItem('selectedProfileId'));
        return storedId;
      } catch (e) {
        console.error('Failed to read profile from localStorage:', e);
        return null;
      }
    }
  };
}

export const selectedProfile = createPersistedProfileStore();
