<script lang="ts">
	import { goto } from '$app/navigation';
	import { createSignin } from '$lib/padlock/signin.js';

	type AuthProviders = {
		github: [];
		internal: [email: string, password: string];
	};

	const signin = createSignin<AuthProviders>();
</script>

<button
	onclick={async () => {
		await signin('internal', 'email', 'passssss');

		goto('/dashboard');
	}}
>
	Sign in with Internal
</button>
<button onclick={async () => await signin('github')}> Sign in with Github </button>
