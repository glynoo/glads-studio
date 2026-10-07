import React from "react";
export default function Placeholder({ title }) {
  return (
    <main className="placeholder-page">
      <div className="breadcrumb">敦煌壁画数字修复 / {title}</div>
      <h1>{title}</h1>
      <section className="blank-canvas">
        <span>{title}</span>
        <p>页面留白 · 等待后续协作开发</p>
      </section>
    </main>
  );
}
