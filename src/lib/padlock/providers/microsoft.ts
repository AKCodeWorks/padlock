import type { OAuthProvider, ProviderConfig } from "../types.js"

function getTenant(config: ProviderConfig): string | null {
  const tenants = config.allowedTenants
  if (!tenants || tenants.length !== 1) return null
  return tenants[0] ?? null
}

function getAuthorizeUrl(config: ProviderConfig): string {
  const segment = getTenant(config) ?? "common"
  return `https://login.microsoftonline.com/${segment}/oauth2/v2.0/authorize`
}

function getTokenUrl(config: ProviderConfig): string {
  const segment = getTenant(config) ?? "common"
  return `https://login.microsoftonline.com/${segment}/oauth2/v2.0/token`
}

function getJwtTenantId(token: string): string | null {
  const parts = token.split(".")
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    ) as { tid?: string }
    return payload.tid ?? null
  } catch {
    return null
  }
}

export const microsoft: OAuthProvider = {
  id: "microsoft",

  authorizeUrl: getAuthorizeUrl,
  tokenUrl: getTokenUrl,
  defaultScopes: ["openid", "profile", "email", "User.Read"],

  async exchangeCode({
    code,
    codeVerifier,
    clientId,
    clientSecret,
    redirectUri,
    providerConfig
  }) {
    const tokenUrl =
      typeof this.tokenUrl === "function" ? this.tokenUrl(providerConfig) : this.tokenUrl
    const res = await fetch(tokenUrl, {
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
    const accessToken = json.access_token

    const allowedTenants = providerConfig.allowedTenants?.filter(Boolean) ?? []
    if (allowedTenants.length > 0) {
      const tenantId = accessToken ? getJwtTenantId(accessToken) : null
      if (!tenantId || !allowedTenants.includes(tenantId)) {
        throw new Error("tenant not allowed")
      }
    }

    return { accessToken }
  },

  async fetchUser(accessToken) {
    let ms: {
      id?: string
      mail?: string | null
      userPrincipalName?: string | null
      displayName?: string | null
      error?: unknown
    } = {}

    try {
      const res = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      )

      ms = await res.json()

      if (!res.ok) {
        ms = { error: ms }
      }
    } catch (error) {
      ms = { error }
    }

    let avatar: string | null = null

    if (ms.id) {
      try {
        const photoRes = await fetch(
          "https://graph.microsoft.com/v1.0/me/photo/$value",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        )

        if (photoRes.ok) {
          const contentType =
            photoRes.headers.get("content-type") ?? "application/octet-stream"
          const arrayBuffer = await photoRes.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString("base64")
          avatar = `data:${contentType};base64,${base64}`
        }
      } catch {
        // ignore avatar lookup failures
      }
    }

    return {
      provider: "microsoft",
      providerAccountId: String(ms.id ?? ""),
      email: ms.mail ?? ms.userPrincipalName ?? null,
      name: ms.displayName ?? null,
      avatar,
      raw: ms
    }
  }
}
