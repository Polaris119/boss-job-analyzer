export function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function simpleList(items) {
  const list = node("ul");
  items.forEach((item) => list.append(node("li", "", item)));
  return list;
}
