export type StorageDriver = "sqlite" | "browser";

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getStorageDriver(): StorageDriver {
  return isTauriRuntime() ? "sqlite" : "browser";
}

export function getStorageDriverLabel(driver: StorageDriver) {
  return driver === "sqlite" ? "Local SQLite • Synced" : "Browser Local Preview";
}
