import { contextBridge, ipcRenderer } from "electron";
import type { API } from "../shared.js";
const api: API = {
  taskAction: (input) => ipcRenderer.invoke("app:taskAction", input),
  snapshot: () => ipcRenderer.invoke("app:snapshot"),
  projectData: (id) => ipcRenderer.invoke("app:projectData", id),
  createProject: (input) => ipcRenderer.invoke("app:createProject", input),
  createTask: (input) => ipcRenderer.invoke("app:createTask", input),
  createMemory: (input) => ipcRenderer.invoke("app:createMemory", input),
  deleteMemory: (input) => ipcRenderer.invoke("app:deleteMemory", input),
  setPreferences: (input) => ipcRenderer.invoke("app:setPreferences", input),
  setMaster: (input) => ipcRenderer.invoke("app:setMaster", input),
};
contextBridge.exposeInMainWorld("agenting", api);
