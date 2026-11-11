<template>
  <div class="page">
    <div class="stack">
      <div class="top"><button class="btn main" @click="open(null)">Nouveau script</button></div>
      <div class="intro">
        <strong>Scripts du projet</strong>
        <span class="sub">Fichiers du dossier scripts/. Une étape de type script les lance avec une commande comme <span class="mono">bash scripts/nom.sh</span>. Chaque lancement demande ton accord et affiche le contenu du script.</span>
      </div>
      <p v-if="!scripts.length" class="empty">Aucun script. Crée-en un, l'IA peut l'écrire d'après ta description.</p>
      <div class="cards">
        <article v-for="s in scripts" :key="s.name" class="card">
          <div class="top">
            <strong class="mono">{{ s.name }}</strong>
            <span class="tag">{{ s.size }} octets</span>
            <span class="small push">Modifié le {{ s.updated }}</span>
          </div>
          <pre class="peek">{{ preview(s.content) }}</pre>
          <span class="sub3">{{ usedIn(s.name).length ? 'Utilisé dans : ' + usedIn(s.name).join(', ') : 'Utilisé nulle part' }}</span>
          <span class="mono cmd">{{ scriptCommand(s.name) }}</span>
          <span class="row-actions">
            <button class="btn small" @click="open(s)">Modifier</button>
            <button class="btn small danger" @click="askDelete(s.name)">Supprimer</button>
          </span>
        </article>
      </div>
    </div>

    <q-dialog v-model="dlg" @show="error = ''">
      <q-card class="dlgcard" role="dialog" :aria-label="creating ? 'Nouveau script' : 'Modifier ' + name">
        <div class="dhead">
          <span class="dtitle">{{ creating ? 'Nouveau script' : 'Modifier : ' + name }}</span>
          <button class="ic" aria-label="Fermer" title="Fermer" @click="dlg = false">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
          </button>
        </div>
        <form class="dbody" novalidate @submit.prevent="save">
          <q-input v-if="creating" v-model="name" label="Nom du fichier *" outlined dark dense hint="Lettres, chiffres, tirets, fin en .sh, .mjs ou .py. Ne pourra plus changer." />
          <q-input v-model="content" label="Contenu" type="textarea" autogrow outlined dark dense input-class="mono-ta" :input-style="{ minHeight: '220px' }" />
          <AiSuggest kind="script" field="body" :context="aiContext()" :current="content" mono @use="content = $event" />
          <p v-if="error" class="err" role="alert">{{ error }}</p>
          <button type="submit" hidden aria-hidden="true" tabindex="-1" />
        </form>
        <div class="dfoot">
          <button class="btn" @click="dlg = false">Annuler</button>
          <button class="btn main" :disabled="busy" @click="save">{{ creating ? 'Créer' : 'Enregistrer' }}</button>
        </div>
      </q-card>
    </q-dialog>

    <ConfirmDialog v-model="confirm" title="Supprimer ce script ?" :message="'« ' + target + ' » sera supprimé du dossier scripts/. Les étapes qui le lancent échoueront.'" :on-confirm="doDelete" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProject } from '../composables/useProject';
import { scriptCommand } from '../shared/entities';
import type { ScriptFile } from '../shared/types';
import AiSuggest from './AiSuggest.vue';
import ConfirmDialog from './ConfirmDialog.vue';

const { data, saveScript, deleteScript } = useProject();
const scripts = computed(() => data.value?.scripts ?? []);

const dlg = ref(false);
const creating = ref(true);
const name = ref('');
const content = ref('');
const error = ref('');
const busy = ref(false);
const confirm = ref(false);
const target = ref('');

const preview = (c: string) => c.split('\n').slice(0, 6).join('\n');

/** Étapes (de la bibliothèque ou des workflows) dont la commande lance ce script. */
function usedIn(file: string): string[] {
  const hit = (cmd: string) => cmd.includes('scripts/' + file);
  return [
    ...(data.value?.library ?? []).filter((n) => hit(n.command)).map((n) => 'bibliothèque : ' + n.label),
    ...(data.value?.workflows ?? []).flatMap((w) => w.nodes.filter((n) => hit(n.command)).map((n) => w.name + ' : ' + n.label))
  ];
}

function open(s: ScriptFile | null) {
  creating.value = !s;
  name.value = s?.name ?? '';
  content.value = s?.content ?? '';
  dlg.value = true;
}

function aiContext(): Record<string, string> {
  const ext = name.value.split('.').pop() ?? '';
  return {
    'Nom du fichier': name.value,
    Langage: ext === 'mjs' ? 'Node (modules ES)' : ext === 'py' ? 'Python 3' : 'bash',
    'Autres scripts du projet': scripts.value.map((s) => s.name).join(', ')
  };
}

async function save() {
  if (creating.value && !name.value.trim()) { error.value = 'Donne un nom au script.'; return; }
  busy.value = true;
  error.value = '';
  try {
    await saveScript(name.value.trim(), content.value, creating.value);
    dlg.value = false;
  } catch (e) {
    error.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally {
    busy.value = false;
  }
}

function askDelete(file: string) { target.value = file; confirm.value = true; }
async function doDelete() { await deleteScript(target.value); }
</script>

<style scoped lang="scss">
.page { height: 100%; overflow: auto; padding: 20px 24px; }
.stack { max-width: 980px; display: flex; flex-direction: column; gap: 14px; }
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.push { margin-left: auto; }
.intro { display: flex; flex-direction: column; gap: 4px; .sub { font-size: 13px; color: var(--muted-2); } }
.empty { margin: 0; font-size: 13px; color: var(--muted-2); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 12px; }
.small { font-size: 12px; color: var(--muted); }
.peek { margin: 0; padding: 8px 10px; max-height: 120px; overflow: hidden; font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 11px; line-height: 1.5; color: var(--muted-2); background: #141416; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.sub3 { font-size: 12px; color: var(--muted); }
.cmd { font-size: 12px; color: var(--blue); }
.dlgcard { width: min(760px, 94vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--panel); color: var(--text); border: 1px solid var(--line-2); border-radius: 14px; }
.dhead { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 12px 24px; border-bottom: 1px solid var(--line); }
.dtitle { font-size: 17px; font-weight: 600; }
.dbody { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
.dfoot { flex: none; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 24px 16px; border-top: 1px solid var(--line); }
.err { margin: 0; padding: 10px 14px; border-radius: 10px; background: #241414; border: 1px solid #7a3a3a; color: var(--fail); font-size: 13px; }
:deep(.mono-ta) { font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 12px; }
:deep(.q-field--outlined .q-field__control) { border-radius: 8px; }
:deep(.q-field--outlined .q-field__control:before) { border-color: var(--line-2); }
:deep(.q-field--outlined.q-field--focused .q-field__control:after) { border-color: var(--clay); }
:deep(.q-field__label) { color: var(--muted-2); }
:deep(.q-field--focused .q-field__label) { color: var(--clay); }
:deep(.q-field__bottom) { color: var(--muted); }
</style>
