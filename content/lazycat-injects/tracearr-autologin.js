/**
 * Tracearr 免密登录注入（browser 阶段）
 *
 * 为什么需要：Tracearr 3.x 用 Better Auth 做认证，登录态是 httpOnly 的 session cookie，
 * 前端页面在拿不到会话时会跳 /login，用户装完应用第一眼是登录页。安装时的
 * tracearr-init 服务（content/bootstrap-admin.mjs）已经建好了管理员账号并用同一份
 * 账号密码登录过一次，但 session cookie 属于那个容器进程，不会落到用户的浏览器里。
 * 这里在浏览器侧用同一份账号密码补一次登录，让用户打开即已登录。
 *
 * 契约（见 lzc-manifest.yml 的 tracearr-autologin）：
 *   params.email / params.password 由部署参数渲染传入，不写死在脚本里。
 *
 * 幂等：先探 /api/v1/auth/get-session，已经登录就什么都不做，避免每次开页都打一次登录。
 */
(() => {
  const params = (typeof ctx !== "undefined" && ctx && ctx.params) || {};
  const email = params.email;
  const password = params.password;

  if (!email || !password) return;
  if (window.__tracearrAutologinRunning) return;
  window.__tracearrAutologinRunning = true;

  // apps/web/src/lib/api.ts:537 + packages/shared/src/constants.ts:446-447
  const AUTH = "/api/v1/auth";
  const json = { Accept: "application/json" };

  const sessionOf = (body) => {
    // better-auth 的 get-session 在新版里可能是 {session,user}，旧版包在 {data:...} 里
    if (!body || typeof body !== "object") return null;
    if (body.session) return body.session;
    if (body.data && body.data.session) return body.data.session;
    return null;
  };

  const run = async () => {
    // 1) 已登录就不动。探测失败（老实例 404 等）继续往下走登录流程。
    try {
      const cur = await fetch(AUTH + "/get-session", { credentials: "same-origin", headers: json });
      if (cur.ok && sessionOf(await cur.json().catch(() => null))) {
        window.__tracearrAutologinRunning = false;
        return;
      }
    } catch (err) {
      /* 继续尝试登录 */
    }

    // 2) 登录。credentials: same-origin 是必须的，Set-Cookie 才会被浏览器接受。
    const res = await fetch(AUTH + "/sign-in/email", {
      method: "POST",
      credentials: "same-origin",
      headers: { ...json, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    window.__tracearrAutologinRunning = false;
    if (!res.ok) return;

    // 3) 刷新一次让前端 bootstrap 读到新会话
    location.reload();
  };

  run().catch(() => {
    window.__tracearrAutologinRunning = false;
  });
})();
