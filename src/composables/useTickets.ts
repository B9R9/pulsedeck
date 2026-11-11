import { ref } from 'vue';
import type { TicketEdits, TicketsData } from '../shared/types';

const data = ref<TicketsData | null>(null);
const loading = ref(false);
/** Prompt préparé depuis un ticket, repris par Développement à son ouverture. */
export const pendingPrompt = ref('');
/** Workflow à présélectionner dans ce brouillon (demande venue d'une tâche de fond). */
export const pendingWorkflow = ref('');
let unsubscribe: (() => void) | undefined;

async function load() {
  loading.value = true;
  try {
    data.value = await window.api.loadTickets();
  } finally {
    loading.value = false;
  }
}

async function chooseFile() {
  const next = await window.api.chooseTicketsFile();
  if (next) data.value = next;
}

async function linkTicket(key: string, parent: string, docs: string[]) {
  data.value = await window.api.linkTicket(key, { parent, docs });
}

async function saveTicket(key: string, edits: TicketEdits) { data.value = await window.api.saveTicket(key, edits); }
async function resetTicket(key: string) { data.value = await window.api.resetTicket(key); }
async function createTicket(fields: TicketEdits & { summary: string }) { data.value = await window.api.createTicket(fields); }
async function deleteTicket(key: string) { data.value = await window.api.deleteTicket(key); }

export function useTickets() {
  if (!data.value && !loading.value) void load();
  if (!unsubscribe) unsubscribe = window.api.onTicketsChanged((next) => { data.value = next; });
  return { tickets: data, loading, reload: load, chooseFile, linkTicket, saveTicket, resetTicket, createTicket, deleteTicket };
}
