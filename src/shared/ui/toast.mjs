export function showToast(element, message, success, duration = 3000) {
  element.textContent = message;
  element.style.background = success ? "#087c45" : "#b42318";
  element.hidden = false;
  setTimeout(() => { element.hidden = true; }, duration);
}
