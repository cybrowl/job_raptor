import { writable } from "svelte/store";
import {
  deleteApplication,
  getPersistenceDriver,
  listApplications,
  saveApplication,
  updateApplicationStatus,
} from "$lib/local/persistence";
import type { StorageDriver } from "$lib/runtime";
import type {
  DashboardMetrics,
  JobApplication, JobApplicationInput,
} from "$lib/types";
import { computeDashboardMetrics, sortApplicationsByRecent } from "$lib/utils";

interface ApplicationsState {
  items: JobApplication[];
  analytics: DashboardMetrics;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  storage: StorageDriver;
}

function buildState(
  items: JobApplication[],
  overrides: Partial<ApplicationsState> = {}
): ApplicationsState {
  return {
    items,
    analytics: computeDashboardMetrics(items),
    loading: false,
    syncing: false,
    error: null,
    storage: getPersistenceDriver(),
    ...overrides,
  };
}
const store = writable<ApplicationsState>(buildState([]));
const { subscribe, set, update } = store;

async function load() {
  update((state) => ({ ...state, loading: true, error: null }));

  try {
    const items = sortApplicationsByRecent(await listApplications());
    set(buildState(items));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    update((state) => ({ ...state, loading: false, syncing: false, error: message }));
  }
}

async function add(input: JobApplicationInput) {
  update((current) => ({ ...current, syncing: true, error: null }));

  try {
    await saveApplication(null, input);
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    update((current) => ({ ...current, syncing: false, error: message }));
    throw error;
  }
}

async function save(id: number | null, input: JobApplicationInput) {
  if (id === null) {
    await add(input);
    return;
  }

  update((current) => ({ ...current, syncing: true, error: null }));

  try {
    await saveApplication(id, input);
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    update((current) => ({ ...current, syncing: false, error: message }));
    throw error;
  }
}

async function saveMany(entries: Array<{ id: number; input: JobApplicationInput }>) {
  if (entries.length === 0) {
    return;
  }

  update((current) => ({ ...current, syncing: true, error: null }));

  try {
    for (const entry of entries) {
      await saveApplication(entry.id, entry.input);
    }

    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    update((current) => ({ ...current, syncing: false, error: message }));
    throw error;
  }
}

async function setStatus(id: number, status: string) {
  update((current) => ({ ...current, syncing: true, error: null }));

  try {
    await updateApplicationStatus(id, status);
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    update((current) => ({ ...current, syncing: false, error: message }));
    throw error;
  }
}

async function remove(id: number) {
  update((current) => ({ ...current, syncing: true, error: null }));

  try {
    await deleteApplication(id);
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    update((current) => ({ ...current, syncing: false, error: message }));
    throw error;
  }
}

function clearError() {
  update((state) => ({ ...state, error: null }));
}

export const applicationsStore = {
  subscribe,
  load,
  add,
  save,
  saveMany,
  setStatus,
  remove,
  clearError,
};
