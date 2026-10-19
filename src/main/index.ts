import { app, BrowserWindow, ipcMain, Menu, session } from "electron";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Store } from "./store.js";
import { trustedSender } from "./security.js";
import { probeProviders, withProviderProbes } from "./adapters.js";
const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, "../renderer/index.html");
const expectedUrl = pathToFileURL(page).href;
// Override is for isolated local QA profiles; never supplied by renderer.
if (process.env.AGENTING_DATA_DIR)
  app.setPath("userData", process.env.AGENTING_DATA_DIR);
app.setName("Agenting OS");
let store: Store;
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
    window = null;
  });
  void window.loadFile(page);
}
app
  .whenReady()
  .then(() => {
    Menu.setApplicationMenu(null);
    mkdirSync(app.getPath("userData"), { recursive: true });
    store = new Store(join(app.getPath("userData"), "agenting.sqlite"));
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
      snapshot: async () => ({
        projects: store.projects(),
        preferences: store.preferences(),
        integrations: withProviderProbes(
          store.integrations(),
          await probeProviders(),
        ),
      }),
      projectData: (id) => store.projectData(id),
      taskAction: (input) => store.taskAction(input),
      createProject: (input) => store.createProject(input),
      createTask: (input) => store.createTask(input),
      createMemory: (input) => store.createMemory(input),
      deleteMemory: (input) => store.deleteMemory(input),
      setPreferences: (input) => store.setPreferences(input),
      setMaster: (input) => store.setMaster(input),
    };
    for (const [name, handler] of Object.entries(handlers))
      ipcMain.handle(`app:${name}`, (event, input: unknown) => {
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
          return handler(input);
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
app.on("will-quit", () => store?.close());
