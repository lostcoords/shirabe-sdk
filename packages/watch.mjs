import { spawn } from 'node:child_process';
import { watch, writeFileSync } from 'node:fs';

let build;
let timer;
let pending = false;

function runBuild() {
  if (build || !pending) return;
  pending = false;
  build = spawn('tsc', ['-p', 'tsconfig.build.json', '--noEmitOnError'], { stdio: 'inherit' });
  build.on('close', (code) => {
    if (code === 0) writeFileSync('dist-ready', '');
    build = undefined;
    runBuild();
  });
}

function scheduleBuild() {
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(runBuild, 100);
}

const sourceWatcher = watch('src', { recursive: true }, scheduleBuild);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    sourceWatcher.close();
    clearTimeout(timer);
    build?.kill(signal);
    process.exit(0);
  });
}

scheduleBuild();
