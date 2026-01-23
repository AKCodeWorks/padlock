import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Padlock } from "./padlock.ts"
import { microsoft } from "./providers/microsoft.ts"
import { github } from "./providers/github.ts"
import type { ProviderConfig } from "./types.js"

type CookieStore = {
  get(name: string): string | undefined
  set(name: string, value: string): void
  delete(name: string): void
}

function createCookies(): CookieStore {
  const jar = new Map<string, string>()
  return {
    get(name) {
      return jar.get(name)
    },
    set(name, value) {
      jar.set(name, value)
    },
    delete(name) {
      jar.delete(name)
    }
  }
}

function createEvent(url: string) {
  return {
    url: new URL(url),
    request: new Request(url),
    cookies: createCookies()
  }
}

function base64urlEncode(input: string): string {
  return Buffer.from(input).toString("base64url")
}

function createJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: "none", typ: "JWT" }))
  const body = base64urlEncode(JSON.stringify(payload))
  return `${header}.${body}.`
}

describe("Padlock OAuth flow", () => {
  it("merges provider default scopes with configured scopes", async () => {
    const padlock = new Padlock({
      baseUrl: "http://localhost:5173",
      providers: {
        github: {
          clientId: "id",
          clientSecret: "secret",
          scopes: ["repo"]
        }
      }
    })

    const handler = padlock.auth()
    const event = createEvent("http://localhost:5173/auth?provider=github")
    const res = await handler(event as never)

    expect(res.status).toBe(302)
    const location = res.headers.get("Location") ?? ""
    expect(location).toContain("github.com/login/oauth/authorize")
    expect(location).toContain("scope=read%3Auser+user%3Aemail+repo")
  })

  it("uses tenant-specific Microsoft authorize URL when one tenant is provided", async () => {
    const tenantId = "00000000-0000-0000-0000-000000000000"
    const padlock = new Padlock({
      baseUrl: "http://localhost:5173",
      providers: {
        microsoft: {
          clientId: "id",
          clientSecret: "secret",
          allowedTenants: [tenantId]
        }
      }
    })

    const handler = padlock.auth()
    const event = createEvent("http://localhost:5173/auth?provider=microsoft")
    const res = await handler(event as never)

    const location = res.headers.get("Location") ?? ""
    expect(location).toContain(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
    )
  })

  it("uses the common Microsoft authorize URL when no tenants are provided", async () => {
    const padlock = new Padlock({
      baseUrl: "http://localhost:5173",
      providers: {
        microsoft: {
          clientId: "id",
          clientSecret: "secret"
        }
      }
    })

    const handler = padlock.auth()
    const event = createEvent("http://localhost:5173/auth?provider=microsoft")
    const res = await handler(event as never)

    const location = res.headers.get("Location") ?? ""
    expect(location).toContain(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    )
  })

  it("uses the common Microsoft authorize URL when multiple tenants are allowed", async () => {
    const padlock = new Padlock({
      baseUrl: "http://localhost:5173",
      providers: {
        microsoft: {
          clientId: "id",
          clientSecret: "secret",
          allowedTenants: ["tenant-a", "tenant-b"]
        }
      }
    })

    const handler = padlock.auth()
    const event = createEvent("http://localhost:5173/auth?provider=microsoft")
    const res = await handler(event as never)

    const location = res.headers.get("Location") ?? ""
    expect(location).toContain(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    )
  })

  it("uses default scopes when no custom scopes are provided", async () => {
    const padlock = new Padlock({
      baseUrl: "http://localhost:5173",
      providers: {
        github: {
          clientId: "id",
          clientSecret: "secret"
        }
      }
    })

    const handler = padlock.auth()
    const event = createEvent("http://localhost:5173/auth?provider=github")
    const res = await handler(event as never)

    const location = res.headers.get("Location") ?? ""
    expect(location).toContain("scope=read%3Auser+user%3Aemail")
  })
})

describe("Microsoft provider", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it("rejects access tokens from disallowed tenants", async () => {
    const token = createJwt({ tid: "tenant-a" })
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: token }), { status: 200 })
    )

    const config: ProviderConfig = {
      clientId: "id",
      clientSecret: "secret",
      allowedTenants: ["tenant-b"]
    }

    await expect(
      microsoft.exchangeCode({
        code: "code",
        codeVerifier: "verifier",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: "http://localhost:5173/auth/callback",
        providerConfig: config
      })
    ).rejects.toThrow("tenant not allowed")
  })

  it("accepts access tokens from allowed tenants", async () => {
    const token = createJwt({ tid: "tenant-a" })
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: token }), { status: 200 })
    )

    const config: ProviderConfig = {
      clientId: "id",
      clientSecret: "secret",
      allowedTenants: ["tenant-a"]
    }

    const result = await microsoft.exchangeCode({
      code: "code",
      codeVerifier: "verifier",
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: "http://localhost:5173/auth/callback",
      providerConfig: config
    })

    expect(result.accessToken).toBe(token)
  })

  it("uses common token URL when multiple tenants are configured", async () => {
    const token = createJwt({ tid: "tenant-a" })
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: token }), { status: 200 })
    )

    const config: ProviderConfig = {
      clientId: "id",
      clientSecret: "secret",
      allowedTenants: ["tenant-a", "tenant-b"]
    }

    await microsoft.exchangeCode({
      code: "code",
      codeVerifier: "verifier",
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: "http://localhost:5173/auth/callback",
      providerConfig: config
    })

    expect(fetchMock).toHaveBeenCalled()
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    )
  })
})

describe("GitHub provider", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it("selects a primary verified email when available", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 1, login: "octo", email: null, avatar_url: null }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { email: "a@example.com", primary: true, verified: false },
            { email: "b@example.com", primary: true, verified: true },
            { email: "c@example.com", primary: false, verified: true }
          ]),
          { status: 200 }
        )
      )

    const user = await github.fetchUser("token")
    expect(user.email).toBe("b@example.com")
  })

  it("falls back to first email when no primary is present", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 1, login: "octo", email: null, avatar_url: null }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { email: "first@example.com", primary: false, verified: true },
            { email: "second@example.com", primary: false, verified: true }
          ]),
          { status: 200 }
        )
      )

    const user = await github.fetchUser("token")
    expect(user.email).toBe("first@example.com")
  })
})

describe("Provider contract", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it("GitHub maps OAuthUser fields from provider data", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            login: "octo",
            name: "Octo Cat",
            email: "octo@example.com",
            avatar_url: "https://avatars.example.com/u/42"
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      )

    const user = await github.fetchUser("token")

    expect(user.provider).toBe("github")
    expect(user.providerAccountId).toBe("42")
    expect(user.email).toBe("octo@example.com")
    expect(user.name).toBe("Octo Cat")
    expect(user.avatar).toBe("https://avatars.example.com/u/42")
    expect(user.raw).toMatchObject({ id: 42, login: "octo" })
  })

  it("Microsoft maps OAuthUser fields from provider data", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            displayName: "Alex Doe",
            mail: "alex@example.com",
            userPrincipalName: "alex@contoso.com"
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response("image-bytes", {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      )

    const user = await microsoft.fetchUser("token")

    expect(user.provider).toBe("microsoft")
    expect(user.providerAccountId).toBe("user-1")
    expect(user.email).toBe("alex@example.com")
    expect(user.name).toBe("Alex Doe")
    expect(user.avatar).toContain("data:image/png;base64,")
    expect(user.raw).toMatchObject({ id: "user-1", displayName: "Alex Doe" })
  })
})
