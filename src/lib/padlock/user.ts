import type { OAuthProvider, OAuthUser } from "./types.js"

export async function fetchAndNormalizeUser(
  provider: OAuthProvider,
  accessToken: { accessToken: string }
): Promise<OAuthUser> {
  return provider.fetchUser(accessToken.accessToken)
}