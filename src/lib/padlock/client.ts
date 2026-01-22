export async function signin(
  provider: string,
  ...args: unknown[]
) {

  if (args.length === 0) {
    window.location.href = `/auth?provider=${encodeURIComponent(provider)}`
    return
  }

  return fetch(`/auth?provider=${encodeURIComponent(provider)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args })
  })
}