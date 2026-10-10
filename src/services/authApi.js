async function authRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("无法连接本地服务，请确认工作台已启动");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "操作失败，请重试");
  return body;
}

export const authApi = {
  me: () => authRequest("/api/auth/me"),
  login: (email, password) =>
    authRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (displayName, email, password) =>
    authRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ displayName, email, password }),
    }),
  logout: () => authRequest("/api/auth/logout", { method: "POST" }),
};
