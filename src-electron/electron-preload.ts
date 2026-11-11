import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  loadTickets: () => ipcRenderer.invoke('tickets:load'),
  chooseTicketsFile: () => ipcRenderer.invoke('tickets:choose'),
  onTicketsChanged: (listener: (data: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, data: unknown) => listener(data);
    ipcRenderer.on('tickets:changed', handler);
    return () => ipcRenderer.removeListener('tickets:changed', handler);
  },
  linkTicket: (key: string, links: unknown) => ipcRenderer.invoke('tickets:link', key, links),
  saveTicket: (key: string, edits: unknown) => ipcRenderer.invoke('tickets:save', key, edits),
  resetTicket: (key: string) => ipcRenderer.invoke('tickets:reset', key),
  createTicket: (fields: unknown) => ipcRenderer.invoke('tickets:create', fields),
  deleteTicket: (key: string) => ipcRenderer.invoke('tickets:delete', key),
  proposeDocUpdate: (docPath: string, instruction: string) => ipcRenderer.invoke('doc:aiUpdate', docPath, instruction),
  saveScript: (name: string, content: string, create: boolean) => ipcRenderer.invoke('scripts:save', name, content, create),
  deleteScript: (name: string) => ipcRenderer.invoke('scripts:delete', name),
  restoreWorkflowVersion: (workflow: string, version: string) => ipcRenderer.invoke('workflow:restore', workflow, version),
  snapshotWorkflow: (workflow: string) => ipcRenderer.invoke('workflow:snapshot', workflow),
  rebuildStats: () => ipcRenderer.invoke('stats:rebuild'),
  syncSubagents: (names: string[]) => ipcRenderer.invoke('subagents:sync', names),
  removeSubagent: (name: string) => ipcRenderer.invoke('subagents:remove', name),
  runBackgroundTask: (id: string) => ipcRenderer.invoke('background:run', id),
  approveBackgroundTask: (id: string) => ipcRenderer.invoke('background:approve', id),
  onProjectChanged: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on('project:changed', handler);
    return () => ipcRenderer.removeListener('project:changed', handler);
  },
  suggestText: (req: unknown) => ipcRenderer.invoke('ai:suggest', req),
  splitFeat: (featId: string) => ipcRenderer.invoke('feat:split', featId),
  applySplit: (featId: string, proposal: unknown) => ipcRenderer.invoke('feat:applySplit', featId, proposal),
  loadProject: () => ipcRenderer.invoke('project:load'),
  chooseWorkspace: () => ipcRenderer.invoke('project:choose'),
  resolveInboxItem: (relPath: string, result?: string) => ipcRenderer.invoke('inbox:resolve', relPath, result),
  importDriveDoc: (url: string) => ipcRenderer.invoke('inbox:import', url),
  saveEntity: (kind: string, relPath: string | null, fields: Record<string, unknown>, body?: string) => ipcRenderer.invoke('entity:save', kind, relPath, fields, body),
  deleteEntity: (kind: string, relPath: string) => ipcRenderer.invoke('entity:delete', kind, relPath),
  workflowOp: (wfId: string, op: unknown) => ipcRenderer.invoke('workflow:op', wfId, op),
  decideSession: (relPath: string, result: string, picks?: Record<string, boolean>) => ipcRenderer.invoke('session:decide', relPath, result, picks),
  saveInstruction: (relPath: string, text: string) => ipcRenderer.invoke('instruction:save', relPath, text),
  patchFile: (relPath: string, patch: Record<string, unknown>) => ipcRenderer.invoke('file:patch', relPath, patch),
  routePrompt: (prompt: string) => ipcRenderer.invoke('route:prompt', prompt),
  startRun: (prompt: string, followUp?: string, workflow?: string, route?: unknown) => ipcRenderer.invoke('run:start', prompt, followUp, workflow, route),
  answerAsk: (runId: string, askId: string, allow: boolean) => ipcRenderer.invoke('run:answer', runId, askId, allow),
  stopRun: (runId: string) => ipcRenderer.invoke('run:stop', runId),
  onRunEvent: (listener: (event: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, event: unknown) => listener(event);
    ipcRenderer.on('run:event', handler);
    return () => ipcRenderer.removeListener('run:event', handler);
  }
});
