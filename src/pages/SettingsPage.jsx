import React, { useEffect, useState } from "react";
import {
  Check,
  Download,
  HardDrive,
  Image,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { reviewApi } from "../services/reviewApi.js";
import {
  defaults,
  readPreferences,
  savePreferences,
} from "../services/preferences.js";
import { useCases } from "./useCases.js";
import { DataState, PageFrame } from "./PageParts.jsx";

export default function SettingsPage({ user }) {
  const { cases, loading, error } = useCases();
  const [preferences, setPreferences] = useState(readPreferences);
  const [health, setHealth] = useState(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    reviewApi
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);
  const candidates = cases.reduce(
    (sum, item) =>
      sum + Object.values(item.variants).filter((entry) => entry.image).length,
    0,
  );
  function update(change) {
    try {
      setPreferences(savePreferences(change));
      setMessage("显示偏好已保存");
    } catch {
      setMessage("保存失败，请检查浏览器存储设置");
    }
  }

  return (
    <PageFrame
      eyebrow="工作环境"
      title="设置"
      subtitle="调整图像检查方式，查看当前资料与记录存储。"
      className="page-settings"
    >
      <DataState loading={loading} error={error}>
        <div className="settings-grid">
          <section className="content-card settings-account">
            <div className="content-head"><div><span className="eyebrow">ACCOUNT / 账号资料</span><h2>项目成员</h2></div></div>
            <dl className="source-definition">
              <div><dt>显示名称</dt><dd>{user.displayName}</dd></div>
              <div><dt>联系邮箱</dt><dd>{user.email}</dd></div>
            </dl>
          </section>
          <section className="content-card settings-main">
            <div className="content-head">
              <div>
                <span className="eyebrow">DISPLAY / 显示偏好</span>
                <h2>图像检查</h2>
              </div>
              <SlidersHorizontal size={20} />
            </div>
            <p className="settings-intro">
              偏好保存在当前浏览器，返回工作台后立即生效；检查时仍可随时切换。
            </p>
            <div className="setting-option">
              <div>
                <strong>默认比较方式</strong>
                <small>进入工作台时采用的图像布局</small>
              </div>
              <select
                aria-label="默认比较方式"
                value={preferences.comparisonMode}
                onChange={(e) => update({ comparisonMode: e.target.value })}
              >
                <option value="pair">双图对照</option>
                <option value="grid">宫格浏览</option>
                <option value="curtain">卷帘比较</option>
              </select>
            </div>
            <div className="setting-option">
              <div>
                <strong>掩码叠加透明度</strong>
                <small>在工作台开启精确执行掩码时使用</small>
              </div>
              <div className="setting-range">
                <input
                  aria-label="默认掩码透明度"
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={preferences.maskOpacity}
                  onChange={(e) =>
                    update({ maskOpacity: Number(e.target.value) })
                  }
                />
                <span>{Math.round(preferences.maskOpacity * 100)}%</span>
              </div>
            </div>
            <div className="settings-bottom">
              <button onClick={() => update(defaults)}>
                <RotateCcw size={15} /> 恢复默认显示
              </button>
              <span role="status">
                {message && (
                  <>
                    <Check size={14} />
                    {message}
                  </>
                )}
              </span>
            </div>
          </section>
          <section className="content-card settings-source">
            <div className="content-head">
              <div>
                <span className="eyebrow">SOURCE / 当前资料</span>
                <h2>Golden20</h2>
              </div>
              <Image size={20} />
            </div>
            <div className="source-stat-grid">
              <div>
                <strong>{cases.length}</strong>
                <span>案例</span>
              </div>
              <div>
                <strong>{candidates}</strong>
                <span>候选图像</span>
              </div>
            </div>
            <dl className="source-definition">
              <div>
                <dt>处理来源</dt>
                <dd>Big-LaMa</dd>
              </div>
              <div>
                <dt>图像尺寸</dt>
                <dd>640 × 640 px</dd>
              </div>
              <div>
                <dt>服务状态</dt>
                <dd>
                  <span className="live-dot" />
                  {health?.ok ? "运行正常" : "正在检查"}
                </dd>
              </div>
              <div>
                <dt>人工记录</dt>
                <dd>本机保存</dd>
              </div>
            </dl>
          </section>
          <section className="content-card settings-export">
            <div>
              <span className="eyebrow">DATA / 记录管理</span>
              <h2>导出与备份</h2>
              <p>
                导出人工判断、定位批注和案例索引。导出不会改变任何案例的判断状态。
              </p>
            </div>
            <a
              className="inner-primary-link"
              href={reviewApi.exportUrl}
              download
            >
              <Download size={16} /> 下载记录包
            </a>
          </section>
          <section className="content-card settings-help">
            <div className="content-head">
              <div>
                <span className="eyebrow">GUIDE / 使用提示</span>
                <h2>工作方式</h2>
              </div>
              <HardDrive size={20} />
            </div>
            <div className="help-steps">
              <div>
                <span>01</span>
                <p>从首页待办或素材池进入案例，核对来源与候选。</p>
              </div>
              <div>
                <span>02</span>
                <p>在工作台比较图像，定位问题并记录判断依据。</p>
              </div>
              <div>
                <span>03</span>
                <p>在复核记录中筛选案例，回看历史并导出。</p>
              </div>
            </div>
          </section>
        </div>
      </DataState>
    </PageFrame>
  );
}
