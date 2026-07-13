export const localStore = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (values) => chrome.storage.local.set(values),
  remove: (keys) => chrome.storage.local.remove(keys)
};

export const sessionStore = {
  get: (keys) => chrome.storage.session.get(keys),
  set: (values) => chrome.storage.session.set(values),
  remove: (keys) => chrome.storage.session.remove(keys)
};

export function subscribeToLocalStorage(callback) {
  const listener = (changes, area) => {
    if (area === "local") callback(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
