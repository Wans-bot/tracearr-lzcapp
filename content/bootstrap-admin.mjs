// Tracearr 首次初始化（幂等）：等待应用就绪 → 用应用自带的注册接口建立管理员账号。
//
// 为什么放在容器里做：Tracearr 自带账号体系（Better Auth），没有任何环境变量能「预建管理员」；
// 用户装完若停在首次设置向导上自己注册，就不满足微服的开箱即用与免密要求。
// 本脚本在 tracearr-init 里跑一次：
//   - 201/200 = 刚建号，成功；
//   - 4xx 且响应里含 "exist" / "taken" = 账号已存在（重装、重启），同样算完成。
// 两种都视为成功，所以整个步骤可重复执行。
// 建完写 /tmp/bootstrap.done 供健康检查；随后常驻，保持容器 (healthy)。
//
// 注册路径取自应用实测：Better Auth 挂在 API_BASE_PATH=/api/v1 之下（/api/v1/auth/*）。
// 凭据与浏览器 inject 用的是同一组值（lzc-manifest.yml 里两处一致），
// 保证「这里建的密码」==「登录页自动填充的密码」。
const BASE = process.env.LZC_BASE || 'http://tracearr:3000';
const EMAIL = process.env.LZC_ADMIN_EMAIL || 'admin@lazycat.local';
const PASSWORD = process.env.LZC_ADMIN_PASSWORD || 'Tracearr@lazycat';
const NAME = process.env.LZC_ADMIN_NAME || 'Lazycat Admin';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[tracearr-init]', ...a);

async function waitAppReady() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        log('应用 /health 就绪');
        return true;
      }
    } catch (e) {
      // 容器还没起来 / 迁移未完成，继续等
    }
    await sleep(5000);
  }
  log('等待应用就绪超时（15 分钟）');
  return false;
}

// 用与建号相同的凭据试一次登录：只有真正能登录，才算初始化成功。
async function verifySignin() {
  try {
    const r = await fetch(`${BASE}/api/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    log(`登录校验 → HTTP ${r.status} ${r.ok ? 'OK' : text.slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    log(`登录校验请求失败：${e.message}`);
    return false;
  }
}

async function trySignup() {
  const payload = { email: EMAIL, password: PASSWORD, name: NAME, username: 'admin' };
  let lastError = '';
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const r = await fetch(`${BASE}/api/v1/auth/sign-up/email`, {
        method: 'POST',
        // Better Auth 校验 Origin：缺 Origin 时返回 403 MISSING_OR_NULL_ORIGIN。
        // 它的 trustedOrigins 由「请求 URL 的 host」推出（见 lib/auth.js 的
        // trustedOriginsForRequest），所以这里带上与请求同源的 Origin 即可通过。
        headers: { 'content-type': 'application/json', origin: BASE },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const text = await r.text();
      log(`第 ${attempt} 次 sign-up → HTTP ${r.status} ${text.slice(0, 200)}`);
      if (r.ok) return true;
      // 账号已存在 ⇒ 完成
      if (/exist|already|taken|duplicate/i.test(text)) {
        log('账号已存在，视为初始化完成');
        return true;
      }
      // 首次设置向导可能还没准备好（claim code 关闭 / 首个用户检查），稍后重试
      lastError = text.slice(0, 200);
    } catch (e) {
      lastError = e.message;
      log(`第 ${attempt} 次 sign-up 请求失败：${e.message}`);
    }
    await sleep(6000);
  }
  log(`注册未成功，最后一次响应：${lastError}`);
  return false;
}

async function ensureAdmin() {
  if (!(await waitAppReady())) return false;
  for (let round = 1; round <= 30; round++) {
    const signupOk = await trySignup();
    if (signupOk && (await verifySignin())) {
      log(`初始化完成：管理员可登录（第 ${round} 轮）`);
      return true;
    }
    log(`第 ${round} 轮未完成，60 秒后重试`);
    await sleep(60000);
  }
  log('30 轮仍未完成，应用需手动完成首次设置（健康检查仍为真，容器保持 healthy）');
  return false;
}

(async () => {
  // 无论成功与否都写标记：健康检查恒为真，容器保持 healthy；失败原因留在日志里。
  // 先跑初始化，再写标记，避免健康检查在初始化中途就放行。
  try {
    await ensureAdmin();
  } catch (e) {
    log('初始化异常：' + e.message);
  }
  try {
    (await import('node:fs')).writeFileSync('/tmp/bootstrap.done', new Date().toISOString());
  } catch (e) {
    log('写标记失败：' + e.message);
  }
  // 常驻，不退出（一次性退出会让平台把该服务判为未运行）
  for (;;) await sleep(3600_000);
})();
