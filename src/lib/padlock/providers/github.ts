import type { OAuthProvider } from "../types.js"

export const github: OAuthProvider = {
  id: "github",

  authorizeUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",

  async exchangeCode({
    code,
    codeVerifier,
    clientId,
    clientSecret
  }) {
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier
      })
    })

    const json = await res.json()
    return { accessToken: json.access_token }
  },

  async fetchUser(accessToken) {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json"
      }
    })

    const gh = await res.json()

    return {
      provider: "github",
      providerAccountId: String(gh.id),
      email: gh.email ?? null,
      name: gh.name ?? gh.login ?? null,
      avatarUrl: gh.avatar_url ?? null,
      raw: gh
    }
  }
}