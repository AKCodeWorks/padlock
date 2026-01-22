export function createSignin<
  TProviders extends Record<string, readonly unknown[]>
>() {
  return async <K extends keyof TProviders>(
    provider: K,
    ...args: TProviders[K]
  ): Promise<Response | void> => {

    if (args.length === 0) {
      window.location.href = `/auth?provider=${encodeURIComponent(String(provider))}`
      return
    }


    return fetch(`/auth?provider=${encodeURIComponent(String(provider))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args })
    })
  }
}