import React, { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Layers3, LockKeyhole } from "lucide-react";
import { authApi } from "../services/authApi.js";
import "./auth.css";

function initialMode() {
  return location.hash === "#/register" ? "register" : "login";
}

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onHash = () => setMode(initialMode());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function switchMode(next) {
    setError("");
    setPassword("");
    setConfirm("");
    location.hash = next === "register" ? "#/register" : "#/login";
    setMode(next);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "register"
          ? await authApi.register(displayName, email, password)
          : await authApi.login(email, password);
      location.hash = "#/home";
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="平台介绍">
        <div className="auth-brand">
          <span className="auth-brand-mark"><Layers3 size={24} strokeWidth={1.35} /></span>
          <span>GLADS <em>studio</em></span>
        </div>
        <div className="auth-art" aria-hidden="true">
          <div className="auth-art-ring ring-one" />
          <div className="auth-art-ring ring-two" />
          <div className="auth-art-glyph">敦</div>
          <div className="auth-art-line" />
        </div>
        <div className="auth-story-copy">
          <span>DIGITAL MURAL RESTORATION</span>
          <h1>让每一次修复判断<br />都能回到图像证据</h1>
          <p>敦煌壁画数字修复平台</p>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-kicker"><LockKeyhole size={15} /> 项目成员入口</div>
          <h2>{mode === "register" ? "创建账号" : "欢迎回来"}</h2>
          <p className="auth-subtitle">
            {mode === "register" ? "填写基本资料，创建项目协作账号。" : "登录后继续查看素材与复核记录。"}
          </p>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <label>
                <span>姓名或组内名称</span>
                <input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="用于复核记录署名" required minLength={2} maxLength={80} />
              </label>
            )}
            <label>
              <span>邮箱</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
            </label>
            <label>
              <span>密码</span>
              <div className="auth-password">
                <input type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="不少于 8 位字符" required minLength={8} />
                <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            {mode === "register" && (
              <label>
                <span>确认密码</span>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="再次输入密码" required minLength={8} />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "正在处理…" : mode === "register" ? "创建并进入" : "登录"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="auth-switch">
            {mode === "register" ? "已有账号？" : "还没有账号？"}
            <button type="button" onClick={() => switchMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "返回登录" : "注册账号"}</button>
          </div>
        </div>
        <div className="auth-foot">GLADS RESTORE · PROJECT WORKSPACE</div>
      </section>
    </main>
  );
}
