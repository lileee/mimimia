import { spawnSync } from 'node:child_process';

const steps = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'test:unit', '--', '--run']],
  ['npm', ['run', 'rendering:forbidden-check']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'test:functional']],
  ['npm', ['run', 'test:visual']],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Acceptance suite passed.');
