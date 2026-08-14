/**
 * 密码认证
 * - 主链接密码: 918918
 * - 副链接密码: 112233
 * 校验通过后写入 localStorage(默认 30 天免登录)
 * 2026-08-13 v5.7.10:加 30 天记忆功能
 * 2026-08-15 v5.8.5:加设备指纹记忆(永久)— 登入过的设备,不需要再输密码
 */
window.FucaiAuth = (function () {
  const MAIN_PWD = '918918';
  const SUB_PWD  = '112233';
  const STORE_KEY = 'fucai3d_auth';
  const DEVICE_KEY = 'fucai3d_known_devices';  // v5.8.5:设备指纹记忆
  const REMEMBER_DAYS = 30;  // 记住登录 30 天

  // ─── 设备指纹(从 tokenAuth 复用算法)───
  function getMyFingerprint() {
    // 先用 tokenAuth 里的稳定 fp
    if (window.FucaiTokenAuth && window.FucaiTokenAuth.getDeviceFingerprint) {
      try { return window.FucaiTokenAuth.getDeviceFingerprint(); } catch (e) {}
    }
    // fallback: 简单 fp
    const data = [
      navigator.userAgent || '',
      navigator.language || '',
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.platform || ''
    ].join('|');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  }

  // 读已登入设备列表
  function getKnownDevices() {
    try {
      return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveKnownDevices(map) {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(map));
  }
  function addKnownDevice(fp, role) {
    const map = getKnownDevices();
    if (!map[fp]) map[fp] = { role, first: Date.now() };
    map[fp].last = Date.now();
    if (role) map[fp].role = role;
    saveKnownDevices(map);
  }
  function isKnownDevice(fp, role) {
    const map = getKnownDevices();
    return !!(map[fp] && (!role || map[fp].role === role));
  }
  function clearKnownDevice(fp) {
    const map = getKnownDevices();
    delete map[fp];
    saveKnownDevices(map);
  }
  function clearAllKnownDevices() {
    localStorage.removeItem(DEVICE_KEY);
  }
  function listKnownDevices() {
    return getKnownDevices();
  }

  /** v5.8.5:检查是否已登录(未过期 OR 设备记忆) */
  function check() {
    // 1) 先看设备指纹(永久)
    const fp = getMyFingerprint();
    const known = getKnownDevices();
    if (known[fp] && known[fp].role) {
      return {
        role: known[fp].role,
        ts: known[fp].first || Date.now(),
        remember: true,
        expires: 0,  // 永久
        viaDevice: true,  // 标记:来自设备记忆
        fp: fp
      };
    }
    // 2) 再看 30 天 session
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      try {
        const o = JSON.parse(saved);
        if (o && (o.role === 'main' || o.role === 'sub') && o.expires && o.expires > Date.now()) {
          // 顺便记录设备指纹(下次直接设备记忆)
          addKnownDevice(fp, o.role);
          return o;
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
    // v5.8.5:无论是否勾"记住",都把当前设备指纹加到 known(设备记忆)
    //  - 勾了 = session 30 天 + 设备记忆永久
    //  - 不勾 = 仅设备记忆永久(下次同设备直接进)
    const fp = getMyFingerprint();
    addKnownDevice(fp, role);
    const data = {
      role,
      ts: Date.now(),
      remember: !!remember,
      expires: remember ? Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000 : 0,
      fp: fp
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    return { ok: true, data };
  }

  /** 登出(清 session + 清当前设备记忆) */
  function logout() {
    const fp = getMyFingerprint();
    localStorage.removeItem(STORE_KEY);
    clearKnownDevice(fp);
  }

  /** 登录页面 HTML */
  function makeLoginScreen(role) {
    const knownList = listKnownDevices();
    const knownCount = Object.keys(knownList).length;
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
            <span>记住此设备(<b style="color:#fbbf24;">30 天</b>免登录 + <b style="color:#6ef09e;">设备永久记忆</b>)</span>
          </label>
          <button id="pwdBtn" class="login-btn">进入系统</button>
          ${knownCount > 0 ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:var(--text-3);">
            🔐 当前浏览器已记忆 <b style="color:#6ef09e;">${knownCount}</b> 个设备
            <button id="pwdClearKnown" style="margin-left:8px;background:rgba(255,80,96,.1);color:#ff8090;border:1px solid rgba(255,80,96,.2);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">清除记忆</button>
          </div>` : ''}
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
    const clearBtn = document.getElementById('pwdClearKnown');
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
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('确定要清除所有已记忆的设备?\n清除后,这些设备需要重新输入密码。')) return;
        clearAllKnownDevices();
        localStorage.removeItem(STORE_KEY);
        toast('✅ 已清除所有设备记忆,请重新输入密码');
        // 重新渲染登录页
        setTimeout(() => location.reload(), 800);
      });
    }
    setTimeout(() => input.focus(), 50);
  }

  return { check, login, logout, makeLoginScreen, bindLogin, MAIN_PWD, SUB_PWD, REMEMBER_DAYS, getMyFingerprint, listKnownDevices, clearKnownDevice, clearAllKnownDevices };
})();
