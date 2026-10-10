async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("无法连接本地复核服务。请从项目目录运行 npm run dev。");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`服务响应无法读取（${response.status}）`);
  }
  if (response.status === 401) {
    window.dispatchEvent(new Event("glads-auth-required"));
    throw new Error("登录已失效，请重新登录");
  }
  if (!response.ok)
    throw new Error(body.error || `服务请求失败（${response.status}）`);
  return body;
}
export const reviewApi = {
  health: () => request("/api/health"),
  listCases: () => request("/api/cases"),
  getCase: (id) => request(`/api/cases/${encodeURIComponent(id)}`),
  addAnnotation: (id, value) =>
    request(`/api/cases/${encodeURIComponent(id)}/annotations`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  addReview: (id, value) =>
    request(`/api/cases/${encodeURIComponent(id)}/reviews`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  exportUrl: "/api/export.zip",
  listUploads: () => request("/api/uploads"),
  upload: async (formData) => {
    let response;
    try {
      response = await fetch("/api/uploads", { method: "POST", body: formData });
    } catch {
      throw new Error("上传失败，请检查本地服务");
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.dispatchEvent(new Event("glads-auth-required"));
      throw new Error("登录已失效，请重新登录");
    }
    if (!response.ok) throw new Error(body.error || "上传失败，请重试");
    return body;
  },
};
