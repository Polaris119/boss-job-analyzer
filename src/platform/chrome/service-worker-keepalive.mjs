const KEEPALIVE_INTERVAL_MS = 20_000;

export async function withExtensionKeepAlive(operation) {
  const ping = () => chrome.runtime.getPlatformInfo().catch(() => {});
  await ping();
  const interval = setInterval(ping, KEEPALIVE_INTERVAL_MS);
  try {
    return await operation();
  } finally {
    clearInterval(interval);
  }
}
