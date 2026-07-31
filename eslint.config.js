import pluginVue from 'eslint-plugin-vue';
import vueTsEslintConfig from '@vue/eslint-config-typescript';
import prettierConfig from '@vue/eslint-config-prettier';

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    // `functions/` è un pacchetto Node a sé, con `tsc` come gate: questa
    // config è pensata per il browser e per Vue. Senza l'ignore, il build
    // output finirebbe sotto lint e `--max-warnings 0` romperebbe la CI.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'src/components/ui/**',
      'functions/**',
    ],
  },
  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  prettierConfig,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
