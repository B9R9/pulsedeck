import { computed, ref } from 'vue';
import type { ProjectData, SplitProposal, WorkflowOp } from '../shared/types';

const data = ref<ProjectData | null>(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    data.value = await window.api.loadProject();
  } finally {
    loading.value = false;
  }
}

async function resolveInbox(path: string, result: '' | 'approved' | 'rejected' = '') {
  data.value = await window.api.resolveInboxItem(path, result);
}

async function importDriveDoc(url: string) {
  data.value = await window.api.importDriveDoc(url);
}
async function saveEntity(kind: string, path: string | null, fields: Record<string, unknown>, body?: string) {
  data.value = await window.api.saveEntity(kind, path, fields, body);
}
async function deleteEntity(kind: string, path: string) {
  data.value = await window.api.deleteEntity(kind, path);
}
async function restoreWorkflowVersion(workflow: string, version: string) {
  data.value = await window.api.restoreWorkflowVersion(workflow, version);
}
async function snapshotWorkflow(workflow: string) {
  data.value = await window.api.snapshotWorkflow(workflow);
}
async function runBackgroundTask(id: string) {
  data.value = await window.api.runBackgroundTask(id);
}
async function approveBackgroundTask(id: string) {
  data.value = await window.api.approveBackgroundTask(id);
}
async function syncSubagents(names: string[]) {
  data.value = await window.api.syncSubagents(names);
}
async function removeSubagent(name: string) {
  data.value = await window.api.removeSubagent(name);
}
async function rebuildStats() {
  data.value = await window.api.rebuildStats();
}
async function saveScript(name: string, content: string, create: boolean) {
  data.value = await window.api.saveScript(name, content, create);
}
async function deleteScript(name: string) {
  data.value = await window.api.deleteScript(name);
}
async function workflowOp(workflow: string, op: WorkflowOp) {
  data.value = await window.api.workflowOp(workflow, op);
}
async function decideSession(path: string, result: '' | 'approved' | 'rejected', picks?: Record<string, boolean>) {
  data.value = await window.api.decideSession(path, result, picks);
}
async function saveInstruction(path: string, text: string) {
  data.value = await window.api.saveInstruction(path, text);
}

async function patchFile(path: string, patch: Record<string, unknown>) {
  data.value = await window.api.patchFile(path, patch);
}

async function proposeDocUpdate(docPath: string, instruction: string) {
  return window.api.proposeDocUpdate(docPath, instruction);
}
async function splitFeat(featId: string) {
  return window.api.splitFeat(featId);
}
async function applySplit(featId: string, proposal: SplitProposal) {
  data.value = await window.api.applySplit(featId, proposal);
}

async function choose() {
  const next = await window.api.chooseWorkspace();
  if (next) data.value = next;
}

async function setWorkspace(root: string) {
  const next = await window.api.setWorkspace(root);
  if (next) data.value = next;
}

export function useProject() {
  if (!data.value && !loading.value) void load();
  return {
    data,
    loading,
    reload: load,
    choose,
    setWorkspace,
    resolveInbox,
    importDriveDoc,
    saveEntity,
    deleteEntity,
    workflowOp,
    decideSession,
    saveInstruction,
    patchFile,
    splitFeat,
    restoreWorkflowVersion,
    snapshotWorkflow,
    rebuildStats,
    syncSubagents,
    removeSubagent,
    runBackgroundTask,
    approveBackgroundTask,
    saveScript,
    deleteScript,
    proposeDocUpdate,
    applySplit,
    waiting: computed(() => (data.value?.inbox ?? []).filter((i) => !i.done).length)
  };
}
