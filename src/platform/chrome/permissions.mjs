export async function ensureEndpointPermission(baseUrl) {
  const originPattern = `${new URL(baseUrl).origin}/*`;
  if (await chrome.permissions.contains({ origins: [originPattern] })) return;
  if (!await chrome.permissions.request({ origins: [originPattern] })) {
    throw new Error("需要获得该 AI 接口域名的访问权限才能继续");
  }
}
