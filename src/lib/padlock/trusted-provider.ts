import type { TrustedProvider } from "./types.js"

export function trustedProvider<TRaw>() {
  return function <TArgs extends unknown[] = unknown[]>(
    provider: TrustedProvider<TRaw, TArgs>
  ) {
    return provider
  }
}