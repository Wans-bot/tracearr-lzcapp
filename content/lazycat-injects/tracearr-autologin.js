// Tracearr 免密登录注入（browser 阶段）
//
// 三件事：
//   1. 登录页自动填充并提交（凭据来自 inject params，与 tracearr-init 建号用的是同一组值）；
//   2. 只在「真的存在账号密码表单」时提交一次，不做无条件重试（避免与登录节流打成自锁）；
//   3. 右下角提供「切换账号」控件：真登出并停用本会话的自动登录，登出后可「一键重新登录」。
//
// 幂等：脚本只装一套 UI 与监听；SPA 路由变化靠 MutationObserver + history 钩子重复判断。
(() => {
  if (window.__lzcTracearrAutologin) return;
  window.__lzcTracearrAutologin = true;

  const P = (typeof ctx !== 'undefined' && ctx && ctx.params) || {};
  const EMAIL = String(P.email || 'admin@lazycat.local');
  const PASSWORD = String(P.password || 'Tracearr@lazycat');
  const OFF_KEY = 'lzc-tracearr-autologin-off';

  const isOff = () => {
    try { return sessionStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; }
  };
  const setOff = (v) => {
    try { v ? sessionStorage.setItem(OFF_KEY, '1') : sessionStorage.removeItem(OFF_KEY); } catch (e) {}
  };

  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 只认「邮箱 + 密码 + 提交按钮」齐全的表单，避免误填其它表单（设置页、邀请成员等）
  function findLoginForm() {
    const passwords = [...document.querySelectorAll('input[type="password"]')].filter(visible);
    for (const pw of passwords) {
      const scope = pw.closest('form') || document;
      const email = [...scope.querySelectorAll('input[type="email"], input[name="email"], input[autocomplete="username"]')]
        .filter(visible)[0];
      if (!email) continue;
      const submit = [...scope.querySelectorAll('button[type="submit"], button')]
        .filter((b) => visible(b) && !b.disabled)
        .find((b) => /登录|登入|sign\s*in|log\s*in|continue|继续/i.test(b.textContent || ''))
        || scope.querySelector('button[type="submit"]');
      return { scope, email, pw, submit: visible(submit) ? submit : null };
    }
    return null;
  }

  let submitted = false;

  function attempt() {
    if (isOff()) return;
    const form = findLoginForm();
    if (!form) { submitted = false; return; }
    if (submitted) return;
    // 值已经是目标值且表单已提交过，就不再重复点
    if (form.email.value === EMAIL && form.pw.value === PASSWORD && document.body.dataset.lzcSubmitted === '1') return;
    setValue(form.email, EMAIL);
    setValue(form.pw, PASSWORD);
    submitted = true;
    document.body.dataset.lzcSubmitted = '1';
    setTimeout(() => {
      try {
        if (form.submit) form.submit.click();
        else if (form.scope.tagName === 'FORM' && form.scope.requestSubmit) form.scope.requestSubmit();
      } catch (e) { /* 交给用户手动点 */ }
    }, 120);
  }

  async function signOut() {
    setOff(true);
    try {
      // Better Auth 挂在 API_BASE_PATH=/api/v1 之下；两个候选路径都试一次
      for (const u of ['/api/v1/auth/sign-out', '/api/auth/sign-out']) {
        try {
          const r = await fetch(u, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
          if (r.ok || r.status === 401) break;
        } catch (e) { /* 继续试下一个 */ }
      }
    } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
    location.href = '/login';
    setTimeout(() => location.reload(), 400);
  }

  function mount() {
    if (document.getElementById('lzc-tracearr-switch')) return;
    const box = document.createElement('div');
    box.id = 'lzc-tracearr-switch';
    box.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483000',
      'display:flex', 'gap:8px', 'align-items:center',
      'font:13px/1.4 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
    ].join(';');
    const btn = document.createElement('button');
    btn.type = 'button';
    const paint = () => {
      btn.textContent = isOff() ? '一键重新登录' : '切换账号';
      btn.title = isOff() ? '恢复自动登录并重新进入' : '退出当前账号（本会话停用自动登录）';
    };
    paint();
    btn.style.cssText = [
      'padding:8px 12px', 'border-radius:999px', 'border:1px solid rgba(0,0,0,.12)',
      'background:rgba(255,255,255,.92)', 'color:#111', 'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,.12)', 'backdrop-filter:blur(6px)',
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOff()) { setOff(false); location.href = '/login'; setTimeout(() => location.reload(), 300); }
      else signOut();
    });
    box.appendChild(btn);
    (document.body || document.documentElement).appendChild(box);
  }

  const boot = () => {
    mount();
    attempt();
  };

  // SPA 路由变化：包一层 history API + 监听 hashchange
  const wrap = (name) => {
    const orig = history[name];
    if (typeof orig !== 'function' || orig.__lzcWrapped) return;
    const wrapped = function (...args) { const r = orig.apply(this, args); setTimeout(boot, 60); return r; };
    wrapped.__lzcWrapped = true;
    history[name] = wrapped;
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', boot);
  window.addEventListener('hashchange', boot);

  const obs = new MutationObserver(() => { mount(); attempt(); });
  const start = () => {
    if (!document.body) return setTimeout(start, 50);
    obs.observe(document.body, { childList: true, subtree: true });
    boot();
    // 上一轮注入可能因节流被拒；给出有限次数的兜底重试，避免与登录节流自锁
    let retries = 0;
    const timer = setInterval(() => {
      if (document.querySelector('input[type="password"]')) attempt();
      if (++retries > 20) clearInterval(timer);
    }, 3000);
  };
  start();
})();
