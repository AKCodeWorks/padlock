import type { OAuthProvider, ProviderConfig } from "./types.js"

export async function exchangeCode({
  provider,
  providerConfig,
  code,
  verifier,
  redirectUri
}: {
  provider: OAuthProvider
  providerConfig: ProviderConfig
  code: string
  verifier: string
  redirectUri: string
}) {
  return provider.exchangeCode({
    code,
    codeVerifier: verifier,
    clientId: providerConfig.clientId,
    clientSecret: providerConfig.clientSecret,
    redirectUri,
    providerConfig
  })
}
