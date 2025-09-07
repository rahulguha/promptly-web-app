import { writable } from 'svelte/store';

export const eventBus = writable<{ event: string; data?: any } | null>(null);

export function dispatchEvent(event: string, data?: any) {
  eventBus.set({ event, data });
}
