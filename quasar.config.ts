import { defineConfig } from '#q-app/wrappers';

export default defineConfig(() => ({
  boot: [],
  css: ['app.scss'],
  extras: ['material-icons'],
  build: {
    target: {
      browser: ['es2022', 'chrome120'],
      node: 'node20'
    },
    vueRouterMode: 'hash'
  },
  devServer: { open: false },
  framework: {
    config: { dark: true },
    plugins: []
  },
  animations: [],
  electron: {
    preloadScripts: ['electron-preload'],
    inspectPort: 5858,
    extendElectronMainConf(esbuildConf) {
      // Le SDK lance un binaire natif livré dans son dossier : il doit rester un vrai module, pas être fondu dans le bundle.
      esbuildConf.external = [...(esbuildConf.external ?? []), '@anthropic-ai/claude-agent-sdk'];
    },
    bundler: 'packager',
    packager: {},
    builder: { appId: 'fi.talle.claudeui' }
  }
}));
