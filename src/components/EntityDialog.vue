<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" @show="init">
    <q-card class="dlg" role="dialog" :aria-label="heading">
      <div class="head">
        <span class="title">{{ heading }}</span>
        <button class="ic" aria-label="Fermer" title="Fermer" @click="emit('update:modelValue', false)">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
        </button>
      </div>

      <form class="body" novalidate @submit.prevent="submit">
        <section v-for="s in sections" :key="s.name" class="section">
          <span v-if="s.name" class="stitle">{{ s.name }}</span>
          <div class="grid">
            <div v-for="f in s.fields" :key="f.key" class="field" :class="{ half: f.half }">
              <q-toggle v-if="f.type === 'bool'" v-model="form[f.key] as boolean" :label="f.label" color="green" dark />
              <q-select
                v-else-if="f.type === 'enum'" v-model="form[f.key] as string" :options="f.options" :label="label(f)"
                emit-value map-options outlined dark dense options-dense :hint="f.hint" popup-content-class="dlg-menu"
              />
              <q-select
                v-else-if="f.type === 'ref'" v-model="form[f.key] as string" :options="refOptions(f)" :label="label(f)"
                emit-value map-options outlined dark dense options-dense clearable :hint="f.hint" popup-content-class="dlg-menu"
              />
              <q-select
                v-else-if="f.type === 'list'" v-model="form[f.key] as string[]" :options="listOptions(f)" :label="label(f)"
                multiple use-chips use-input new-value-mode="add-unique" :hide-dropdown-icon="!f.suggest && !f.suggestFrom" input-debounce="0"
                outlined dark dense options-dense :hint="f.hint" popup-content-class="dlg-menu"
              />
              <q-input
                v-else-if="f.type === 'text'" v-model="form[f.key] as string" :label="label(f)" type="textarea"
                autogrow outlined dark :hint="f.hint"
              />
              <q-input
                v-else v-model="form[f.key] as string" :label="label(f)" :type="f.type === 'number' ? 'number' : 'text'"
                outlined dark dense :hint="f.key === 'id' && autoId ? (idDef?.idAuto ? 'Numéro suivant, modifiable. Ne pourra plus changer.' : 'Rempli d\'après le nom. Ne pourra plus changer.') : f.hint" hide-bottom-space
                :error="showErrors && f.required && !String(form[f.key] ?? '').trim()" error-message="Obligatoire"
                @update:model-value="f.key === 'id' && (idTouched = true)"
              />
              <div v-if="f.suggestScripts && (data?.scripts ?? []).length" class="scriptchips" role="group" aria-label="Scripts du projet">
                <span class="cap">Scripts du projet</span>
                <button v-for="sc in data?.scripts ?? []" :key="sc.name" type="button" class="chipb" @click="form[f.key] = scriptCommand(sc.name)">{{ sc.name }}</button>
              </div>
              <AiSuggest
                v-if="f.ai && (f.type === 'text' || f.type === 'string')" :kind="aiKind" :field="f.key" :context="contextFor(f.key)"
                :current="String(form[f.key] ?? '')" :mono="f.key === 'command'" @use="form[f.key] = $event"
              />
            </div>
          </div>
        </section>

        <section v-if="def.body" class="section">
          <span class="stitle">{{ def.body.label }}</span>
          <q-input v-model="text" type="textarea" autogrow outlined dark dense input-class="mono-ta" :aria-label="def.body.label" />
          <AiSuggest v-if="def.body.ai" :kind="aiKind" field="body" :context="contextFor('body')" :current="text" @use="text = $event" />
        </section>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button type="submit" hidden aria-hidden="true" tabindex="-1" />
      </form>

      <div class="foot">
        <span class="note">Les champs marqués d'une étoile sont obligatoires.</span>
        <button class="btn" @click="emit('update:modelValue', false)">Annuler</button>
        <button class="btn main" :disabled="busy" @click="submit">{{ path ? 'Enregistrer' : 'Créer' }}</button>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ENTITIES, scriptCommand } from '../shared/entities';
import type { EntityKind, FieldDef } from '../shared/entities';
import { useProject } from '../composables/useProject';
import { useTickets } from '../composables/useTickets';
import AiSuggest from './AiSuggest.vue';

const props = defineProps<{
  modelValue: boolean;
  kind?: EntityKind;
  /** Formulaire libre (étape d'un workflow) : champs et action d'enregistrement fournis par la page. */
  fieldDefs?: FieldDef[];
  submitFn?: (fields: Record<string, unknown>) => Promise<void>;
  titleText?: string;
  /** Chemin du fichier à modifier ; null pour une création. */
  path: string | null;
  values?: Record<string, unknown>;
  body?: string;
  /** Nature de l'objet pour les suggestions de l'IA (par défaut : kind). */
  aiKind?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved'): void }>();

const { data, saveEntity } = useProject();
const jira = useTickets();
const def = computed(() => (props.kind ? ENTITIES[props.kind] : { label: '', fields: [] as FieldDef[], body: undefined as { label: string; ai?: boolean } | undefined }));
const allFields = computed(() => (props.fieldDefs ?? def.value.fields).filter((f) => !(props.path && f.createOnly)));
const heading = computed(() => props.titleText ?? (props.path ? 'Modifier : ' : 'Nouveau : ') + def.value.label.toLowerCase());

const form = ref<Record<string, unknown>>({});
const text = ref('');
const error = ref('');
const busy = ref(false);
const showErrors = ref(false);
const idTouched = ref(false);

/** Le type choisi décide des champs visibles (un script n'a pas de modèle, un agent pas de commande). */
const currentType = computed(() => String(form.value.type ?? props.values?.type ?? ''));
const visible = computed(() => allFields.value.filter((f) => !f.onlyFor || f.onlyFor.includes(currentType.value)));
const sections = computed(() => {
  const out: { name: string; fields: FieldDef[] }[] = [];
  for (const f of visible.value) {
    const name = f.section ?? '';
    let s = out.find((x) => x.name === name);
    if (!s) { s = { name, fields: [] }; out.push(s); }
    s.fields.push(f);
  }
  // Le nom du fichier passe en fin de première section.
  for (const s of out) {
    const i = s.fields.findIndex((f) => f.key === 'id');
    if (i >= 0) s.fields.push(...s.fields.splice(i, 1));
  }
  return out;
});

const aiKind = computed(() => props.aiKind ?? props.kind ?? '');

/** Les autres champs du formulaire, avec leurs libellés, pour que l'IA comprenne de quoi il s'agit. */
function contextFor(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  const d = data.value;
  for (const f of visible.value) {
    if (f.key === key || f.key === 'id' || f.type === 'bool') continue;
    let v = form.value[f.key];
    if (f.type === 'ref' && v) {
      const o = refOptions(f).find((x) => x.value === v);
      v = o?.label ?? v;
      if (f.refKind === 'feat') { const ft = d?.feats.find((x) => x.id === form.value[f.key]); if (ft?.goal) v += ' (résultat attendu : ' + ft.goal + ')'; }
    }
    const text = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    if (text.trim()) out[f.label] = text;
  }
  if (key === 'command' && d?.scripts.length) out['Scripts disponibles (dossier scripts/)'] = d.scripts.map((x) => scriptCommand(x.name)).join(', ');
  if (!out['Type'] && currentType.value) out['Type'] = currentType.value;
  if (key !== 'body' && text.value.trim()) out['Contenu'] = text.value.slice(0, 1500);
  if (d?.root) out['Projet'] = d.root.split(/[\\/]/).filter(Boolean).pop() ?? '';
  return out;
}

const label = (f: FieldDef) => f.label + (f.required ? ' *' : '');
const idDef = computed(() => allFields.value.find((f) => f.key === 'id'));
const autoId = computed(() => !!idDef.value && !props.path && !idTouched.value);

const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function nextNumber(prefix: string): string {
  const d = data.value;
  const ids = [...(d?.cycles ?? []), ...(d?.feats ?? []), ...(d?.pulses ?? [])].map((x) => x.id);
  const max = Math.max(0, ...ids.filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)) || 0));
  return prefix + (max + 1);
}
watch(() => (idDef.value?.idFrom ? form.value[idDef.value.idFrom] : null), (v) => {
  if (autoId.value && idDef.value?.idFrom) form.value.id = slug(String(v ?? ''));
});

function init() {
  error.value = '';
  showErrors.value = false;
  idTouched.value = false;
  const v = props.values ?? {};
  const out: Record<string, unknown> = {};
  for (const f of allFields.value) {
    const raw = v[f.key];
    if (f.type === 'bool') out[f.key] = raw === true;
    else if (f.type === 'list') out[f.key] = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' && raw ? raw.split(',').map((x) => x.trim()) : [];
    else out[f.key] = raw === null || raw === undefined ? '' : raw;
  }
  if (!props.path && idDef.value?.idAuto && !out.id) out.id = nextNumber(idDef.value.idAuto);
  form.value = out;
  text.value = props.body ?? '';
}

function listOptions(f: FieldDef): string[] {
  if (f.suggestFrom === 'doc') return (data.value?.docs ?? []).map((d) => d.path);
  return f.suggest ?? [];
}

function refOptions(f: FieldDef) {
  const d = data.value;
  if (!d) return [];
  switch (f.refKind) {
    case 'ticket': return [
      ...d.cycles.map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` })),
      ...d.feats.map((x) => ({ value: x.id, label: `${x.id} · ${x.title}` })),
      ...d.pulses.map((x) => ({ value: x.id, label: `${x.id} · ${x.title}` })),
      ...(jira.tickets.value?.tickets ?? []).map((t) => ({ value: t.key, label: `${t.key} · ${t.summary}` }))
    ];
    case 'cycle': return d.cycles.map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` }));
    case 'feat': return d.feats.map((x) => ({ value: x.id, label: `${x.id} · ${x.title}` }));
    case 'doc': return d.docs.map((x) => ({ value: x.path, label: x.title }));
    case 'workflow': return d.workflows.map((w) => ({ value: w.id, label: w.name }));
    case 'session': return d.sessions.map((s) => ({ value: s.id, label: s.task || s.name }));
    default: return [];
  }
}

async function submit() {
  showErrors.value = true;
  const missing = visible.value.filter((f) => f.required && f.type !== 'bool' && !String(form.value[f.key] ?? '').trim());
  if (missing.length) {
    error.value = 'À remplir : ' + missing.map((f) => f.label).join(', ') + '.';
    return;
  }
  busy.value = true;
  error.value = '';
  // On n'envoie que les champs visibles : un champ caché par le type ne doit pas écraser une valeur.
  const keys = new Set(visible.value.map((f) => f.key));
  const fields = Object.fromEntries(Object.entries(form.value).filter(([k]) => keys.has(k)));
  try {
    if (props.submitFn) await props.submitFn(fields);
    else await saveEntity(props.kind as EntityKind, props.path, fields, def.value.body ? text.value : undefined);
    emit('saved');
    emit('update:modelValue', false);
  } catch (e) {
    error.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.dlg { width: min(680px, 94vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--panel); color: var(--text); border: 1px solid var(--line-2); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, .5); }
.head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 16px 12px 24px; border-bottom: 1px solid var(--line); }
.title { font-size: 17px; font-weight: 600; }
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px 24px 16px; display: flex; flex-direction: column; }
.section { display: flex; flex-direction: column; gap: 10px; padding: 14px 0; & + .section { border-top: 1px solid var(--line); } }
.stitle { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
.field { grid-column: 1 / -1; min-width: 0; &.half { grid-column: auto; } }
.scriptchips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; .cap { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; } }
.error { margin: 8px 0 0; padding: 10px 14px; border-radius: 10px; background: #241414; border: 1px solid #7a3a3a; color: var(--fail); font-size: 13px; }
.foot { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 24px 16px; border-top: 1px solid var(--line); }
.note { flex: 1; font-size: 12px; color: var(--muted); }
:deep(.mono-ta) { font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 12px; min-height: 160px; }
:deep(.q-field--outlined .q-field__control) { border-radius: 8px; }
:deep(.q-field--outlined .q-field__control:before) { border-color: var(--line-2); }
:deep(.q-field--outlined.q-field--focused .q-field__control:after) { border-color: var(--clay); }
:deep(.q-field__label) { color: var(--muted-2); }
:deep(.q-field--focused .q-field__label) { color: var(--clay); }
:deep(.q-chip) { background: #232327; color: var(--text); border: 1px solid var(--line-2); font-size: 12px; }
:deep(.q-field__bottom) { color: var(--muted); }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } .field.half { grid-column: 1 / -1; } }
</style>

<style lang="scss">
.dlg-menu { background: var(--panel-2); color: var(--text); border: 1px solid var(--line-2);
  .q-item { min-height: 36px; } .q-item--active { color: var(--clay); } }
</style>
