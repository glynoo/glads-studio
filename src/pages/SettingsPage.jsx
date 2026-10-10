import React, { useEffect, useState } from "react";
import { Check, Download, RotateCcw, ShieldCheck } from "lucide-react";
import { authApi } from "../services/authApi.js";
import { reviewApi } from "../services/reviewApi.js";
import { defaults, readPreferences, savePreferences } from "../services/preferences.js";
import { decisionLabels } from "../features/workbench/reviewLabels.js";
import { DataState, humanTime, PageFrame } from "./PageParts.jsx";
import { useCases } from "./useCases.js";
import "./settings.css";

const SECTIONS = [
  ["account", "账号资料"], ["preferences", "工作台偏好"], ["models", "模型与处理"],
  ["security", "安全与审计"], ["help", "帮助与关于"],
];

export default function SettingsPage({ user, onUserChanged }) {
  const { cases, loading, error } = useCases();
  const [section, setSection] = useState("account");
  const [preferences, setPreferences] = useState(readPreferences);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [activity, setActivity] = useState([]);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    reviewApi.health().then(setHealth).catch(() => setHealth(null));
    authApi.activity().then(({ items }) => setActivity(items)).catch(() => {});
  }, []);

  function choose(value) {
    setSection(value); setMessage(""); setFormError("");
  }
  function updatePreference(change) {
    try { setPreferences(savePreferences(change)); setMessage("偏好已保存"); }
    catch { setFormError("保存失败，请检查浏览器存储设置"); }
  }
  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setFormError("");
    try {
      const { user: updated } = await authApi.updateProfile(displayName);
      onUserChanged(updated); setMessage("账号资料已保存");
    } catch (reason) { setFormError(reason.message); }
    finally { setBusy(false); }
  }
  async function savePassword(event) {
    event.preventDefault(); setBusy(true); setFormError("");
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setMessage("密码已更新");
    } catch (reason) { setFormError(reason.message); }
    finally { setBusy(false); }
  }

  const candidateCount = cases.reduce((sum, item) => sum + Object.values(item.variants).filter((entry) => entry.image).length, 0);
  return (
    <PageFrame eyebrow="工作环境" title="设置" subtitle="管理账号资料、图像检查偏好与复核记录。" className="page-settings settings-redesign">
      <DataState loading={loading} error={error}>
        <div className="settings-shell">
          <aside className="settings-side" aria-label="设置分类">
            <span className="settings-side-kicker">SETTINGS / 设置</span>
            <h2>个人与工作环境</h2>
            <nav>{SECTIONS.map(([key, label], index) => (
              <button key={key} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => choose(key)}>
                <span>{String(index + 1).padStart(2, "0")}</span>{label}
              </button>
            ))}</nav>
            <p>GLADS studio<br />项目工作空间</p>
          </aside>
          <section className="settings-stage content-card">
            <div className="settings-stage-head"><span>0{SECTIONS.findIndex(([key]) => key === section) + 1} / 05</span><h2>{SECTIONS.find(([key]) => key === section)?.[1]}</h2></div>
            {section === "account" && (
              <form onSubmit={saveProfile} className="settings-section">
                <div className="settings-section-title"><h3>基本资料</h3><p>用于账号识别与复核记录署名</p></div>
                <div className="settings-avatar-row"><span className="settings-avatar">{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><small>项目成员</small></div></div>
                <label className="settings-field"><span>显示名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={80} required /></label>
                <div className="settings-field"><span>联系邮箱</span><strong>{user.email}</strong></div>
                <div className="settings-section-title secondary"><h3>项目身份</h3><p>当前账号在复核记录中使用以下身份</p></div>
                <div className="settings-field"><span>项目角色</span><strong>项目成员</strong></div>
                <div className="settings-actions"><button type="submit" className="settings-save" disabled={busy}>保存资料</button></div>
              </form>
            )}
            {section === "preferences" && (
              <div className="settings-section">
                <div className="settings-section-title"><h3>显示与操作</h3><p>调整图像检查时的默认视图</p></div>
                <label className="settings-field"><span>候选对比方式</span><select value={preferences.comparisonMode} onChange={(event) => updatePreference({ comparisonMode: event.target.value })}><option value="pair">并排对比</option><option value="grid">宫格浏览</option><option value="curtain">卷帘比较</option></select></label>
                <label className="settings-field"><span>掩码叠加透明度</span><div className="settings-slider"><input type="range" min="0.1" max="0.9" step="0.05" value={preferences.maskOpacity} onChange={(event) => updatePreference({ maskOpacity: Number(event.target.value) })} /><strong>{Math.round(preferences.maskOpacity * 100)}%</strong></div></label>
                <div className="settings-actions"><button type="button" onClick={() => updatePreference(defaults)}><RotateCcw size={15} /> 恢复默认</button></div>
              </div>
            )}
            {section === "models" && (
              <div className="settings-section">
                <div className="settings-section-title"><h3>处理资料</h3><p>查看当前案例所关联的图像与候选来源</p></div>
                <div className="settings-model-cards"><div><span>案例资料</span><strong>修复参考案例</strong><small>{cases.length} 个案例 · 640 × 640 px</small></div><div><span>候选来源</span><strong>Big-LaMa</strong><small>{candidateCount} 张参考候选</small></div></div>
                <div className="settings-field"><span>候选尺度</span><strong>R3 / R7 / R12</strong></div>
                <div className="settings-field"><span>融合执行掩码</span><strong>按案例关联</strong></div>
                <div className="settings-field"><span>资料服务</span><strong className="settings-service"><i />{health?.ok ? "运行正常" : "正在检查"}</strong></div>
              </div>
            )}
            {section === "security" && (
              <div className="settings-section">
                <div className="settings-section-title"><h3>账号安全</h3><p>更新登录密码并查看最近的人工判断</p></div>
                <form onSubmit={savePassword} className="settings-password-form"><label className="settings-field"><span>当前密码</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="settings-field"><span>新密码</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><div className="settings-actions"><button type="submit" className="settings-save" disabled={busy}>更新密码</button></div></form>
                <div className="settings-section-title secondary"><h3>审计记录</h3><p>最近的人工判断会记录案例、候选与时间</p></div>
                <div className="settings-activity">{activity.length ? activity.map((entry, index) => <div key={`${entry.case_id}-${entry.created_at}-${index}`}><ShieldCheck size={16} /><strong>{entry.case_id} · {entry.candidate || "整组候选"}</strong><span>{decisionLabels[entry.decision]}</span><small>{humanTime(entry.created_at)}</small></div>) : <p>此账号暂无人工判断记录</p>}</div>
                <a className="settings-export" href={reviewApi.exportUrl} download><Download size={16} /> 下载复核记录包</a>
              </div>
            )}
            {section === "help" && (
              <div className="settings-section">
                <div className="settings-section-title"><h3>使用支持</h3><p>从素材定位到候选复核的操作顺序</p></div>
                <div className="settings-guide"><div><span>01</span><strong>上传与定位素材</strong><p>在素材池按洞窟、区域、图片和切片查找，或上传新的壁画图像。</p></div><div><span>02</span><strong>检查候选</strong><p>在工作台对照原图、执行掩码与不同尺度候选，记录局部问题。</p></div><div><span>03</span><strong>复核与导出</strong><p>写下判断理由，回看历史记录并导出复核资料。</p></div></div>
                <div className="settings-section-title secondary"><h3>常见问题</h3></div>
                <details><summary>如何查看同一案例的其他候选？</summary><p>进入工作台，在候选区切换 R3、R7 或 R12。</p></details>
                <details><summary>如何回看之前的判断？</summary><p>在复核记录中选择案例，右侧会显示最近判断和历史。</p></details>
                <details><summary>图片上传后在哪里查看？</summary><p>进入素材池的上传素材页，按洞窟和区域展开即可查看。</p></details>
              </div>
            )}
            {(message || formError) && <p className={`settings-feedback ${formError ? "error" : ""}`} role={formError ? "alert" : "status"}>{formError || <><Check size={15} /> {message}</>}</p>}
          </section>
        </div>
      </DataState>
    </PageFrame>
  );
}
