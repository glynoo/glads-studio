import React, { useEffect, useRef, useState } from "react";
import { readPreferences } from "../../services/preferences.js";
import {
  Minus,
  Plus,
  Maximize2,
  Minimize2,
  Move,
  MapPin,
  RotateCcw,
  Link2,
  Columns2,
  Grid2X2,
  SplitSquareHorizontal,
} from "lucide-react";
export default function ImageViewer({
  candidate,
  setCandidate,
  run,
  assets,
  onPoint,
  focus,
  full,
  setFull,
}) {
  const [mode, setMode] = useState(() => readPreferences().comparisonMode),
    [sync, setSync] = useState(true),
    [view, setView] = useState({ z: 1, x: 0, y: 0 }),
    [views, setViews] = useState({}),
    [tool, setTool] = useState("move"),
    [layer, setLayer] = useState("none"),
    [opacity, setOpacity] = useState(() => readPreferences().maskOpacity),
    [split, setSplit] = useState(50),
    [coordinate, setCoordinate] = useState(null),
    [diff, setDiff] = useState(null),
    [aligned, setAligned] = useState(true);
  useEffect(() => {
    const apply = () => {
      const next = readPreferences();
      setMode(next.comparisonMode);
      setOpacity(next.maskOpacity);
    };
    window.addEventListener("glads-preferences-changed", apply);
    return () => window.removeEventListener("glads-preferences-changed", apply);
  }, []);
  useEffect(() => {
    setLayer("none");
    setView({ z: 1, x: 0, y: 0 });
    setViews({});
  }, [run.id]);
  useEffect(() => {
    if (focus) {
      setView({ z: 2, x: (0.5 - focus.x) * 200, y: (0.5 - focus.y) * 200 });
      setSync(true);
      setMode("pair");
    }
  }, [focus]);
  useEffect(() => {
    let disposed = false;
    setDiff(null);
    const a = new Image(),
      b = new Image();
    a.src = assets.original;
    b.src = assets[candidate];
    Promise.all([a.decode(), b.decode()])
      .then(() => {
        if (disposed) return;
        const ok = a.width === b.width && a.height === b.height && !run.failed;
        setAligned(ok);
        if (!ok) {
          setDiff(null);
          return;
        }
        const c = document.createElement("canvas");
        c.width = a.width;
        c.height = a.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(a, 0, 0);
        const first = ctx.getImageData(0, 0, c.width, c.height);
        ctx.drawImage(b, 0, 0);
        const second = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < first.data.length; i += 4) {
          const v = Math.max(
            ...[0, 1, 2].map((j) =>
              Math.abs(first.data[i + j] - second.data[i + j]),
            ),
          );
          second.data[i] = 224;
          second.data[i + 1] = 111;
          second.data[i + 2] = 52;
          second.data[i + 3] = v > 5 ? Math.min(240, v * 4) : 0;
        }
        ctx.putImageData(second, 0, 0);
        setDiff(c.toDataURL());
      })
      .catch(() => setAligned(false));
    return () => {
      disposed = true;
    };
  }, [candidate, run.failed, assets.original, assets[candidate]]);
  const zoom = (delta) => {
    setView((v) => ({ ...v, z: Math.max(1, Math.min(5, v.z + delta)) }));
    setViews((v) =>
      Object.fromEntries(
        Object.entries(v).map(([k, s]) => [
          k,
          { ...s, z: Math.max(1, Math.min(5, s.z + delta)) },
        ]),
      ),
    );
  };
  function tile(id, label) {
    const activeView = sync ? view : views[id] || view;
    return (
      <Tile
        key={id}
        id={id}
        label={label}
        selected={id === candidate}
        assets={assets}
        view={activeView}
        update={(fn) =>
          sync
            ? setView(fn)
            : setViews((v) => ({ ...v, [id]: fn(v[id] || view) }))
        }
        tool={tool}
        onPoint={onPoint}
        coordinate={setCoordinate}
        layer={layer}
        opacity={opacity}
        diff={diff}
        annotations={
          id === candidate
            ? run.annotations.filter((a) => a.candidate === candidate)
            : []
        }
        split={split}
        curtain={mode === "curtain"}
        candidate={candidate}
        onSelect={() => id.startsWith("R") && assets[id] && setCandidate(id)}
      />
    );
  }
  return (
    <section className={`panel comparison ${full ? "expanded" : ""}`}>
      <div className="comparison-heading">
        <div>
          <span className="eyebrow">EVIDENCE / 图像证据</span>
          <h2>
            候选比较 <span className="muted">{candidate}</span>
          </h2>
        </div>
        <div className="segmented">
          {[
            ["pair", "双图", Columns2],
            ["grid", "宫格", Grid2X2],
            ["curtain", "卷帘", SplitSquareHorizontal],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              className={mode === id ? "active" : ""}
              onClick={() => setMode(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
          <button
            aria-label={full ? "退出全屏" : "全屏检查"}
            onClick={() => setFull(!full)}
          >
            {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      <div className="viewer-toolbar">
        <div className="tool-group">
          <button
            className={tool === "move" ? "selected" : ""}
            onClick={() => setTool("move")}
            title="拖动图像"
          >
            <Move size={15} />
          </button>
          <button
            className={tool === "point" ? "selected" : ""}
            onClick={() => setTool("point")}
            aria-label="添加定位批注"
          >
            <MapPin size={15} />
          </button>
          <i />
          <button onClick={() => zoom(-0.25)} aria-label="缩小">
            <Minus size={15} />
          </button>
          <span className="zoom-label">{Math.round(view.z * 100)}%</span>
          <button onClick={() => zoom(0.25)} aria-label="放大">
            <Plus size={15} />
          </button>
          <button
            onClick={() => {
              setView({ z: 1, x: 0, y: 0 });
              setViews({});
            }}
            aria-label="适应画布"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="tool-group">
          <button
            disabled={!aligned}
            className={sync ? "selected" : ""}
            onClick={() => {
              setSync(!sync);
              setViews({});
            }}
          >
            <Link2 size={14} />
            <span>同步</span>
          </button>
          <select
            aria-label="证据叠加"
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
            disabled={!aligned}
          >
            <option value="none">无叠加</option>
            <option value="mask">精确执行掩码</option>
            <option value="diff">实际像素差异</option>
          </select>
          {layer !== "none" && (
            <input
              aria-label="叠加透明度"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={opacity}
              onChange={(e) => setOpacity(+e.target.value)}
            />
          )}
        </div>
      </div>
      {!aligned ? (
        <div className="alignment-error">
          图像尺寸／坐标校验未通过，已暂停同步比较与叠加。请查看运行详情。
        </div>
      ) : (
        <div className={`images mode-${mode}`}>
          {mode === "grid" ? (
            <>
              {tile("original", "原始图像")}
              {tile("mask", "融合执行掩码")}
              {["R3", "R7", "R12"].map((id) => tile(id, `候选 ${id}`))}
            </>
          ) : mode === "curtain" ? (
            tile(candidate, `原图 / 候选 ${candidate}`)
          ) : (
            <>
              {tile("original", "原始图像")}
              {tile(candidate, `候选 ${candidate}`)}
            </>
          )}
        </div>
      )}
      {mode === "curtain" && aligned && (
        <div className="curtain-control">
          <span>原图</span>
          <input
            type="range"
            aria-label="卷帘分界"
            min="0"
            max="100"
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
          <span>{candidate}</span>
        </div>
      )}
      <div className="viewer-foot">
        <span>
          <span className="status-dot" />{" "}
          {tool === "point"
            ? "点击候选图添加定位批注"
            : "拖动平移 · 同一坐标检查"}
        </span>
        <span>
          {coordinate
            ? `X ${coordinate.x} · Y ${coordinate.y}`
            : "640 × 640 px"}
          <span className="divider">/</span>
          {layer === "mask"
            ? "Golden20 精确融合掩码"
            : layer === "diff"
              ? "实际像素差异"
              : "Golden20 图像"}
        </span>
      </div>
    </section>
  );
}
function Tile({
  id,
  label,
  view,
  update,
  tool,
  onPoint,
  coordinate,
  layer,
  opacity,
  diff,
  annotations,
  curtain,
  split,
  candidate,
  onSelect,
  selected,
  assets,
}) {
  const plane = useRef(),
    drag = useRef();
  const point = (e) => {
    const b = plane.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  };
  return (
    <div className={`image-tile ${selected ? "chosen" : ""}`}>
      <div className="image-label">
        <span>{label}</span>
        {id.startsWith("R") && assets[id] && (
          <button onClick={onSelect} aria-label={`查看 ${id}`}>
            {selected ? "当前查看" : "查看候选"} ↗
          </button>
        )}
      </div>
      <div
        className={`image-viewport ${tool}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (tool === "point") {
            if (id.startsWith("R") && assets[id]) {
              const bounds = plane.current.getBoundingClientRect();
              if (
                e.clientX < bounds.left ||
                e.clientX > bounds.right ||
                e.clientY < bounds.top ||
                e.clientY > bounds.bottom
              )
                return;
              onSelect();
              onPoint({ ...point(e), candidate: id });
            }
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            b: e.currentTarget.getBoundingClientRect(),
          };
        }}
        onPointerMove={(e) => {
          const p = point(e);
          coordinate({ x: Math.round(p.x * 639), y: Math.round(p.y * 639) });
          if (drag.current) {
            const d = drag.current;
            update((v) => ({
              ...v,
              x: v.x + ((e.clientX - d.x) / d.b.width) * 100,
              y: v.y + ((e.clientY - d.y) / d.b.height) * 100,
            }));
            d.x = e.clientX;
            d.y = e.clientY;
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div
          className="image-plane"
          ref={plane}
          style={{
            transform: `translate(${view.x}%,${view.y}%) scale(${view.z})`,
          }}
        >
          {assets[id] ? (
            <img
              draggable="false"
              src={curtain ? assets.original : assets[id]}
              alt={label}
            />
          ) : (
            <div className="missing-candidate">暂无候选图像</div>
          )}
          {curtain && (
            <>
              <img
                draggable="false"
                className="overlay"
                src={assets[candidate]}
                alt={`候选 ${candidate} 卷帘`}
                style={{ clipPath: `inset(0 0 0 ${split}%)` }}
              />
              <div className="curtain-line" style={{ left: `${split}%` }}>
                <span>↔</span>
              </div>
            </>
          )}
          {layer === "mask" && id !== "mask" && assets[id] && (
            <div
              className="exact-mask-overlay"
              role="img"
              aria-label="精确执行掩码叠加"
              style={{
                opacity,
                maskImage: `url(${assets.mask})`,
                WebkitMaskImage: `url(${assets.mask})`,
                maskMode: "luminance",
              }}
            />
          )}
          {layer === "diff" &&
            diff &&
            (id === "original" || id === candidate) && (
              <img
                className="overlay"
                draggable="false"
                src={diff}
                alt="实际像素差异"
                style={{ opacity }}
              />
            )}
          {annotations.map((a, i) => (
            <span
              key={a.id}
              className="annotation-pin"
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
