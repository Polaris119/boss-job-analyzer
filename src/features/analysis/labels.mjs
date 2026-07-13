export function requirementStatusLabel(value) {
  return ({ met: "已满足", partial: "部分满足", missing: "缺失" })[value] || "缺失";
}
