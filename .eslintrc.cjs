module.exports = {
  overrides: [
    {
      files: ['tests/**', '**/*.test.ts', 'tests/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off'
      }
    }
  ]
};
