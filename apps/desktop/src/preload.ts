import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const SET_THEME_CHANNEL = "desktop:set-theme";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_SET_CHANNEL_CHANNEL = "desktop:update-set-channel";
const UPDATE_CHECK_CHANNEL = "desktop:update-check";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const GET_APP_BRANDING_CHANNEL = "desktop:get-app-branding";
const GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL = "desktop:get-local-environment-bootstrap";
const GET_CLIENT_SETTINGS_CHANNEL = "desktop:get-client-settings";
const SET_CLIENT_SETTINGS_CHANNEL = "desktop:set-client-settings";
const GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL = "desktop:get-saved-environment-registry";
const SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL = "desktop:set-saved-environment-registry";
const GET_SAVED_ENVIRONMENT_SECRET_CHANNEL = "desktop:get-saved-environment-secret";
const SET_SAVED_ENVIRONMENT_SECRET_CHANNEL = "desktop:set-saved-environment-secret";
const REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL = "desktop:remove-saved-environment-secret";
const GET_SERVER_EXPOSURE_STATE_CHANNEL = "desktop:get-server-exposure-state";
const SET_SERVER_EXPOSURE_MODE_CHANNEL = "desktop:set-server-exposure-mode";
const BROWSER_PANEL_CREATE_CHANNEL = "desktop:browser-panel:create";
const BROWSER_PANEL_ATTACH_CHANNEL = "desktop:browser-panel:attach";
const BROWSER_PANEL_DETACH_CHANNEL = "desktop:browser-panel:detach";
const BROWSER_PANEL_DESTROY_CHANNEL = "desktop:browser-panel:destroy";
const BROWSER_PANEL_NAVIGATE_CHANNEL = "desktop:browser-panel:navigate";
const BROWSER_PANEL_RELOAD_CHANNEL = "desktop:browser-panel:reload";
const BROWSER_PANEL_GO_BACK_CHANNEL = "desktop:browser-panel:go-back";
const BROWSER_PANEL_GO_FORWARD_CHANNEL = "desktop:browser-panel:go-forward";
const BROWSER_PANEL_OPEN_DEVTOOLS_CHANNEL = "desktop:browser-panel:open-devtools";
const BROWSER_PANEL_CLOSE_DEVTOOLS_CHANNEL = "desktop:browser-panel:close-devtools";
const BROWSER_PANEL_GET_STATE_CHANNEL = "desktop:browser-panel:get-state";
const BROWSER_PANEL_STATE_CHANNEL = "desktop:browser-panel:state";

contextBridge.exposeInMainWorld("desktopBridge", {
  getAppBranding: () => {
    const result = ipcRenderer.sendSync(GET_APP_BRANDING_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getAppBranding"]>;
  },
  getLocalEnvironmentBootstrap: () => {
    const result = ipcRenderer.sendSync(GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getLocalEnvironmentBootstrap"]>;
  },
  getClientSettings: () => ipcRenderer.invoke(GET_CLIENT_SETTINGS_CHANNEL),
  setClientSettings: (settings) => ipcRenderer.invoke(SET_CLIENT_SETTINGS_CHANNEL, settings),
  getSavedEnvironmentRegistry: () => ipcRenderer.invoke(GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL),
  setSavedEnvironmentRegistry: (records) =>
    ipcRenderer.invoke(SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, records),
  getSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(GET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  setSavedEnvironmentSecret: (environmentId, secret) =>
    ipcRenderer.invoke(SET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId, secret),
  removeSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  getServerExposureState: () => ipcRenderer.invoke(GET_SERVER_EXPOSURE_STATE_CHANNEL),
  setServerExposureMode: (mode) => ipcRenderer.invoke(SET_SERVER_EXPOSURE_MODE_CHANNEL, mode),
  pickFolder: (options) => ipcRenderer.invoke(PICK_FOLDER_CHANNEL, options),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  setUpdateChannel: (channel) => ipcRenderer.invoke(UPDATE_SET_CHANNEL_CHANNEL, channel),
  checkForUpdate: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
  browserPanel: {
    create: (input) => ipcRenderer.invoke(BROWSER_PANEL_CREATE_CHANNEL, input),
    attach: (input) => ipcRenderer.invoke(BROWSER_PANEL_ATTACH_CHANNEL, input),
    detach: (input) => ipcRenderer.invoke(BROWSER_PANEL_DETACH_CHANNEL, input),
    destroy: (input) => ipcRenderer.invoke(BROWSER_PANEL_DESTROY_CHANNEL, input),
    navigate: (input) => ipcRenderer.invoke(BROWSER_PANEL_NAVIGATE_CHANNEL, input),
    reload: (input) => ipcRenderer.invoke(BROWSER_PANEL_RELOAD_CHANNEL, input),
    goBack: (input) => ipcRenderer.invoke(BROWSER_PANEL_GO_BACK_CHANNEL, input),
    goForward: (input) => ipcRenderer.invoke(BROWSER_PANEL_GO_FORWARD_CHANNEL, input),
    openDevTools: (input) => ipcRenderer.invoke(BROWSER_PANEL_OPEN_DEVTOOLS_CHANNEL, input),
    closeDevTools: (input) => ipcRenderer.invoke(BROWSER_PANEL_CLOSE_DEVTOOLS_CHANNEL, input),
    getState: (input) => ipcRenderer.invoke(BROWSER_PANEL_GET_STATE_CHANNEL, input),
    onState: (input, listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        panelId: unknown,
        state: unknown,
      ) => {
        if (typeof panelId !== "string" || panelId !== input.panelId) return;
        if (typeof state !== "object" || state === null) return;
        listener(state as Parameters<typeof listener>[0]);
      };

      ipcRenderer.on(BROWSER_PANEL_STATE_CHANNEL, wrappedListener);
      return () => {
        ipcRenderer.removeListener(BROWSER_PANEL_STATE_CHANNEL, wrappedListener);
      };
    },
  },
} satisfies DesktopBridge);
