export const decisionLabels = {
  approve: "人工采纳参考候选",
  reject: "拒绝候选",
  secondary_repair_required: "需要二次修复",
  defer_expert: "转专家复核",
};
export const riskLabels = {
  large_connected_component_semantic_ambiguity: "大面积连通区域，语义不明确",
  large_total_missing_region: "缺失区域较大",
};
export function statusLabel(item) {
  const latest = item.latestReview || item.reviews?.at(-1);
  return latest
    ? decisionLabels[latest.decision]
    : item.semanticRisk
      ? "高风险待复核"
      : "待人工复核";
}
