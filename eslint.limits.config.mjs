// Function limits (D105): the project's ESLint config plus the shared function guide's checks
// (Tonttu84/ai-workflow, templates/function-limits.md), as warnings. A report, not a gate:
// `npm run lint` and lint-staged fail on any warning, so these live here and run only through
// `npm run lint:limits`. The numbers were measured on the code of 2026-11-10 to flag only the
// worst few percent: the template's values, except 80 lines a function instead of 60, since
// long JSX components filled the list at 60. Once the flagged functions are split or accepted
// with a reason, the rules move into eslint.config.mjs as errors.
import sonarjs from 'eslint-plugin-sonarjs';

import base from './eslint.config.mjs';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['warn', 15],
      complexity: ['warn', 15],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 5],
      'max-depth': ['warn', 3],
    },
  },
];
