import { computed, ref } from 'vue';
import type { AppSettings, LocalModel } from '../shared/types';

const settings = ref<AppSettings | null>(null);
const loading = ref(false);

export function useSettings() {
  async function loadSettings(): Promise<AppSettings | null> {
    if (loading.value) return settings.value;
    loading.value = true;
    try {
      settings.value = await window.api.loadSettings();
    } catch {
      /* ignore */
    } finally {
      loading.value = false;
    }
    return settings.value;
  }

  async function updateSettings(patch: Partial<AppSettings> | Record<string, unknown>): Promise<AppSettings | null> {
    try {
      settings.value = await window.api.setSettings(patch);
    } catch {
      /* ignore */
    }
    return settings.value;
  }

  function getModelLabel(modelId?: string): string {
    const raw = modelId !== undefined ? modelId : (settings.value?.model ?? '');
    const id = (raw ?? '').trim();
    if (!id) return 'Claude';
    if (id === 'sonnet') return 'Sonnet';
    if (id === 'opus') return 'Opus';
    if (id === 'haiku') return 'Haiku';

    const local = settings.value?.localModels?.find((m: LocalModel) => m.id === id);
    if (local?.label) return local.label;

    const cleaned = (id.split('/').pop() ?? id).split(':')[0] || id;
    return cleaned;
  }

  const activeModel = computed(() => settings.value?.model ?? '');
  const activeModelLabel = computed(() => getModelLabel(activeModel.value));

  const availableModels = computed(() => [
    { value: '', label: 'Défaut de Claude Code' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'opus', label: 'Opus' },
    { value: 'haiku', label: 'Haiku' },
    ...(settings.value?.localModels ?? []).filter((m: LocalModel) => m.on).map((m: LocalModel) => ({ value: m.id, label: m.label }))
  ]);

  return {
    settings,
    loading,
    activeModel,
    activeModelLabel,
    availableModels,
    loadSettings,
    updateSettings,
    getModelLabel
  };
}
