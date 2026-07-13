import { ROUTES } from "../../shared/constants/routes.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { sessionStore } from "./storage.mjs";

export function openExtensionPage(path) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

export function getCurrentTab() {
  return chrome.tabs.getCurrent();
}

export async function openWorkbench() {
  const { [STORAGE_KEYS.WORKBENCH_TAB_ID]: workbenchTabId } = await sessionStore.get(STORAGE_KEYS.WORKBENCH_TAB_ID);
  if (workbenchTabId) {
    try {
      await chrome.tabs.update(workbenchTabId, { active: true });
      return;
    } catch {
      await sessionStore.remove(STORAGE_KEYS.WORKBENCH_TAB_ID);
    }
  }
  const tab = await openExtensionPage(ROUTES.WORKBENCH);
  await sessionStore.set({ [STORAGE_KEYS.WORKBENCH_TAB_ID]: tab.id });
}
