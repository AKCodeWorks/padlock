# Padlock

Simple OAuth + trusted-provider auth for SvelteKit.

IMPORTANT: This package is in early development and is not ready for
production use. Using it may result in data loss or a breach.

## Install

```sh
bun add @akcodeworks/padlock
# or
npm i @akcodeworks/padlock
```

## Quick start

1. Create a server-only Padlock instance.
2. Wire SvelteKit endpoints for `/auth` and `/auth/callback`.
3. Call the client helper from your UI.

## Server setup (SvelteKit)

Create a Padlock class instance. Important: this module is server-only;
never import it in the browser or any client-side code.

`src/lib/server/padlock.ts`

```ts
import { env } from '$env/dynamic/private';
import { Padlock, type PadlockConfig } from '@akcodeworks/padlock';

const config = {
	baseUrl: 'http://localhost:5173',
	jwt: {
		secret: env.AUTH_SECRET,
		cookie: {
			name: 'padlock_jwt',
			httpOnly: true,
			sameSite: 'lax',
			secure: false
		}
	},
	providers: {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
			scopes: ['repo']
		}
	},
	callbacks: {
		async onUser(user) {
			// Optional: map or persist user here
			const saved = await db.user.upsert({
				where: { providerAccountId: user.providerAccountId },
				create: {
					provider: user.provider,
					providerAccountId: user.providerAccountId,
					email: user.email,
					name: user.name,
					avatar: user.avatar
				},
				update: {
					email: user.email,
					name: user.name,
					avatar: user.avatar
				}
			});

			// Note: do not redirect here or the auth cookie will not be saved.
			return { ...user, raw: { ...user.raw, dbId: saved.id } };
		},
		async onError(err) {
			console.error(err);
		}
	}
} satisfies PadlockConfig;

export const padlock = new Padlock(config);
```

Built-in provider example (GitHub is supported out of the box): see
the Supported providers section for defaults and optional scopes.

### Auth endpoint

This handles the initial OAuth redirect and trusted-provider POST auth.
This endpoint must be located at `src/routes/auth/+server.ts`.

`src/routes/auth/+server.ts`

```ts
import { padlock } from '$lib/server/padlock';

export const GET = padlock.auth();
export const POST = padlock.auth();
```

### Callback endpoint

This handles the OAuth provider redirect.
This endpoint must be located at `src/routes/auth/callback/+server.ts`.

`src/routes/auth/callback/+server.ts`

```ts
import { padlock } from '$lib/server/padlock';

export const GET = padlock.callback();
```

## Client usage

Import from `@akcodeworks/padlock/client` so server-only code never bundles into the
browser.

`src/routes/+page.svelte`

```svelte
<script lang="ts">
	import { createSignin } from '@akcodeworks/padlock/client';

	type AuthProviders = {
		github: [];
		internal: [email: string, password: string];
	};

	const signin = createSignin<AuthProviders>();
</script>

<button onclick={() => signin('github')}> Sign in with GitHub </button>
<button onclick={() => signin('internal', 'email', 'pass')}> Sign in with Internal </button>
```

## Trusted providers

Trusted providers let you authenticate via your own backend logic, such as
email/password. Use `trustedProvider<TRaw>()` to describe the shape of
`user.raw` that you return from `authenticate()`. This is the custom data
you want to keep on the user object (role, db id, etc.). The authenticate
function args are inferred from your implementation, so `createSignin`
and `padlock.signin()` can be typed automatically.
Your `authenticate()` must always return this exact shape. If auth fails,
return `null` or throw an error.

```ts
type OAuthUser<TRaw = unknown> = {
	provider: string;
	providerAccountId: string;
	email: string | null;
	name: string | null;
	avatar: string | null;
	raw: TRaw;
};
```

`src/lib/server/padlock.ts`

```ts
import { trustedProvider, Padlock } from '@akcodeworks/padlock';

const internal = trustedProvider<{ id: string; role: 'admin' | 'user' }>()({
	async authenticate(email: string, password: string) {
		// Example DB lookup (replace with your DB client)
		const user = await db.user.findUnique({ where: { email } });
		if (!user) {
			throw new Error('invalid credentials');
		}

		const isValid = await verifyPassword(password, user.passwordHash);
		if (!isValid) {
			throw new Error('invalid credentials');
		}

		return {
			provider: 'internal',
			providerAccountId: String(user.id),
			email: user.email,
			name: user.name ?? null,
			avatar: user.avatarUrl ?? null,
			raw: { id: String(user.id), role: user.role }
		};
	}
});

export const padlock = new Padlock({
	baseUrl: 'http://localhost:5173',
	trustedProviders: {
		internal
	}
});
```

## Route protection

Use `authorize()` in server load functions or endpoints.

`src/routes/dashboard/+page.server.ts`

```ts
import { padlock } from '$lib/server/padlock';

export async function load(event) {
	const user = await padlock.authorize(event, { required: true });
	return { user };
}
```

Or in `hooks.server.ts` to enforce auth globally or on selected routes:

`src/hooks.server.ts`

```ts
import { padlock } from '$lib/server/padlock';
import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/dashboard')) {
		const user = await padlock.authorize(event);
		if (!user) {
			throw redirect(303, '/');
		}
	}

	return resolve(event);
};
```

## Configuration reference

`new Padlock({ ... })` accepts:

- `baseUrl` (required): Base URL of your app, used for OAuth redirects.
- `providers`: OAuth providers configuration.
- `trustedProviders`: custom auth providers (optional).
- `jwt`: JWT cookie configuration.
- `callbacks.onUser`: called after provider auth.
- `callbacks.onError`: called on auth errors.
- `onInvalidConfiguration`: `"silent" | "warn" | "error"`.

### Provider config

```ts
providers: {
  github: {
    clientId: "...",
    clientSecret: "...",
    scopes: ["repo"],
    redirectUri: "https://your.app/auth/callback"
  }
}
```

Notes:

- `scopes` is joined with spaces for the OAuth request.
- `redirectUri` overrides the default `${baseUrl}/auth/callback`.
- For stricter type safety on provider configs, use `satisfies PadlockConfig`
  (it will catch unknown fields like `scope`).

Provider responses:

- `raw` contains the provider's response payload (including any extra fields
  granted by your chosen scopes) so you can fall back to provider-specific data
  when it isn't mapped onto the normalized fields.

### JWT config

```ts
jwt: {
  secret: "your-secret",
  expiresInSeconds: 3600,
  cookie: {
    name: "padlock_jwt",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/"
  }
}
```

If `jwt` is set, Padlock signs a token and stores it in a cookie. It does
not return the token in the response body.

## Class methods

### `auth()`

Returns a SvelteKit `RequestHandler`. Use for `/auth` to:

- Start OAuth (GET) by redirecting to the provider.
- Handle trusted-provider auth (POST) by calling your `authenticate` function.
  The handler returns a JSON response with the normalized user. If `jwt` is
  configured, it also sets the JWT cookie.

```ts
// src/routes/auth/+server.ts
import { padlock } from '$lib/server/padlock';

export const GET = padlock.auth();
export const POST = padlock.auth();
```

### `callback()`

Returns a SvelteKit `RequestHandler` for `/auth/callback`. This:

- Validates OAuth state.
- Exchanges the code for an access token.
- Fetches and normalizes the user.
- Sets the JWT cookie (if configured).

```ts
// src/routes/auth/callback/+server.ts
import { padlock } from '$lib/server/padlock';

export const GET = padlock.callback();
```

### `authorize(event, options)`

Validates the JWT from either the `Authorization` header or cookie and
returns the payload. If `required` is true, it throws a 401 when missing
or invalid. The payload includes `sub`, `provider`, and `providerAccountId`.
If `required` is false (default), it returns `null` when no valid token
is present.

```ts
const payload = await padlock.authorize(event, { required: true });
```

### `signin()`

Returns a typed client helper for OAuth/trusted signin. Use it in the
browser; do not call on the server. Prefer the `padlock/client` entry. If
called with only a provider name, it triggers OAuth redirect. If called
with args, it sends a POST for trusted-provider auth.

If you do not want to use the helper, you can implement the same behavior
manually. The provider name must match the keys you configured on the
Padlock instance (`providers` and `trustedProviders`):

```ts
// From your Padlock config:
// providers: { github: { ... } }
// trustedProviders: { internal: { ... } }

// OAuth redirect (no args)
window.location.href = `/auth?provider=${encodeURIComponent('github')}`;

// Trusted provider POST (args are whatever your provider expects)
await fetch(`/auth?provider=${encodeURIComponent('internal')}`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ args: ['email@example.com', 'password'] })
});
```

```ts
// In a Svelte component
import { createSignin } from '@akcodeworks/padlock/client';
const signin = createSignin<{ github: []; internal: [string, string] }>();
```

## Supported providers

The following providers are supported right now. Padlock adds the required
scopes by default to ensure `OAuthUser` fields are populated; you can extend
them via the `scopes` array in your config.

GitHub

- Default scopes: `read:user`, `user:email`
- OAuth app setup: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app

Example:

```ts
providers: {
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    scopes: ["repo"]
  }
}
```

Microsoft

- Default scopes: `openid`, `profile`, `email`, `User.Read`
- App registration: https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app

Tenant example:

```ts
providers: {
  microsoft: {
    clientId: "...",
    clientSecret: "...",
    scopes: ["Calendars.Read"],
    allowedTenants: ["00000000-0000-0000-0000-000000000000"]
  }
}
```

Note: if `allowedTenants` is omitted or empty, the Microsoft provider uses the
`common` endpoint, so your Azure app registration must allow multi-tenant
sign-ins.

## Security notes

- OAuth flow includes PKCE and a state cookie check.
- Trusted-provider POSTs require same-origin `Origin` or `Referer`.
- Do not import `@akcodeworks/padlock` (server entry) in browser code. Use
  `@akcodeworks/padlock/client`.
- Always run over HTTPS in production and set `jwt.cookie.secure = true`.
- If you override `redirectUri`, it must exactly match the provider config.

## Troubleshooting

- **OAuth redirect loop or invalid callback**: confirm your callback route
  is exactly `src/routes/auth/callback/+server.ts` and your provider redirect
  URL matches `${baseUrl}/auth/callback` (or your `redirectUri` override).
- **403 invalid origin/referer**: your app is being accessed from a different
  origin than `baseUrl`. Align `baseUrl` with the actual site origin.
- **Type errors for provider configs**: ensure you are installing the local
  package build and importing `Padlock` from `@akcodeworks/padlock`, and
  `createSignin` from `@akcodeworks/padlock/client`.
- **JWT cookie not set**: do not redirect inside `onUser` and ensure your
  cookie `secure` flag matches the scheme (HTTPS in production). Also make
  sure you set `jwt` in the Padlock config.

## Development

```sh
bun run dev
```

Package locally:

```sh
bun run pack:clean
```
