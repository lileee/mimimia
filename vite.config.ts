import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  const allowDebugQuery = mode === 'development' || runtime.process?.env?.VITE_TEST_BUILD === '1';
  return {
    base: './',
    define: {
      __MIMIMIA_ALLOW_DEBUG_QUERY__: JSON.stringify(allowDebugQuery),
    },
    build: {
      sourcemap: false,
    },
    server: {
      host: '127.0.0.1',
      port: 4174,
    },
  };
});
