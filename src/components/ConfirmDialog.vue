<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="dlg" role="alertdialog" :aria-label="title">
      <q-card-section>
        <div class="h">{{ title }}</div>
        <p class="msg">{{ message }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </q-card-section>
      <q-card-actions align="right" class="actions">
        <button class="btn" @click="emit('update:modelValue', false)">Annuler</button>
        <button class="btn danger" :disabled="busy" @click="run">{{ action }}</button>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{ modelValue: boolean; title: string; message: string; action?: string; onConfirm: () => Promise<void> }>(), { action: 'Supprimer' });
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
const error = ref('');
const busy = ref(false);
watch(() => props.modelValue, (v) => { if (v) error.value = ''; });

async function run() {
  busy.value = true;
  error.value = '';
  try {
    await props.onConfirm();
    emit('update:modelValue', false);
  } catch (e) {
    error.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.dlg { width: min(440px, 92vw); background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 12px; }
.h { font-size: 15px; font-weight: 600; }
.msg { color: var(--muted-2); font-size: 13px; margin: 8px 0 0; }
.error { color: var(--fail); font-size: 13px; margin: 8px 0 0; }
.actions { gap: 8px; padding: 8px 16px 16px; }
</style>
