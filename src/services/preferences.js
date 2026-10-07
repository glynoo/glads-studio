const KEY = "glads-display-preferences";
export const defaults = { comparisonMode: "pair", maskOpacity: 0.45 };

export function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      comparisonMode: ["pair", "grid", "curtain"].includes(saved.comparisonMode)
        ? saved.comparisonMode
        : defaults.comparisonMode,
      maskOpacity:
        typeof saved.maskOpacity === "number" &&
        saved.maskOpacity >= 0 &&
        saved.maskOpacity <= 1
          ? saved.maskOpacity
          : defaults.maskOpacity,
    };
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(change) {
  const next = { ...readPreferences(), ...change };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("glads-preferences-changed"));
  return next;
}
