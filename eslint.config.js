const js = require('@eslint/js');
const { includeIgnoreFile } = require('@eslint/compat');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactNative = require('eslint-plugin-react-native');
const globals = require('globals');

module.exports = [
  includeIgnoreFile(require('path').resolve(__dirname, '.gitignore'), 'Imported .gitignore patterns'),
  js.configs.recommended,

  // Ignore global variables from linting (require, module, etc)
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.reactNative,
      },
    },
  },

  // Javascript files, basic JS, RN, React checks
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-native': reactNative,
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-key': 'error',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-unused-styles': 'error',
    },
  },

  // TypeScript files, more strict linter and rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    ...tseslint.configs.recommendedTypeChecked[0],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-native': reactNative,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react/jsx-key': 'error',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-unused-styles': 'error',
      'react-native/split-platform-components': 'warn',
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-undef': 'error',
      'no-unused-vars': 'off', // handled by TS linter
    },
  },
];
