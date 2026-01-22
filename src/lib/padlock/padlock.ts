import { error, type RequestEvent, type RequestHandler } from "@sveltejs/kit"
import crypto from "node:crypto"
import { generateCodeVerifier, generateCodeChallenge } from "./pkce.js"
import { providers } from "./providers/index.js"
import { exchangeCode } from "./exchange.js"
import { fetchAndNormalizeUser } from "./user.js"
import type {
  InvalidConfigurationMode,
  OAuthKeys,
  OfficialProvidersConfig,
  PadlockConfig,
  ProvidersConfig,
  TrustedArgs,
  TrustedKeys,
  TrustedProvider,
  TrustedProvidersConfig
} from "./types.js"
import { signJwt, type PadlockJwtPayload } from "./jwt.js"
import jwt from "jsonwebtoken"


function getProviderId<T extends Record<string, unknown>>(
  value: string | null,
  map: T
): keyof T | null {
  if (!value || !(value in map)) return null
  return value as keyof T
}

function extractToken(event: RequestEvent, cookieName: string) {
  const auth = event.request.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return event.cookies.get(cookieName)
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

function isSameOrigin(origin: string, baseUrl: string): boolean {
  try {
    return new URL(origin).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

function enforceCsrf(event: RequestEvent, baseUrl: string): void {
  const origin = event.request.headers.get("origin")
  const referer = event.request.headers.get("referer")

  if (origin && !isSameOrigin(origin, baseUrl)) {
    error(403, "invalid origin")
  }

  if (referer && !isSameOrigin(referer, baseUrl)) {
    error(403, "invalid referer")
  }
}

export class Padlock<
  TOAuth extends ProvidersConfig = OfficialProvidersConfig,
  TTrusted extends TrustedProvidersConfig = Record<
    never,
    TrustedProvider<unknown, readonly unknown[]>
  >
> {
  private config: PadlockConfig<TOAuth, TTrusted>
  private invalidMode: InvalidConfigurationMode


  private oauthProviders: ProvidersConfig
  private trustedProviders: TrustedProvidersConfig

  constructor(config: PadlockConfig<TOAuth, TTrusted>) {
    this.config = config
    this.invalidMode = config.onInvalidConfiguration ?? "warn"


    this.oauthProviders = config.providers ?? {}
    this.trustedProviders = config.trustedProviders ?? {}

    this.validateConfiguration()
  }

  private handleInvalidConfig(message: string): void {
    if (this.invalidMode === "silent") return
    if (this.invalidMode === "warn") {
      console.warn(`[padlock] ${message}`)
      return
    }
    throw new Error(`[padlock] ${message}`)
  }

  private validateConfiguration(): void {
    const oauthKeys = new Set(Object.keys(this.oauthProviders))
    const trustedKeys = new Set(Object.keys(this.trustedProviders))


    for (const key of oauthKeys) {
      if (trustedKeys.has(key)) {
        this.handleInvalidConfig(
          `provider "${key}" cannot exist in both providers and trustedProviders`
        )
      }
    }


    for (const providerId of oauthKeys) {
      if (!(providerId in providers)) {
        this.handleInvalidConfig(`provider "${providerId}" is not supported`)
        continue
      }

      const cfg = this.oauthProviders[providerId]
      if (!cfg) {
        this.handleInvalidConfig(`provider "${providerId}" is missing config`)
        continue
      }

      if (!cfg.clientId) {
        this.handleInvalidConfig(`provider "${providerId}" is missing clientId`)
      }

      if (!cfg.clientSecret) {
        this.handleInvalidConfig(
          `provider "${providerId}" is missing clientSecret`
        )
      }
    }
  }


  auth(): RequestHandler {
    return async (event) => {
      const raw = event.url.searchParams.get("provider")
      if (!raw) error(400, "missing provider")


      if (raw in this.oauthProviders) {
        const providerId = getProviderId(raw, providers)
        if (!providerId) {
          error(400, "invalid provider")
        }

        const provider = providers[providerId]
        const providerConfig = this.oauthProviders[providerId]

        const verifier = generateCodeVerifier()
        const challenge = generateCodeChallenge(verifier)

        event.cookies.set(`pkce_${providerId}`, verifier, {
          httpOnly: true,
          sameSite: "lax",
          path: "/auth/callback",
          maxAge: 300
        })

        const state = randomToken()
        event.cookies.set(`oauth_state_${providerId}`, state, {
          httpOnly: true,
          sameSite: "lax",
          path: "/auth/callback",
          maxAge: 300
        })

        const redirectUri =
          providerConfig.redirectUri ??
          `${this.config.baseUrl}/auth/callback`
        const scope =
          providerConfig.scopes?.join(" ") ?? providerConfig.scope ?? ""

        const params = new URLSearchParams({
          client_id: providerConfig.clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope,
          state: JSON.stringify({ provider: providerId, state }),
          code_challenge: challenge,
          code_challenge_method: "S256"
        })

        return new Response(null, {
          status: 302,
          headers: {
            Location: `${provider.authorizeUrl}?${params}`
          }
        })
      }


      if (raw in this.trustedProviders) {
        if (event.request.method !== "POST") {
          error(405, "method not allowed")
        }

        enforceCsrf(event, this.config.baseUrl)

        const provider = this.trustedProviders[raw]
        if (!provider) {
          error(400, "unknown provider")
        }

        let args: readonly unknown[] = []

        try {
          const body = await event.request.json()
          if (body && Array.isArray(body.args)) {
            args = body.args
          }
        } catch {
          // body is empty but dont care
        }

        const user = await provider.authenticate(...args)
        if (!user) {
          error(401, "authentication failed")
        }

        const finalUser = this.config.callbacks?.onUser
          ? await this.config.callbacks.onUser(user)
          : user

        return this.respondWithUser(finalUser, event.cookies)
      }

      error(400, "unknown provider")
    }
  }

  callback(): RequestHandler {
    return async ({ url, cookies }) => {
      try {
        const code = url.searchParams.get("code")
        const state = url.searchParams.get("state")
        const oauthError = url.searchParams.get("error")
        const oauthErrorDescription = url.searchParams.get("error_description")

        if (oauthError) {
          const details = oauthErrorDescription
            ? `${oauthError}: ${oauthErrorDescription}`
            : oauthError
          error(400, details)
        }

        if (!code || !state) {
          error(400, "invalid callback")
        }

        const parsedState = JSON.parse(state) as {
          provider?: string
          state?: string
        }
        const providerId = getProviderId(parsedState.provider ?? null, providers)
        if (!providerId) {
          error(400, "unknown provider")
        }

        const provider = providers[providerId]
        const providerConfig = this.oauthProviders[providerId]
        if (!providerConfig) {
          error(400, "provider not configured")
        }

        const expectedState = cookies.get(`oauth_state_${providerId}`)
        if (!expectedState || parsedState.state !== expectedState) {
          error(400, "invalid state")
        }

        const verifier = cookies.get(`pkce_${providerId}`)
        if (!verifier) {
          error(400, "missing pkce")
        }

        cookies.delete(`pkce_${providerId}`, { path: "/auth/callback" })
        cookies.delete(`oauth_state_${providerId}`, { path: "/auth/callback" })

        const token = await exchangeCode({
          provider,
          providerConfig,
          code,
          verifier,
          redirectUri:
            providerConfig.redirectUri ??
            `${this.config.baseUrl}/auth/callback`
        })

        const user = await fetchAndNormalizeUser(provider, token)

        const finalUser = this.config.callbacks?.onUser
          ? await this.config.callbacks.onUser(user)
          : user

        return this.respondWithUser(finalUser, cookies)
      } catch (err) {
        this.config.callbacks?.onError?.(err)
        if (err && typeof err === "object" && "status" in err) {
          throw err
        }
        error(500, "auth error")
      }
    }
  }


  authorize(
    event: RequestEvent,
    options: { required?: boolean } = {}
  ): Promise<PadlockJwtPayload | null> {
    const { required = false } = options

    if (!this.config.jwt) {
      error(500, "jwt configuration is missing")
    }

    const cookieName = this.config.jwt.cookie?.name ?? "padlock_token"
    const token = extractToken(event, cookieName)

    if (!token) {
      if (required) error(401, "invalid or missing token")
      return Promise.resolve(null)
    }

    try {
      const payload = jwt.verify(
        token,
        this.config.jwt.secret
      ) as PadlockJwtPayload

      return Promise.resolve(payload)
    } catch {
      if (required) error(401, "invalid token")
      return Promise.resolve(null)
    }
  }

  signin() {
    return async <
      K extends OAuthKeys<TOAuth> | TrustedKeys<TTrusted>
    >(
      provider: K,
      ...args: K extends TrustedKeys<TTrusted>
        ? TrustedArgs<TTrusted, K>
        : []
    ) => {
      // oauth
      if (provider in this.oauthProviders) {
        if (typeof window === "undefined") {
          throw new Error("[padlock] signin() cannot redirect on the server")
        }
        window.location.href = `/auth?provider=${encodeURIComponent(provider)}`
        return
      }


      if (provider in this.trustedProviders) {
        return fetch(`/auth?provider=${encodeURIComponent(provider)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ args })
        })
      }

      error(400, "unknown provider")
    }
  }

  private respondWithUser(
    user: { provider: string; providerAccountId: string },
    cookies: RequestEvent["cookies"]
  ) {
    const responsePayload: unknown = user

    if (this.config.jwt) {
      const token = signJwt(
        {
          sub: `${user.provider}:${user.providerAccountId}`,
          provider: user.provider,
          providerAccountId: user.providerAccountId
        },
        this.config.jwt.secret,
        this.config.jwt.expiresInSeconds
      )

      const cookieConfig = this.config.jwt.cookie ?? {}

      cookies.set(cookieConfig.name ?? "padlock_token", token, {
        httpOnly: cookieConfig.httpOnly ?? true,
        sameSite: cookieConfig.sameSite ?? "lax",
        secure: cookieConfig.secure ?? false,
        path: cookieConfig.path ?? "/"
      })

    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { "Content-Type": "application/json" }
    })
  }
}
