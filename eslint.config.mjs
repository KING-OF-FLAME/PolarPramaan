import next from 'eslint-config-next';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'data/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts', '.data/**'] },
  ...next,
];
