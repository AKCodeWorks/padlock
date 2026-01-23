<script lang="ts">
	import { goto } from '$app/navigation';
	import { createSignin } from '$lib/client.js';

	type AuthProviders = {
		github: [];
		microsoft: [];
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
<button onclick={async () => await signin('microsoft')}> Sign in with Microsoft </button>
