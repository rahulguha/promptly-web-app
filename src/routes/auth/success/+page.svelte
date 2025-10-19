
<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  onMount(() => {
    const token = $page.url.searchParams.get('token');

    if (token) {
      // Store JWT token
      localStorage.setItem('jwt_token', token);

      // Redirect to home page
      goto('/');
    } else {
      // Handle error - no token received
      console.error('No token received from authentication');
      goto('/');
    }
  });
</script>

<div>Completing authentication...</div>