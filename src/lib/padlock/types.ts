
import type { providers as officialProviders } from "./providers/index.js"

export type ProviderConfig = {
  clientId: string
  clientSecret: string
  scopes?: string[]
  redirectUri?: string
  allowedTenants?: string[]
}

export type JwtCookieConfig = {
  name?: string
  httpOnly?: boolean
  sameSite?: "lax" | "strict" | "none"
  secure?: boolean
  path?: string
}

export type JwtConfig = {
  secret: string
  expiresInSeconds?: number
  cookie?: JwtCookieConfig
}

export type AuthorizeOptions = {
  required?: boolean
  setLocals?: boolean
}

export type InvalidConfigurationMode = "silent" | "warn" | "error"


// ensures no overlapping keys between two records
type DisjointRecord<A, B> = {
  [K in keyof A & keyof B]: never
}

type DisjointProviders<A, B> = string extends keyof A
  ? object
  : string extends keyof B
  ? object
  : DisjointRecord<A, B>



export type OAuthUser<TRaw = unknown> = {
  provider: string
  providerAccountId: string
  email: string | null
  name: string | null
  avatar: string | null
  raw: TRaw
}



export type TrustedProvider<
  TRaw = unknown,
  TArgs extends readonly unknown[] = readonly unknown[]
> = {
  authenticate(...args: TArgs): Promise<OAuthUser<TRaw> | null>
}

export type ProvidersConfig = Partial<Record<string, ProviderConfig>>

export type OfficialProviderId = keyof typeof officialProviders
export type OfficialProvidersConfig = Partial<
  Record<OfficialProviderId, ProviderConfig>
>

export type TrustedProvidersConfig = Partial<
  Record<string, TrustedProvider<unknown, readonly unknown[]>>
>

export interface OAuthProvider<TRaw = unknown> {
  id: string
  authorizeUrl: string | ((config: ProviderConfig) => string)
  tokenUrl: string | ((config: ProviderConfig) => string)
  defaultScopes?: string[]

  exchangeCode(params: {
    code: string
    codeVerifier: string
    clientId: string
    clientSecret: string
    redirectUri: string
    providerConfig: ProviderConfig
  }): Promise<{ accessToken: string }>

  fetchUser(accessToken: string): Promise<OAuthUser<TRaw>>
}


export type PadlockConfig<
  TOAuth extends ProvidersConfig = OfficialProvidersConfig,
  TTrusted extends TrustedProvidersConfig = Record<
    never,
    TrustedProvider<unknown, readonly unknown[]>
  >
> = {
  baseUrl: string

  providers?: TOAuth & DisjointProviders<TOAuth, TTrusted>
  trustedProviders?: TTrusted & DisjointProviders<TTrusted, TOAuth>

  jwt?: JwtConfig

  callbacks?: {
    onUser?: (user: OAuthUser<unknown>) => Promise<OAuthUser<unknown>>
    onError?: (error: unknown) => void
  }

  onInvalidConfiguration?: InvalidConfigurationMode
}

export type OAuthKeys<T> = keyof T & string
export type TrustedKeys<T> = keyof T & string

export type TrustedArgs<
  TTrusted,
  K extends TrustedKeys<TTrusted>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
> = TTrusted[K] extends TrustedProvider<any, infer TArgs>
  ? TArgs
  : never
