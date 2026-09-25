import next from 'eslint-config-next';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'data/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts', '.data/**'] },
  ...next,
  {
    rules: {
      // Credited source images are shown from the provider's own servers on purpose (no re-hosting/optimisation copies).
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
