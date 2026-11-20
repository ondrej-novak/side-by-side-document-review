import { defineConfig, globalIgnores } from 'eslint/config';
import agentGuard from 'eslint-plugin-agent-guard';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', '**/bin/', '**/obj/']),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
  },
  { files: ['**/*.{js,jsx,ts,tsx}'], extends: [agentGuard.configs.react] },
);
