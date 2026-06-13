import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'server/dist'],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    // Test files configuration
    files: ['**/*.test.{ts,tsx}', '**/*.{spec,test}.{ts,tsx}', 'src/test/setup.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.vitest,
      },
    },
    rules: {
      'no-undef': 'off', // Testing globals are now defined
    },
  },
  eslintConfigPrettier,
);
