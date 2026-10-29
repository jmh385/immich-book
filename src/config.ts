export interface RuntimeConfig {
  /** Immich server that whatever serves this app proxies /api to. */
  immichProxyTarget?: string;
}

declare global {
  interface Window {
    __IMMICH_BOOK_CONFIG__?: RuntimeConfig;
  }
}

/**
 * The Immich server reachable via a same-origin /api proxy, if there is one.
 * Runtime configuration (Docker) wins over the build-time variable used by the
 * dev server.
 */
export function getProxyTarget(): string | undefined {
  return (
    window.__IMMICH_BOOK_CONFIG__?.immichProxyTarget ||
    import.meta.env.VITE_IMMICH_PROXY_TARGET
  );
}
