<template>
  <q-page class="page">
    <div class="box">
      <span class="h">À porter depuis la maquette</span>
      <h1>{{ meta.title }}</h1>
      <p>{{ meta.text }}</p>
      <span class="tag blue mono">maquette : {{ meta.board }}</span>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const meta = computed(() => route.meta as { title: string; board: string; text: string });
</script>

<style scoped lang="scss">
.page { display: flex; align-items: center; justify-content: center; padding: 32px; }
.box { max-width: 520px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
h1 { font-size: 24px; font-weight: 600; margin: 0; }
p { color: var(--muted-2); margin: 0; }
</style>
