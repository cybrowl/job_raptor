import Database from "@tauri-apps/plugin-sql";
import { getStorageDriver, type StorageDriver } from "$lib/runtime";
import type { JobApplication, JobApplicationInput, ResumeProfile } from "$lib/types";
import { sortApplicationsByRecent } from "$lib/utils";

const DB_URL = "sqlite:job-raptor.db";
const BROWSER_STATE_KEY = "job-raptor.browser-state.v1";
const XAI_KEY_SETTING = "xai_api_key";
const XAI_MODEL_SETTING = "xai_model";
const RESUME_PROFILE_SETTING = "resume_profile";
const PAPER_DRAFT_SETTING = "paper_draft";
const BACKUP_KIND = "job-raptor-backup";
const LEGACY_BACKUP_KIND = "jobflow-backup";

export interface LocalSettings {
  xAiApiKey: string;
  xAiModel: string;
  resumeProfile: ResumeProfile;
  paperDraftText: string;
}

export interface JobRaptorBackup {
  kind: typeof BACKUP_KIND;
  version: 1;
  exportedAt: string;
  storage: StorageDriver;
  applications: JobApplication[];
  settings: LocalSettings;
}

interface BrowserState {
  nextId: number;
  applications: JobApplication[];
  settings: LocalSettings;
}

interface ApplicationRow {
  id: number;
  url: string;
  company: string;
  title: string;
  location: string;
  salary: string | null;
  applied_date: number;
  status: string;
  source: string;
  notes: string;
  tags: string;
  confidence: number | null;
  parse_confidence: number | null;
  fit_summary: string;
  job_description: string;
  created_at: number;
  last_updated: number;
}

interface TableInfoRow {
  name: string;
}

interface PickedBackupFile {
  text: string;
  name: string;
}

declare global {
  var __jobRaptorDbPromise: Promise<Database> | undefined;
  var __jobRaptorSqliteQueue: Promise<void> | undefined;
}

function getGlobalPersistenceState() {
  return globalThis as typeof globalThis & {
    __jobRaptorDbPromise?: Promise<Database>;
    __jobRaptorSqliteQueue?: Promise<void>;
  };
}

function createEmptyResumeProfile(): ResumeProfile {
  return {
    rawText: "",
    skills: [],
    summary: "",
    updatedAt: null,
  };
}

function createEmptyBrowserState(): BrowserState {
  return {
    nextId: 1,
    applications: [],
    settings: {
      xAiApiKey: "",
      xAiModel: "grok-4-fast-non-reasoning",
      resumeProfile: createEmptyResumeProfile(),
      paperDraftText: "",
    },
  };
}

function readBrowserState() {
  if (typeof window === "undefined") {
    return createEmptyBrowserState();
  }

  const raw = window.localStorage.getItem(BROWSER_STATE_KEY);

  if (!raw) {
    return createEmptyBrowserState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowserState>;
    const applications = Array.isArray(parsed.applications) ? parsed.applications : [];
    const nextId =
      typeof parsed.nextId === "number" && Number.isFinite(parsed.nextId)
        ? parsed.nextId
        : applications.reduce((max, application) => Math.max(max, application.id), 0) + 1;

    return {
      nextId,
      applications,
      settings: {
        xAiApiKey:
          typeof parsed.settings?.xAiApiKey === "string" ? parsed.settings.xAiApiKey : "",
        xAiModel:
          typeof parsed.settings?.xAiModel === "string" && parsed.settings.xAiModel.trim()
            ? parsed.settings.xAiModel.trim()
            : "grok-4-fast-non-reasoning",
        resumeProfile: normalizeResumeProfile(parsed.settings?.resumeProfile),
        paperDraftText:
          typeof parsed.settings?.paperDraftText === "string"
            ? parsed.settings.paperDraftText
            : "",
      },
    };
  } catch (error) {
    return createEmptyBrowserState();
  }
}

function writeBrowserState(state: BrowserState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BROWSER_STATE_KEY, JSON.stringify(state));
}

function normalizeSettings(raw: unknown): LocalSettings {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    xAiApiKey: typeof candidate.xAiApiKey === "string" ? candidate.xAiApiKey.trim() : "",
    xAiModel:
      typeof candidate.xAiModel === "string" && candidate.xAiModel.trim()
        ? candidate.xAiModel.trim()
        : "grok-4-fast-non-reasoning",
    resumeProfile: normalizeResumeProfile(candidate.resumeProfile),
    paperDraftText:
      typeof candidate.paperDraftText === "string" ? candidate.paperDraftText : "",
  };
}

function normalizeResumeProfile(raw: unknown): ResumeProfile {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    rawText: typeof candidate.rawText === "string" ? candidate.rawText.trim() : "",
    skills: Array.isArray(candidate.skills)
      ? candidate.skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0)
      : [],
    summary: typeof candidate.summary === "string" ? candidate.summary.trim() : "",
    updatedAt:
      typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : null,
  };
}

function normalizeApplication(raw: unknown): JobApplication {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = candidate.id;
  const url = candidate.url;
  const company = candidate.company;
  const title = candidate.title;
  const location = candidate.location;
  const salary = candidate.salary;
  const appliedDate = candidate.appliedDate;
  const status = candidate.status;
  const source = candidate.source;
  const notes = candidate.notes;
  const confidence = candidate.confidence;
  const parseConfidence = candidate.parseConfidence;
  const fitSummary = candidate.fitSummary;
  const jobDescription = candidate.jobDescription;
  const createdAt = candidate.createdAt;
  const lastUpdated = candidate.lastUpdated;
  const normalizedLocation = typeof location === "string" ? location : "Location Not Listed";
  const normalizedSalary = typeof salary === "string" ? salary : null;
  const normalizedConfidence = typeof confidence === "number" ? confidence : null;
  const normalizedParseConfidence =
    typeof parseConfidence === "number" ? parseConfidence : null;

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id: typeof id === "number" ? id : 0,
    url: typeof url === "string" ? url : "",
    company: typeof company === "string" ? company : "",
    title: typeof title === "string" ? title : "",
    location: normalizedLocation,
    salary: normalizedSalary,
    appliedDate: typeof appliedDate === "number" ? appliedDate : Date.now(),
    status: typeof status === "string" ? status : "Applied",
    source: typeof source === "string" ? source : "manual",
    notes: typeof notes === "string" ? notes : "",
    tags,
    confidence: normalizedConfidence,
    parseConfidence: normalizedParseConfidence,
    fitSummary: typeof fitSummary === "string" ? fitSummary : "",
    jobDescription: typeof jobDescription === "string" ? jobDescription : "",
    createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
    lastUpdated: typeof lastUpdated === "number" ? lastUpdated : Date.now(),
  };
}

function parseBackup(raw: unknown): JobRaptorBackup {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (
    (candidate.kind !== BACKUP_KIND && candidate.kind !== LEGACY_BACKUP_KIND) ||
    candidate.version !== 1
  ) {
    throw new Error("That backup file is not a supported Job Raptor export.");
  }

  const applications = Array.isArray(candidate.applications)
    ? candidate.applications.map(normalizeApplication)
    : [];

  return {
    kind: BACKUP_KIND,
    version: 1,
    exportedAt:
      typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
    storage:
      candidate.storage === "sqlite" || candidate.storage === "browser"
        ? candidate.storage
        : getStorageDriver(),
    applications: applications
      .filter((application) => application.id > 0)
      .sort((left, right) => right.lastUpdated - left.lastUpdated || right.id - left.id),
    settings: normalizeSettings(candidate.settings),
  };
}

export function parseBackupText(text: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("That backup file is not valid JSON.");
  }

  return parseBackup(parsed);
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch (error) {
    return [];
  }
}

function fromRow(row: ApplicationRow): JobApplication {
  return {
    id: row.id,
    url: row.url,
    company: row.company,
    title: row.title,
    location: row.location,
    salary: row.salary,
    appliedDate: row.applied_date,
    status: row.status,
    source: row.source,
    notes: row.notes,
    tags: parseTags(row.tags),
    confidence: row.confidence,
    parseConfidence: row.parse_confidence,
    fitSummary: row.fit_summary,
    jobDescription: row.job_description,
    createdAt: row.created_at,
    lastUpdated: row.last_updated,
  };
}

async function getDatabase() {
  if (getStorageDriver() !== "sqlite") {
    throw new Error("SQLite is only available inside the Tauri desktop shell.");
  }

  const globalState = getGlobalPersistenceState();

  globalState.__jobRaptorDbPromise ??= (async () => {
    const db = await Database.load(DB_URL);
    await configureDatabase(db);
    await ensureApplicationColumns(db);
    return db;
  })();

  return globalState.__jobRaptorDbPromise;
}

async function configureDatabase(db: Database) {
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA busy_timeout = 5000");
  await db.execute("PRAGMA synchronous = NORMAL");
}

function isLockedDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked/i.test(message) || /\(code:\s*5\)/i.test(message);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryLockedDatabaseOperation<T>(
  operation: () => Promise<T>,
  attempts = 4
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isLockedDatabaseError(error) || attempt === attempts - 1) {
        throw error;
      }

      await sleep(120 * (attempt + 1));
    }
  }

  throw lastError;
}

async function runSqliteTask<T>(task: (db: Database) => Promise<T>) {
  const globalState = getGlobalPersistenceState();
  const previous = globalState.__jobRaptorSqliteQueue ?? Promise.resolve();

  let release!: () => void;
  globalState.__jobRaptorSqliteQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    const db = await getDatabase();
    return await retryLockedDatabaseOperation(() => task(db));
  } finally {
    release();
  }
}

async function ensureApplicationColumns(db: Database) {
  const columns = await db.select<TableInfoRow[]>("PRAGMA table_info(applications)");

  if (!columns.length) {
    return;
  }

  const names = new Set(columns.map((column) => column.name));

  if (!names.has("parse_confidence")) {
    await db.execute("ALTER TABLE applications ADD COLUMN parse_confidence REAL");
  }

  if (!names.has("fit_summary")) {
    await db.execute("ALTER TABLE applications ADD COLUMN fit_summary TEXT NOT NULL DEFAULT ''");
  }

  if (!names.has("job_description")) {
    await db.execute(
      "ALTER TABLE applications ADD COLUMN job_description TEXT NOT NULL DEFAULT ''"
    );
  }
}

export function getPersistenceDriver(): StorageDriver {
  return getStorageDriver();
}

export async function listApplications() {
  if (getStorageDriver() === "sqlite") {
    const rows = await runSqliteTask((db) =>
      db.select<ApplicationRow[]>(
        `SELECT
          id,
          url,
          company,
          title,
          location,
          salary,
          applied_date,
          status,
          source,
          notes,
          tags,
          confidence,
          parse_confidence,
          fit_summary,
          job_description,
          created_at,
          last_updated
        FROM applications
        ORDER BY last_updated DESC, id DESC`
      )
    );

    return rows.map(fromRow);
  }

  return sortApplicationsByRecent(readBrowserState().applications.map(normalizeApplication));
}

export async function saveApplication(id: number | null, input: JobApplicationInput) {
  const now = Date.now();

  if (getStorageDriver() === "sqlite") {
    await runSqliteTask(async (db) => {
      if (id === null) {
        await db.execute(
          `INSERT INTO applications (
            url,
            company,
            title,
            location,
            salary,
            applied_date,
            status,
            source,
            notes,
            tags,
            confidence,
            parse_confidence,
            fit_summary,
            job_description,
            created_at,
            last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.url,
            input.company,
            input.title,
            input.location,
            input.salary,
            input.appliedDate,
            input.status,
            input.source,
            input.notes,
            JSON.stringify(input.tags),
            input.confidence,
            input.parseConfidence,
            input.fitSummary,
            input.jobDescription,
            now,
            now,
          ]
        );
        return;
      }

      await db.execute(
        `UPDATE applications
        SET
          url = ?,
          company = ?,
          title = ?,
          location = ?,
          salary = ?,
          applied_date = ?,
          status = ?,
          source = ?,
          notes = ?,
          tags = ?,
          confidence = ?,
          parse_confidence = ?,
          fit_summary = ?,
          job_description = ?,
          last_updated = ?
        WHERE id = ?`,
        [
          input.url,
          input.company,
          input.title,
          input.location,
          input.salary,
          input.appliedDate,
          input.status,
          input.source,
          input.notes,
          JSON.stringify(input.tags),
          input.confidence,
          input.parseConfidence,
          input.fitSummary,
          input.jobDescription,
          now,
          id,
        ]
      );
    });
    return;
  }

  const state = readBrowserState();

  if (id === null) {
    state.applications = [
      {
        id: state.nextId,
        ...input,
        createdAt: now,
        lastUpdated: now,
      },
      ...state.applications,
    ];
    state.nextId += 1;
    writeBrowserState(state);
    return;
  }

  state.applications = state.applications.map((application) =>
    application.id === id
      ? {
          ...application,
          ...input,
          lastUpdated: now,
        }
      : application
  );
  writeBrowserState(state);
}

export async function updateApplicationStatus(id: number, status: string) {
  const now = Date.now();

  if (getStorageDriver() === "sqlite") {
    await runSqliteTask((db) =>
      db.execute(
        `UPDATE applications
        SET status = ?, last_updated = ?
        WHERE id = ?`,
        [status, now, id]
      )
    );
    return;
  }

  const state = readBrowserState();
  state.applications = state.applications.map((application) =>
    application.id === id
      ? {
          ...application,
          status,
          lastUpdated: now,
        }
      : application
  );
  writeBrowserState(state);
}

export async function deleteApplication(id: number) {
  if (getStorageDriver() === "sqlite") {
    await runSqliteTask((db) => db.execute("DELETE FROM applications WHERE id = ?", [id]));
    return;
  }

  const state = readBrowserState();
  state.applications = state.applications.filter((application) => application.id !== id);
  writeBrowserState(state);
}

export async function loadLocalSettings(): Promise<LocalSettings> {
  if (getStorageDriver() === "sqlite") {
    const rows = await runSqliteTask((db) =>
      db.select<Array<{ key: string; value: string }>>(
        "SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)",
        [XAI_KEY_SETTING, XAI_MODEL_SETTING, RESUME_PROFILE_SETTING, PAPER_DRAFT_SETTING]
      )
    );
    const entries = new Map(rows.map((row) => [row.key, row.value]));
    const storedResume = entries.get(RESUME_PROFILE_SETTING);
    let resumeProfile = createEmptyResumeProfile();

    if (storedResume) {
      try {
        resumeProfile = normalizeResumeProfile(JSON.parse(storedResume));
      } catch (error) {
        resumeProfile = createEmptyResumeProfile();
      }
    }

    return {
      xAiApiKey: entries.get(XAI_KEY_SETTING) ?? "",
      xAiModel: entries.get(XAI_MODEL_SETTING) ?? "grok-4-fast-non-reasoning",
      resumeProfile,
      paperDraftText: entries.get(PAPER_DRAFT_SETTING) ?? "",
    };
  }

  return readBrowserState().settings;
}

export async function saveLocalSettings(settings: LocalSettings) {
  const normalizedKey = settings.xAiApiKey.trim();
  const normalizedModel = settings.xAiModel.trim() || "grok-4-fast-non-reasoning";
  const normalizedResumeProfile = normalizeResumeProfile(settings.resumeProfile);
  const normalizedPaperDraft = settings.paperDraftText;

  if (getStorageDriver() === "sqlite") {
    await runSqliteTask(async (db) => {
      await db.execute(
        `INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [XAI_MODEL_SETTING, normalizedModel]
      );

      if (normalizedResumeProfile.rawText) {
        await db.execute(
          `INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [RESUME_PROFILE_SETTING, JSON.stringify(normalizedResumeProfile)]
        );
      } else {
        await db.execute("DELETE FROM settings WHERE key = ?", [RESUME_PROFILE_SETTING]);
      }

      if (normalizedPaperDraft.trim()) {
        await db.execute(
          `INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [PAPER_DRAFT_SETTING, normalizedPaperDraft]
        );
      } else {
        await db.execute("DELETE FROM settings WHERE key = ?", [PAPER_DRAFT_SETTING]);
      }

      if (!normalizedKey) {
        await db.execute("DELETE FROM settings WHERE key = ?", [XAI_KEY_SETTING]);
        return;
      }

      await db.execute(
        `INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [XAI_KEY_SETTING, normalizedKey]
      );
    });
    return;
  }

  const state = readBrowserState();
  state.settings.xAiApiKey = normalizedKey;
  state.settings.xAiModel = normalizedModel;
  state.settings.resumeProfile = normalizedResumeProfile;
  state.settings.paperDraftText = normalizedPaperDraft;
  writeBrowserState(state);
}

async function createBackupSnapshot(): Promise<JobRaptorBackup> {
  return {
    kind: BACKUP_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    storage: getStorageDriver(),
    applications: await listApplications(),
    settings: await loadLocalSettings(),
  };
}

async function replaceAllLocalData(backup: JobRaptorBackup) {
  if (getStorageDriver() === "sqlite") {
    await runSqliteTask(async (db) => {
      await db.execute("BEGIN TRANSACTION");

      try {
        await db.execute("DELETE FROM applications");
        await db.execute("DELETE FROM settings");
        await db.execute("DELETE FROM sqlite_sequence WHERE name = 'applications'");

        for (const application of backup.applications) {
          await db.execute(
            `INSERT INTO applications (
              id,
              url,
              company,
              title,
              location,
              salary,
              applied_date,
              status,
              source,
              notes,
              tags,
              confidence,
              parse_confidence,
              fit_summary,
              job_description,
              created_at,
              last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              application.id,
              application.url,
              application.company,
              application.title,
              application.location,
              application.salary,
              application.appliedDate,
              application.status,
              application.source,
              application.notes,
              JSON.stringify(application.tags),
              application.confidence,
              application.parseConfidence,
              application.fitSummary,
              application.jobDescription,
              application.createdAt,
              application.lastUpdated,
            ]
          );
        }

        await db.execute(
          `INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [XAI_MODEL_SETTING, backup.settings.xAiModel.trim() || "grok-4-fast-non-reasoning"]
        );

        if (backup.settings.xAiApiKey.trim()) {
          await db.execute(
            `INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [XAI_KEY_SETTING, backup.settings.xAiApiKey.trim()]
          );
        }

        if (backup.settings.resumeProfile.rawText.trim()) {
          await db.execute(
            `INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [RESUME_PROFILE_SETTING, JSON.stringify(normalizeResumeProfile(backup.settings.resumeProfile))]
          );
        }

        if (backup.settings.paperDraftText.trim()) {
          await db.execute(
            `INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [PAPER_DRAFT_SETTING, backup.settings.paperDraftText]
          );
        }

        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }
    });

    return;
  }

  writeBrowserState({
    nextId: backup.applications.reduce((max, application) => Math.max(max, application.id), 0) + 1,
    applications: sortApplicationsByRecent(backup.applications),
    settings: normalizeSettings(backup.settings),
  });
}

function createBackupFilename() {
  return `job-raptor-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

async function readBackupFromBrowserPicker() {
  return await new Promise<PickedBackupFile | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        resolve({
          text: await file.text(),
          name: file.name,
        });
      },
      { once: true }
    );

    input.addEventListener(
      "cancel",
      () => {
        resolve(null);
      },
      { once: true }
    );

    input.click();
  });
}

export async function exportBackupToFile() {
  const snapshot = await createBackupSnapshot();
  const text = JSON.stringify(snapshot, null, 2);
  const filename = createBackupFilename();

  if (getStorageDriver() === "sqlite") {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string | null>("export_backup_file", {
      contents: text,
      suggestedFilename: filename,
    });

    if (!path) {
      return { cancelled: true as const };
    }

    return { cancelled: false as const, path };
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);

  return { cancelled: false as const, path: filename };
}

export async function importBackupFromFile() {
  let selectedFile: PickedBackupFile | null = null;

  if (getStorageDriver() === "sqlite") {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<{ contents: string; path: string } | null>(
        "import_backup_file"
      );

      if (selected === null) {
        return { cancelled: true as const };
      }

      selectedFile = {
        text: selected.contents,
        name: selected.path,
      };
    } catch (error) {
      const fallback = await readBackupFromBrowserPicker();

      if (fallback === null) {
        throw error;
      }

      selectedFile = fallback;
    }
  } else {
    selectedFile = await readBackupFromBrowserPicker();
  }

  if (selectedFile === null) {
    return { cancelled: true as const };
  }

  const backup = parseBackupText(selectedFile.text);

  await replaceAllLocalData(backup);

  return {
    cancelled: false as const,
    applications: backup.applications.length,
    source: selectedFile.name,
  };
}
