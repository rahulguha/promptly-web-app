<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { checkAuthStatus } from '../../../lib/stores/authStore';

  onMount(async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');

    if (code) {
      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_BACKEND_API_BASE_URL}/api/auth/callback?code=${code}`, {});

        if (response.ok) {
          // The backend will set a session cookie.
          // Update auth status in the store
          await checkAuthStatus();
          // Redirect to the home page.
          goto('/');
        } else {
          // Handle login error
          console.error('Login failed');
        }
      } catch (error) {
        console.error('Error during login:', error);
      }
    }
  });
</script>

<h1>Loading...</h1>
