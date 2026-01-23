import type { OAuthProvider } from "../types.js"

export const github: OAuthProvider = {
  id: "github",
  authorizeUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  defaultScopes: ["read:user", "user:email"],

  async exchangeCode({
    code,
    codeVerifier,
    clientId,
    clientSecret,
    providerConfig: _providerConfig
  }) {
    const tokenUrl =
      typeof this.tokenUrl === "function" ? this.tokenUrl(_providerConfig) : this.tokenUrl
    const res = await fetch(tokenUrl, {
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
    let email = gh.email ?? null

    if (!email) {
      try {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json"
          }
        })

        if (emailsRes.ok) {
          const emails = await emailsRes.json()
          if (Array.isArray(emails) && emails.length > 0) {
            const primaryVerified = emails.find(
              (entry) => entry?.primary && entry?.verified
            )
            const primary = emails.find((entry) => entry?.primary)
            email = primaryVerified?.email ?? primary?.email ?? emails[0]?.email ?? null
          }
        }
      } catch {
        // ignore email lookup failures
      }
    }

    return {
      provider: "github",
      providerAccountId: String(gh.id),
      email,
      name: gh.name ?? gh.login ?? null,
      avatar: gh.avatar_url ?? null,
      raw: gh
    }
  }
}
