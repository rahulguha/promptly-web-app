<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(async () => {
    // This route is no longer used with JWT auth
    // Redirect to home since JWT auth uses /auth/success
    goto('/');
  });
</script>

<h1>Redirecting...</h1>
