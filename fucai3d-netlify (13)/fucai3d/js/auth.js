/**
 * 密码认证
 * - 主链接密码: 918918
 * - 副链接密码: 112233
 * 校验通过后写入 localStorage(默认 30 天免登录)
 * 2026-08-13 v5.7.10:加 30 天记忆功能
 */
window.FucaiAuth = (function () {
  const MAIN_PWD = '918918';
  const SUB_PWD  = '112233';
  const STORE_KEY = 'fucai3d_auth';
  const REMEMBER_DAYS = 30;  // 记住登录 30 天

  /** 检查是否已登录(未过期) */
  function check() {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      try {
        const o = JSON.parse(saved);
        if (o && (o.role === 'main' || o.role === 'sub') && o.expires && o.expires > Date.now()) {
          return o;  // 有效
        }
        // 过期了,清除
        if (o) localStorage.removeItem(STORE_KEY);
      } catch (e) {}
    }
    return null;
  }

  /** 登录:密码 + 期望角色 + 是否记住 */
  function login(password, role, remember) {
    const expect = role === 'main' ? MAIN_PWD : SUB_PWD;
    if (password !== expect) return { ok: false, msg: '密码错误,请核对后重输' };
    const data = {
      role,
      ts: Date.now(),
      remember: !!remember,
      expires: remember ? Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000 : 0
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    return { ok: true, data };
  }

  /** 登出 */
  function logout() {
    localStorage.removeItem(STORE_KEY);
  }

  /** 登录页面 HTML */
  function makeLoginScreen(role) {
    return `
      <div class="login-mask">
        <div class="login-card">
          <div class="login-title">🔒 福彩3D杀号系统专业版</div>
          <div class="login-sub">请输入访问密码</div>
          <input id="pwdInput" type="password" class="login-input"
                 placeholder="输入 6 位数字密码" inputmode="numeric" maxlength="6" autocomplete="off" />
          <div id="pwdErr" class="login-err"></div>
          <label style="display:flex;align-items:center;gap:8px;margin:14px 0;cursor:pointer;user-select:none;font-size:13px;color:var(--text-2, #94a3b8);">
            <input id="pwdRemember" type="checkbox" checked style="width:18px;height:18px;cursor:pointer;accent-color:#ef4444;" />
            <span>记住此设备(<b style="color:#fbbf24;">30 天</b>内免登录)</span>
          </label>
          <button id="pwdBtn" class="login-btn">进入系统</button>
          <div class="login-tip">本系统只提供参考,不构成投资建议</div>
        </div>
      </div>
    `;
  }

  /** 绑定登录按钮 */
  function bindLogin(role, onSuccess) {
    const btn = document.getElementById('pwdBtn');
    const input = document.getElementById('pwdInput');
    const err = document.getElementById('pwdErr');
    const rememberEl = document.getElementById('pwdRemember');
    const submit = () => {
      const v = input.value.trim();
      const remember = rememberEl ? rememberEl.checked : true;
      const r = login(v, role, remember);
      if (!r.ok) { err.textContent = r.msg; return; }
      const mask = document.querySelector('.login-mask');
      if (mask) mask.remove();
      onSuccess && onSuccess(r.data);
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 50);
  }

  return { check, login, logout, makeLoginScreen, bindLogin, MAIN_PWD, SUB_PWD, REMEMBER_DAYS };
})();
