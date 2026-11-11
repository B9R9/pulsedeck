import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron';
import { readTasks, runTask, startScheduler } from './background';
import { taskHash } from './units';
import { removeSubagent, syncSubagents } from './subagents';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerAsk, setDefaultModel, startRun, stopRun } from './claude-runner';
import { setApprovalProvider, emptyProject, loadProject, patchFile, saveInstruction } from './project-store';
import { resolveModel } from './models';
import { mergeLocalModels, ollamaModels, sanitizeLocalModels, usableLocalModels } from './ollama';
import { createTicket, deleteLocalTicket, loadTickets, resolveTicketsFile, resetTicket, saveTicket, setTicketLinks, watchTickets } from './tickets';
import { suggestText } from './suggest';
import { refreshStats } from './stats';
import { routePrompt } from './router';
import { recordVersion, restoreVersion } from './versions';
import { deleteScript, saveScript } from './scripts';
import { applySplit, decideSession, proposeDocUpdate, splitFeat, deleteEntity, importDriveDoc, resolveInboxItem, saveEntity, workflowOp } from './entities';

nativeTheme.themeSource = 'dark';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
let mainWindow: BrowserWindow | undefined;

const configFile = () => path.join(app.getPath('userData'), 'workspace.json');

interface Config { root?: string; ticketsFile?: string; model?: string; modelProjets?: string; modelDocs?: string; projects?: string[]; localModels?: unknown }
/** Valeurs libres : '', un alias court (sonnet...) et tout modèle local d'Ollama (contient un deux-points). */
const validModel = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^[a-z]{3,6}$/.test(v) || v.includes(':')) && v.length <= 100;
const MAX_PROJECTS = 8;

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8')) as Config;
  } catch {
    return {};
  }
}
function writeConfig(patch: Config) {
  fs.writeFileSync(configFile(), JSON.stringify({ ...readConfig(), ...patch }));
}

/** Ajoute un dossier à la liste des projets connus, en première position. */
function registerProject(root: string) {
  const past = (readConfig().projects ?? []).filter((p) => p !== root);
  writeConfig({ projects: [root, ...past].slice(0, MAX_PROJECTS) });
}

async function settings() {
  const cfg = readConfig();
  const root = readRoot() ?? '';
  const found = resolveTicketsFile(root, cfg.ticketsFile);
  return {
    root,
    projects: [root, ...(cfg.projects ?? [])].filter((p, i, a) => p !== '' && a.indexOf(p) === i),
    ticketsChosen: cfg.ticketsFile ?? '',
    ticketsFile: found?.file ?? '',
    ticketsOrigin: found?.origin ?? 'aucun',
    model: cfg.model ?? '',
    modelProjets: cfg.modelProjets ?? '',
    modelDocs: cfg.modelDocs ?? '',
    localModels: mergeLocalModels(sanitizeLocalModels(cfg.localModels), await ollamaModels()),
    dataDir: app.getPath('userData'),
    version: app.getVersion()
  };
}

let stopWatch: (() => void) | undefined;
function readTickets() {
  const root = readRoot() ?? '';
  const data = loadTickets(root, readConfig().ticketsFile);
  stopWatch?.();
  stopWatch = data.file
    ? watchTickets(data.file, () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tickets:changed', loadTickets(root, readConfig().ticketsFile));
      })
    : undefined;
  return data;
}

/** Recharge les tickets (fichier du projet en cours) et pousse le résultat à l'interface. */
function pushTickets() {
  const data = readTickets();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tickets:changed', data);
  return data;
}

function readRoot(): string | null {
  try {
    const saved = JSON.parse(fs.readFileSync(configFile(), 'utf8')) as { root?: string };
    if (saved.root) return saved.root;
  } catch {
    /* pas encore de dossier choisi */
  }
  return process.env.DEV ? path.resolve(process.cwd(), 'workspace-sample') : null;
}

function registerIpc() {
  ipcMain.handle('project:load', () => {
    const root = readRoot();
    if (root) refreshStats(root);
    return root ? loadProject(root) : emptyProject('');
  });

  ipcMain.handle('project:choose', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir le dossier du projet',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const root = result.filePaths[0];
    writeConfig({ root });
    registerProject(root);
    pushTickets();
    return loadProject(root);
  });

  /** Change le projet de travail vers un dossier déjà connu, sans boîte de dialogue. */
  ipcMain.handle('project:set', (_e, next: string) => {
    const root = String(next ?? '');
    if (!root || !fs.existsSync(root)) throw new Error('Dossier de projet introuvable : ' + root);
    writeConfig({ root });
    registerProject(root);
    pushTickets();
    return loadProject(root);
  });

  ipcMain.handle('settings:load', () => settings());

  /** Modèles locaux utilisables (actifs) avec leur nom affiché : sert aux listes de modèles hors Options. */
  ipcMain.handle('models:ollama', async () => usableLocalModels(sanitizeLocalModels(readConfig().localModels)));
  ipcMain.handle('settings:set', async (_e, patch: { model?: string; modelProjets?: string; modelDocs?: string; ticketsFile?: string; localModels?: unknown }) => {
    const enabled = (await usableLocalModels(sanitizeLocalModels(readConfig().localModels))).map((m) => m.id);
    const modelOk = (v: unknown): v is string =>
      typeof v === 'string' && (v === '' || /^[a-z]{3,6}$/.test(v) || enabled.includes(v)) && v.length <= 200;
    const model = modelOk(patch?.model) ? patch.model : undefined;
    if (model !== undefined) { writeConfig({ model }); setDefaultModel(resolveModel(model) ?? model); }
    const modelProjets = modelOk(patch?.modelProjets) ? patch.modelProjets : undefined;
    if (modelProjets !== undefined) writeConfig({ modelProjets });
    const modelDocs = modelOk(patch?.modelDocs) ? patch.modelDocs : undefined;
    if (modelDocs !== undefined) writeConfig({ modelDocs });
    const localModels = sanitizeLocalModels(patch?.localModels);
    if (patch?.localModels !== undefined) writeConfig({ localModels });
    if (typeof patch?.ticketsFile === 'string' && patch.ticketsFile === '') {
      writeConfig({ ticketsFile: '' });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tickets:changed', readTickets());
    }
    return settings();
  });

  ipcMain.handle('tickets:load', () => readTickets());

  ipcMain.handle('tickets:choose', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir le fichier jira-tickets.json',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    writeConfig({ ticketsFile: result.filePaths[0] });
    return readTickets();
  });

  ipcMain.handle('tickets:link', (_e, key: string, links: { parent: string; docs: string[] }) =>
    withRoot((root) => setTicketLinks(root, String(key), links, readConfig().ticketsFile)));
  ipcMain.handle('tickets:save', (_e, key: string, edits: never) =>
    withRoot((root) => saveTicket(root, String(key), edits ?? {}, readConfig().ticketsFile)));
  ipcMain.handle('tickets:reset', (_e, key: string) => withRoot((root) => resetTicket(root, String(key), readConfig().ticketsFile)));
  ipcMain.handle('tickets:create', (_e, fields: never) => withRoot((root) => createTicket(root, fields ?? {}, readConfig().ticketsFile)));
  ipcMain.handle('tickets:delete', (_e, key: string) => withRoot((root) => deleteLocalTicket(root, String(key), readConfig().ticketsFile)));
  ipcMain.handle('doc:aiUpdate', (_e, docPath: string, instruction: string) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    return proposeDocUpdate(root, String(docPath), String(instruction ?? ''), readConfig().ticketsFile, resolveModel(readConfig().modelDocs));
  });
  ipcMain.handle('scripts:save', (_e, name: string, content: string, create: boolean) =>
    withRoot((root) => { saveScript(root, String(name), String(content), create === true); return loadProject(root); }));
  ipcMain.handle('scripts:delete', (_e, name: string) => withRoot((root) => { deleteScript(root, String(name)); return loadProject(root); }));
  ipcMain.handle('background:approve', (_e, id: string) => withRoot((root) => {
    const t = readTasks(root).find((x) => x.id === String(id));
    if (!t) throw new Error('Tâche introuvable');
    setApproval(root, t.id, taskHash(t));
    return loadProject(root);
  }));
  ipcMain.handle('background:run', async (_e, id: string) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    const t = readTasks(root).find((x) => x.id === String(id));
    if (!t) throw new Error('Tâche introuvable');
    if (!isApproved(root, t.id, taskHash(t))) throw new Error("Cette tâche n'est pas approuvée");
    await runTask(root, t, bgCapTokens(root), (wid) => workflowNameOf(root, wid));
    return loadProject(root);
  });
  ipcMain.handle('subagents:sync', (_e, names: string[]) => withRoot((root) => {
    syncSubagents(root, loadProject(root).workflows, (Array.isArray(names) ? names : []).map(String));
    return loadProject(root);
  }));
  ipcMain.handle('subagents:remove', (_e, name: string) => withRoot((root) => { removeSubagent(root, String(name)); return loadProject(root); }));
  ipcMain.handle('stats:rebuild', () => withRoot((root) => { refreshStats(root, true); return loadProject(root); }));
  ipcMain.handle('ai:suggest', (_e, req: never) => {
    const kind = String((req as { kind?: unknown })?.kind ?? '');
    const model = kind === 'doc' || kind === 'memory' ? resolveModel(readConfig().modelDocs) : resolveModel(readConfig().modelProjets);
    return withRoot((root) => suggestText(root, req, model));
  });
  ipcMain.handle('feat:split', (_e, featId: string) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    return splitFeat(root, String(featId), resolveModel(readConfig().modelProjets));
  });
  ipcMain.handle('feat:applySplit', (_e, featId: string, proposal: never) =>
    withRoot((root) => applySplit(root, String(featId), proposal)));

  ipcMain.handle('instruction:save', (_event, relPath: string, text: string) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    return saveInstruction(root, String(relPath), String(text));
  });

  ipcMain.handle('file:patch', (_event, relPath: string, patch: Record<string, unknown>) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    return patchFile(root, String(relPath), patch);
  });

  ipcMain.handle('workflow:restore', (_e, workflow: string, version: string) =>
    withRoot((root) => { restoreVersion(root, String(workflow), String(version)); return loadProject(root); }));
  ipcMain.handle('workflow:snapshot', (_e, workflow: string) =>
    withRoot((root) => { recordVersion(root, String(workflow)); return loadProject(root); }));
  ipcMain.handle('route:prompt', (_e, prompt: string) => withRoot((root) => routePrompt(root, String(prompt))));

  ipcMain.handle('run:start', (event, prompt: string, followUp?: string, workflow?: string, route?: { confidence?: unknown; text?: unknown }) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    const text = String(prompt).trim();
    if (!text) throw new Error('Prompt vide');
    return startRun(text, root, root, (ev) => {
      if (!event.sender.isDestroyed()) event.sender.send('run:event', ev);
    }, {
      followUp: followUp ? String(followUp) : undefined, workflow: workflow ? String(workflow) : undefined,
      route: route && typeof route.text === 'string' ? { confidence: Math.max(0, Math.min(100, Number(route.confidence) || 0)), text: route.text.slice(0, 120) } : undefined
    });
  });

  ipcMain.handle('run:answer', (_e, runId: string, askId: string, allow: boolean) => {
    answerAsk(String(runId), String(askId), allow === true);
  });

  ipcMain.handle('run:stop', (_event, runId: string) => {
    stopRun(String(runId));
  });

  const withRoot = <T>(fn: (root: string) => T) => {
    const root = readRoot();
    if (!root) throw new Error('Aucun dossier de projet');
    return fn(root);
  };

  ipcMain.handle('inbox:resolve', (_e, relPath: string, result?: string) =>
    withRoot((root) => resolveInboxItem(root, String(relPath), (result ?? '') as '' | 'approved' | 'rejected')));
  ipcMain.handle('inbox:import', (_e, url: string) => withRoot((root) => importDriveDoc(root, String(url))));
  ipcMain.handle('entity:save', (_e, kind: string, relPath: string | null, fields: Record<string, unknown>, body?: string) =>
    withRoot((root) => saveEntity(root, kind as never, relPath === null ? null : String(relPath), fields ?? {}, body)));
  ipcMain.handle('entity:delete', (_e, kind: string, relPath: string) =>
    withRoot((root) => deleteEntity(root, kind as never, String(relPath))));
  ipcMain.handle('workflow:op', (_e, wfId: string, op: never) =>
    withRoot((root) => workflowOp(root, String(wfId), op)));
  ipcMain.handle('session:decide', (_e, relPath: string, result: string, picks?: Record<string, boolean>) =>
    withRoot((root) => decideSession(root, String(relPath), result as '' | 'approved' | 'rejected', picks)));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    backgroundColor: '#101012',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.resolve(
        currentDir,
        path.join(process.env.QUASAR_ELECTRON_PRELOAD_FOLDER, 'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION)
      )
    }
  });

  if (process.env.DEV) await mainWindow.loadURL(process.env.APP_URL);
  else await mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

const approvalsFile = () => path.join(app.getPath('userData'), 'approvals.json');
function readApprovals(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(approvalsFile(), 'utf8')) as Record<string, string>; } catch { return {}; }
}
const approvalKey = (root: string, id: string) => `${root}::${id}`;
function isApproved(root: string, id: string, hash: string) { return readApprovals()[approvalKey(root, id)] === hash; }
function setApproval(root: string, id: string, hash: string) {
  fs.writeFileSync(approvalsFile(), JSON.stringify({ ...readApprovals(), [approvalKey(root, id)]: hash }));
}
const bgCapTokens = (root: string) => (loadProject(root).archSettings?.bgCap ?? 50) * 1000;
const workflowNameOf = (root: string, id: string) => loadProject(root).workflows.find((w) => w.id === id)?.name ?? '';

void app.whenReady().then(() => {
  setDefaultModel(resolveModel(readConfig().model ?? '') ?? readConfig().model ?? '');
  setApprovalProvider(isApproved);
  startScheduler({
    getRoot: readRoot,
    capTokens: bgCapTokens,
    approved: (root, t) => isApproved(root, t.id, taskHash(t)),
    workflowName: workflowNameOf,
    onChange: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('project:changed'); }
  });
  registerIpc();
  return createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === undefined) void createWindow();
});
