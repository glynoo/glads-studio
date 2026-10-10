import React, { useState } from "react";

export default function PoolTagField({
  tags,
  available = [],
  onChange,
  disabled,
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  function add() {
    const name = draft.trim();
    if (!name || name.length > 40 || tags.length >= 30) {
      setError("标签为 1 至 40 字，最多 30 个");
      return;
    }
    onChange([...new Set([...tags, name])]);
    setDraft("");
    setError("");
  }
  return (
    <fieldset className="pool-tags">
      <legend>内容标签</legend>
      <div className="pool-tag-list">
        {[...new Set([...available, ...tags])].map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tags.includes(tag)}
            disabled={disabled}
            onClick={() =>
              onChange(
                tags.includes(tag)
                  ? tags.filter((t) => t !== tag)
                  : [...tags, tag],
              )
            }
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="pool-tag-input">
        <input
          aria-label="新标签名称"
          maxLength={40}
          placeholder="添加新标签"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" disabled={disabled} onClick={add}>
          添加标签
        </button>
      </div>
      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
