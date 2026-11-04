// ESLint flat config: JS + typescript-eslint recommended rules for the game sources and tests.
// Rules that would force mass edits of working, tested code are relaxed to warnings (see DESIGN.md "Kualitas kode").
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-classic/**', 'dev/**', 'public/**', 'node_modules/**', '**/*.min.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', '*.ts'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // compact game code uses `cond && act()` / ternary statements and `let` for values set once per frame block
      '@typescript-eslint/no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
      'prefer-const': 'warn',
    },
  },
);
