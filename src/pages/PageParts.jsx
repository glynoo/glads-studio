import React from "react";
import { AlertTriangle, ArrowUpRight, LoaderCircle } from "lucide-react";

export const caseUrl = (id) => `#/workbench?case=${encodeURIComponent(id)}`;

export function PageFrame({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className = "",
}) {
  return (
    <main className={`inner-page ${className}`}>
      <div className="inner-heading">
        <div>
          <div className="inner-breadcrumb">GLADS Restore / {eyebrow}</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions && <div className="inner-actions">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export function DataState({ loading, error, children }) {
  if (loading)
    return (
      <div className="page-state">
        <LoaderCircle size={22} className="spin" />
        正在读取本地案例…
      </div>
    );
  if (error)
    return (
      <div className="page-state">
        <AlertTriangle size={24} />
        <strong>本地服务暂时不可用</strong>
        <span>{error}</span>
        <span>请在项目目录运行 npm run dev。</span>
      </div>
    );
  return children;
}

export function CaseAnchor({ id, children, className = "" }) {
  return (
    <a className={className} href={caseUrl(id)}>
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}

export function humanTime(value) {
  if (!value) return "尚无记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
