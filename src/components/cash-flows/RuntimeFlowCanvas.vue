<script setup>
import { ref } from 'vue'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

const runtimeNodes = ref([])
const runtimeEdges = ref([])
</script>

<template>
  <section class="runtime-flow-canvas min-w-0">
    <div class="relative h-[420px] min-h-[320px] overflow-hidden rounded-lg border bg-background">
      <VueFlow
        v-model:nodes="runtimeNodes"
        v-model:edges="runtimeEdges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="false"
        :zoom-on-double-click="false"
        :fit-view-on-init="true"
        class="runtime-flow"
      >
        <Background variant="dots" :gap="20" :size="1" color="#d4d4d8" />
        <Controls />
      </VueFlow>
    </div>
  </section>
</template>

<style scoped>
.runtime-flow-canvas :deep(.vue-flow__controls) {
  border: 1px solid hsl(0 0% 89.8%);
  border-radius: 6px;
  box-shadow: none;
}

.runtime-flow-canvas :deep(.vue-flow__controls-button) {
  border-bottom-color: hsl(0 0% 89.8%);
  background: white;
  color: #18181b;
}

.runtime-flow-canvas :deep(.vue-flow__controls-button:hover) {
  background: #f4f4f5;
}

.runtime-flow {
  width: 100%;
  height: 100%;
}
</style>
