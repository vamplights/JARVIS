import { access, readFile } from 'node:fs/promises';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeSettings } from '../scripts/init-settings.mjs';
import { importPrototypeData } from './import-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const prototype = path.join(root, 'outputs', 'desktop-prototype');
const dataDirectory = path.join(prototype, 'data');

async function prepareData() {
  const count = await importPrototypeData(process.env.JARVIS_DATA_DIR || path.join(root, 'data'), dataDirectory);
  if (count !== null) console.log(`Imported and verified ${count} files from the existing JARVIS installation.`);
}

async function runServer() {
  if (!process.connected) throw Error('Start the prototype server through the desktop launcher.');
  let loaded = false;
  process.on('disconnect', () => {
    if (loaded) process.emit('SIGTERM');
  });
  initializeSettings(root);
  await import('../server.mjs');
  loaded = true;
  if (!process.connected) process.emit('SIGTERM');
}

function portIsOpen(port) {
  return new Promise((resolve, reject) => {
    const connection = net.connect(port, '127.0.0.1');
    connection.setTimeout(1500);
    connection.once('connect', () => { connection.destroy(); resolve(true); });
    connection.once('timeout', () => { connection.destroy(); reject(Error('Loopback port check timed out.')); });
    connection.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

async function waitForServer(server, url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && server.exitCode === null && server.signalCode === null) {
    try {
      const response = await fetch(new URL('/api/health', url), {
        redirect: 'error',
        signal: AbortSignal.timeout(2000),
      });
      const health = response.ok ? await response.json() : null;
      if (health?.application === 'jarvis' && health.pid === server.pid) return;
    } catch {
      // Startup may still be in progress.
    }
    await delay(250);
  }
  throw Error('The prototype server did not pass its local health check.');
}

async function launchPrototype(check) {
  const config = JSON.parse(await readFile(new URL('pake.json', import.meta.url), 'utf8'));
  const url = new URL(config.url);
  if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(config.url) || Number(url.port) < 1024) {
    throw Error('The desktop prototype requires a fixed loopback HTTP port.');
  }
  const executable = path.join(prototype, 'dist', config.name + '.exe');
  if (!check) {
    await access(executable).catch(() => {
      throw Error('Desktop executable is missing. Run desktop/Build-JARVIS.ps1 first.');
    });
  }
  if (await portIsOpen(Number(url.port))) {
    throw Error('The prototype port is already in use. Close the existing app or choose a different port and rebuild the shell.');
  }
  await prepareData();
  const server = fork(fileURLToPath(import.meta.url), ['--server'], {
    cwd: root,
    env: {
      ...process.env,
      JARVIS_PORT: url.port,
      JARVIS_DATA_DIR: dataDirectory,
      JARVIS_OFFLINE: '1',
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });
  const serverExited = once(server, 'exit');
  let shell;
  const interrupt = () => {
    if (shell?.exitCode === null) shell.kill();
    if (server.connected) server.disconnect();
  };
  process.once('SIGINT', interrupt);
  try {
    await Promise.race([
      waitForServer(server, url),
      serverExited.then(() => { throw Error('The prototype server stopped before it was ready.'); }),
    ]);
    if (!server.connected) return;
    if (check) {
      const [page, script, state] = await Promise.all(
        ['/', '/app.js', '/api/state'].map((route) =>
          fetch(new URL(route, url), { signal: AbortSignal.timeout(5000) })),
      );
      if (!page.ok || !(await page.text()).includes('<title>JARVIS</title>') ||
          !script.ok || !state.ok || !Array.isArray((await state.json()).journal)) {
        throw Error('The prototype server did not return the JARVIS interface.');
      }
      await script.body?.cancel();
      console.log('Prototype health and interface checks passed.');
      return;
    }
    shell = spawn(executable, [], { cwd: path.dirname(executable), stdio: 'ignore' });
    const [code] = await Promise.race([
      once(shell, 'exit'),
      serverExited.then(() => { throw Error('The prototype server stopped while the window was open.'); }),
    ]);
    if (code) throw Error(`The JARVIS window exited with code ${code}.`);
  } finally {
    process.off('SIGINT', interrupt);
    interrupt();
    await Promise.race([serverExited, delay(5000, undefined, { ref: false })]);
    if (server.exitCode === null && server.signalCode === null) server.kill();
  }
}

try {
  if (process.argv[2] === '--server') await runServer();
  else if (process.argv[2] === '--import-data') await prepareData();
  else await launchPrototype(process.argv[2] === '--check');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
