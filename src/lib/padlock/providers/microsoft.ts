import type { OAuthProvider } from "../types.js"

export const microsoft: OAuthProvider = {
  id: "microsoft",

  authorizeUrl:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl:
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",

  async exchangeCode({
    code,
    codeVerifier,
    clientId,
    clientSecret,
    redirectUri
  }) {
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    })

    const json = await res.json()
    return { accessToken: json.access_token }
  },

  async fetchUser(accessToken) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    const ms = await res.json()

    return {
      provider: "microsoft",
      providerAccountId: ms.id,
      email: ms.mail ?? ms.userPrincipalName ?? null,
      name: ms.displayName ?? null,
      avatarUrl: null,
      raw: ms
    }
  }
}
