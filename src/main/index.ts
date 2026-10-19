import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session,
  dialog,
  shell,
  safeStorage,
} from "electron";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Store } from "./store.js";
import { trustedSender } from "./security.js";
import { probeProviders, withProviderProbes } from "./adapters.js";
import { scanConnectors, withExecutionSettings } from "./connectors.js";
import { Supervisor } from "./supervisor.js";
import { CodexAdapter } from "./providers.js";
import { exact, text } from "./validate.js";
import { Applications } from "./applications.js";
import { McpTools } from "./extensions.js";
import { ProjectBrowser } from "./browser.js";
import { OpenRouterConnection } from "./openrouter.js";
import { detectExecutables } from "./provider-discovery.js";
import { Orchestrator } from "./orchestrator.js";
import {
  scanAllQuotas,
  saveCustomSubscription,
  deleteCustomSubscription,
  codexQuota,
  openRouterQuota,
  unavailable,
} from "./quota.js";
const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, "../renderer/index.html");
const expectedUrl = pathToFileURL(page).href;
// Override is for isolated local QA profiles; never supplied by renderer.
if (process.env.AGENTING_DATA_DIR)
  app.setPath("userData", process.env.AGENTING_DATA_DIR);
app.setName("Agenting OS");
let store: Store;
let supervisor: Supervisor;
let orchestrator: Orchestrator | undefined;
let login: CodexAdapter | undefined;
let mcp: McpTools | undefined;
let browser: ProjectBrowser | undefined;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let window: BrowserWindow | null = null;
function openWindow() {
  window = new BrowserWindow({
    width: 1400,
    height: 940,
    minWidth: 380,
    minHeight: 600,
    title: "Agenting OS",
    backgroundColor: "#0c1020",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.on("closed", () => {
    browser?.close();
    window = null;
  });
  void window.loadFile(page);
}
app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return;
    Menu.setApplicationMenu(null);
    mkdirSync(app.getPath("userData"), { recursive: true });
    store = new Store(join(app.getPath("userData"), "agenting.sqlite"));
    const router = new OpenRouterConnection(app.getPath("userData"), {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== "linux" ||
          safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    });
    supervisor = new Supervisor(
      store,
      app.getPath("userData"),
      undefined,
      (agent) => (agent === "opencode" ? router.environment() : {}),
    );
    orchestrator = new Orchestrator(store, supervisor);
    const quotas = () =>
      scanAllQuotas(app.getPath("userData"), {
        codex: async () => {
          const config = store.runs.provider("codex");
          if (!config?.consent)
            return unavailable("codex", "Codex", "CONFIGURE_CODEX");
          const home = join(app.getPath("userData"), "providers", "codex");
          mkdirSync(home, { recursive: true });
          const client = new CodexAdapter({
            command: config.command,
            args: ["app-server", "--listen", "stdio://"],
            cwd: app.getPath("userData"),
            env: config.profile === "existing" ? {} : { CODEX_HOME: home },
          });
          try {
            await client.initialize();
            const [limits, account, usage] = await Promise.all([
              client.rpc.request("account/rateLimits/read", {}, 10000),
              client.account(),
              client.rpc
                .request("account/usage/read", {}, 10000)
                .catch(() => null),
            ]);
            return codexQuota(limits, account, usage);
          } finally {
            client.close();
            await client.stopped();
          }
        },
        openrouter: async () =>
          router.settings().configured
            ? openRouterQuota(await router.quota())
            : unavailable("openrouter", "OpenRouter", "CONFIGURE_OPENROUTER"),
      });
    mcp = new McpTools(store.extensions, app.getPath("userData"));
    browser = new ProjectBrowser(store, () => window);
    const applications = new Applications(store, supervisor.worktrees);
    await applications.reconcile();
    session.defaultSession.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel: !details.url.startsWith(
          pathToFileURL(join(here, "../renderer/")).href,
        ),
      }),
    );
    const handlers: Record<string, (input: unknown) => unknown> = {
      orchestrationStart: (input) => orchestrator!.start(input),
      orchestrationState: (input) => orchestrator!.state(input),
      orchestrationStop: (input) => orchestrator!.stop(input),
      providerDetect: () => detectExecutables(),
      openRouterSettings: () => router.settings(),
      openRouterSave: (input) => router.save(input),
      openRouterRemove: () => router.remove(),
      openRouterModels: () => router.models(),
      browserAction: (input) => browser!.action(input),
      extensionList: (input) => {
        const p = exact(input, ["projectId"]);
        return store.extensions.list(text(p.projectId));
      },
      extensionImport: (input) => store.extensions.import(input),
      extensionRemove: async (input) => {
        const p = exact(input, ["projectId", "id"]),
          projectId = text(p.projectId),
          id = text(p.id);
        store.extensions.get(projectId, id);
        await mcp!.disconnect(projectId, id);
        store.extensions.remove(projectId, id);
      },
      mcpConnect: (input) => mcp!.connect(input),
      mcpCall: (input) => mcp!.call(input),
      mcpDisconnect: (input) => {
        const p = exact(input, ["projectId", "id"]),
          projectId = text(p.projectId),
          id = text(p.id);
        store.extensions.get(projectId, id);
        return mcp!.disconnect(projectId, id);
      },
      runDecision: (input) => applications.decide(input),
      memorySearch: (input) => {
        const p = exact(input, ["projectId", "query"]);
        return store.knowledge.search(
          text(p.projectId),
          text(p.query, 1000, true),
        );
      },
      contextPreview: (input) => {
        const p = exact(input, [
          "projectId",
          "contextIds",
          "workflow",
          "skillIds",
        ]);
        return store.knowledge.build(
          text(p.projectId),
          p.contextIds,
          p.workflow,
          store.extensions.skills(text(p.projectId), p.skillIds ?? []),
        );
      },
      runtimeView: (input) => supervisor.view(input),
      runtimeStart: (input) => supervisor.start(input),
      runtimeAction: (input) => supervisor.action(input),
      runtimeReview: (input) => supervisor.review(input),
      configureProvider: (input) => supervisor.configure(input),
      providerSettings: () => supervisor.settings(),
      chooseExecutable: async () => {
        const result = await dialog.showOpenDialog(window!, {
          title: "Choose a trusted agent executable",
          properties: ["openFile"],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      chooseRepository: async () => {
        const result = await dialog.showOpenDialog(window!, {
          title: "Choose project Git repository",
          properties: ["openDirectory"],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      providerLogin: async () => {
        const config = store.runs.provider("codex");
        if (!config?.consent) throw Error("PROVIDER_NOT_CONFIGURED");
        login?.close();
        const home = join(app.getPath("userData"), "providers", "codex");
        mkdirSync(home, { recursive: true });
        const client = (login = new CodexAdapter({
          command: config.command,
          args: [...config.args, "app-server", "--listen", "stdio://"],
          cwd: app.getPath("userData"),
          env: config.profile === "existing" ? {} : { CODEX_HOME: home },
        }));
        try {
          await client.initialize();
          const result = await client.login();
          const url = new URL(text(result.authUrl, 12000));
          if (
            url.protocol !== "https:" ||
            !["auth.openai.com", "chatgpt.com"].includes(url.hostname) ||
            url.username ||
            url.password
          )
            throw Error("INVALID_LOGIN_URL");
          client.rpc.on("notification", (message) => {
            if (message.method === "account/login/completed") client.close();
          });
          const timer = setTimeout(() => client.close(), 5 * 60 * 1000);
          timer.unref();
          await shell.openExternal(url.href);
        } catch {
          client.close();
          throw Error("SIGN_IN_FAILED");
        }
      },
      runArtifact: (input) => {
        const p = exact(input, ["projectId", "runId"]),
          projectId = text(p.projectId),
          run = store.runs.get(projectId, text(p.runId));
        if (!run) throw Error("RUN_NOT_FOUND");
        const artifact = run.artifactId
          ? store.artifacts.get(projectId, run.taskId, run.artifactId)
          : null;
        return artifact
          ? {
              id: artifact.id,
              diffHash: artifact.diffHash,
              diff: artifact.diff.toString("utf8"),
              approvals: store.approvals.list(projectId, run.taskId),
            }
          : null;
      },
      snapshot: async () => ({
        projects: store.projects(),
        preferences: store.preferences(),
        integrations: withProviderProbes(
          store.integrations(),
          await probeProviders(),
        ),
      }),
      connectorScan: async () => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return {
          observedAt: new Date().toISOString(),
          connectors: withExecutionSettings(
            await scanConnectors(),
            supervisor.settings(),
            router.settings().configured,
          ),
          usage: store.runs.usage(startOfDay.getTime()),
        };
      },
      projectData: (id) => store.projectData(id),
      taskAction: (input) => store.taskAction(input),
      createProject: (input) => store.createProject(input),
      createTask: (input) => store.createTask(input),
      createMemory: (input) => store.createMemory(input),
      deleteMemory: (input) => store.deleteMemory(input),
      setPreferences: (input) => store.setPreferences(input),
      setMaster: (input) => store.setMaster(input),
      quotaScan: quotas,
      quotaSaveCustom: (input) =>
        saveCustomSubscription(app.getPath("userData"), input),
      quotaDeleteCustom: (input) => {
        deleteCustomSubscription(app.getPath("userData"), input);
      },
      quotaRefresh: quotas,
    };
    for (const [name, handler] of Object.entries(handlers))
      ipcMain.handle(`app:${name}`, async (event, input: unknown) => {
        if (
          !window ||
          event.sender !== window.webContents ||
          !trustedSender(
            event.senderFrame?.url,
            event.senderFrame === window.webContents.mainFrame,
            expectedUrl,
          )
        )
          throw Error("FORBIDDEN");
        try {
          return await handler(input);
        } catch {
          throw Error("REQUEST_REJECTED");
        }
      });
    openWindow();
    app.on("activate", () => {
      if (!window) openWindow();
    });
  })
  .catch(() => {
    console.error(
      "Agenting OS startup failed; check the local data directory and runtime.",
    );
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
let shuttingDown = false;
app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  orchestrator?.close();
  void Promise.all([supervisor?.close(), mcp?.close()]).finally(() => {
    browser?.close();
    login?.close();
    store?.close();
    app.quit();
  });
});
