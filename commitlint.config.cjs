// commitlint config — Fase 10 Sprint 10E.
// Conventional Commits estricto. Activado vía .husky/commit-msg.
// Para activar: ver docs/runbook.md §13 (requiere npm i -D @commitlint/{cli,config-conventional} husky).

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'backend',
        'docs',
        'infra',
        'e2e',
        'runbook',
        'ci',
        'migrations',
        'deps',
        'sync',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
