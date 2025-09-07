import { writable } from 'svelte/store';
import type { Profile } from '$lib/api';

export const selectedProfile = writable<Profile | null>(null);
