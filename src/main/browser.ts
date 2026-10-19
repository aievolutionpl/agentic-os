import { WebContentsView, type BrowserWindow, session } from "electron";
import { createHash } from "node:crypto";
import type { Store } from "./store.js";
import { exact, text } from "./validate.js";
import { browserUrl, isLocalUrl } from "./browser-policy.js";
type Entry = { view: WebContentsView; local: boolean; error: boolean };
export class ProjectBrowser {
  private entries = new Map<string, Entry>();
  private attached: string | null = null;
  constructor(
    private store: Store,
    private window: () => BrowserWindow | null,
  ) {}
  private project(value: unknown) {
    const id = text(value);
    if (!this.store.projects().some((p) => p.id === id))
      throw Error("PROJECT_NOT_FOUND");
    return id;
  }
  private entry(id: string) {
    let entry = this.entries.get(id);
    if (entry) return entry;
    if (this.entries.size >= 8) throw Error("BROWSER_LIMIT");
    const partition = `persist:project-${createHash("sha256").update(id).digest("hex")}`;
    const isolated = session.fromPartition(partition);
    isolated.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on("will-download", (event) => event.preventDefault());
    const view = new WebContentsView({
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        safeDialogs: true,
        allowRunningInsecureContent: false,
      },
    });
    entry = { view, local: false, error: false };
    const current = entry;
    isolated.webRequest.onBeforeRequest((details, callback) => {
      try {
        browserUrl(details.url, current.local);
        callback({ cancel: false });
      } catch {
        callback({ cancel: true });
      }
    });
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const navigation = (event: Electron.Event, url: string) => {
      try {
        browserUrl(url, current.local);
      } catch {
        event.preventDefault();
      }
    };
    view.webContents.on("will-navigate", navigation);
    view.webContents.on("will-redirect", navigation);
    view.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    view.webContents.on(
      "did-fail-load",
      (_event, code, _description, _url, main) => {
        if (main && code !== -3) current.error = true;
      },
    );
    view.webContents.on("did-start-loading", () => {
      current.error = false;
    });
    view.webContents.on("did-navigate", (_event, url) => {
      if (!isLocalUrl(url)) current.local = false;
    });
    this.entries.set(id, entry);
    return entry;
  }
  hide(id?: string) {
    if (!this.attached || (id && id !== this.attached)) return;
    const view = this.entries.get(this.attached)?.view;
    const win = this.window();
    if (view && win && !win.isDestroyed())
      win.contentView.removeChildView(view);
    this.attached = null;
  }
  async action(input: unknown) {
    const p = exact(input, ["projectId", "action", "url", "bounds"]),
      id = this.project(p.projectId),
      action = text(p.action, 30);
    if (action === "hide") {
      this.hide(id);
      return null;
    }
    if (
      !["navigate", "back", "forward", "reload", "state", "bounds"].includes(
        action,
      )
    )
      throw Error("INVALID_BROWSER_ACTION");
    const e = this.entry(id),
      wc = e.view.webContents;
    if (action === "navigate") {
      const url = browserUrl(p.url);
      e.local = isLocalUrl(url);
      e.error = false;
      void wc.loadURL(url).catch(() => {
        e.error = true;
      });
    }
    if (action === "reload") wc.reload();
    if (action === "back" && wc.navigationHistory.canGoBack())
      wc.navigationHistory.goBack();
    if (action === "forward" && wc.navigationHistory.canGoForward())
      wc.navigationHistory.goForward();
    if (action === "bounds") {
      const b = exact(p.bounds, ["x", "y", "width", "height"]),
        win = this.window();
      if (!win) throw Error("NO_WINDOW");
      const [width, height] = win.getContentSize();
      if (
        [b.x, b.y, b.width, b.height].some(
          (v) => typeof v !== "number" || !Number.isInteger(v),
        ) ||
        Number(b.x) < 0 ||
        Number(b.y) < 110 ||
        Number(b.width) < 50 ||
        Number(b.height) < 50 ||
        Number(b.x) + Number(b.width) > width ||
        Number(b.y) + Number(b.height) > height
      )
        throw Error("INVALID_BOUNDS");
      this.hide();
      win.contentView.addChildView(e.view);
      e.view.setBounds({
        x: Number(b.x),
        y: Number(b.y),
        width: Number(b.width),
        height: Number(b.height),
      });
      this.attached = id;
    }
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      error: e.error,
      back: wc.navigationHistory.canGoBack(),
      forward: wc.navigationHistory.canGoForward(),
    };
  }
  close() {
    this.hide();
    for (const e of this.entries.values())
      if (!e.view.webContents.isDestroyed()) e.view.webContents.close();
    this.entries.clear();
  }
}
