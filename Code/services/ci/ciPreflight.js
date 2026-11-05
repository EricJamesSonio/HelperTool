'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVICE_PORTS = {
  postgres: [5432],
  postgresql: [5432],
  pgsql: [5432],
  mysql: [3306],
  mariadb: [3306],
  mongodb: [27017],
  mongo: [27017],
  redis: [6379],
  rabbitmq: [5672],
  elasticsearch: [9200],
};

const RUNTIME_ACTIONS = new Map([
  ['actions/setup-node', ['node']],
  ['actions/setup-python', ['python', 'python3']],
  ['actions/setup-java', ['java']],
  ['actions/setup-go', ['go']],
  ['actions/setup-dotnet', ['dotnet']],
  ['actions/setup-ruby', ['ruby']],
  ['ruby/setup-ruby', ['ruby']],
  ['shivammathur/setup-php', ['php']],
]);

const LOCKFILES = [
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
];

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findExecutable(name, envPath = process.env.PATH || '') {
  const suffixes = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];

  for (const directory of envPath.split(path.delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, process.platform === 'win32' && !path.extname(name) ? name + suffix : name);
      try {
        fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EACCES' && error.code !== 'ENOTDIR') throw error;
      }
    }
  }
  return null;
}

function probeExecutable(name) {
  const executable = findExecutable(name);
  if (!executable) return { available: false, version: null };

  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
  });

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      return { available: true, version: 'version check timed out' };
    }
    return { available: false, version: null };
  }

  const output = String(result.stdout || '') + '\n' + String(result.stderr || '');
  const version = output.trim().split(/\r?\n/)[0].slice(0, 160);
  return { available: result.status === 0 || !!version, version: version || null };
}

function checkPort(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function packageManager(repoPath, warnings, blockers) {
  const pkgFile = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgFile)) return null;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  } catch (error) {
    warnings.push('package.json could not be read: ' + error.message);
    return null;
  }

  const lockfiles = LOCKFILES.filter(([name]) => fs.existsSync(path.join(repoPath, name)));
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
  const manager = declared || (lockfiles[0] && lockfiles[0][1]) || 'npm';

  if (lockfiles.length > 1) {
    warnings.push('Multiple package-manager lockfiles were found; the selected manager may not match the workflow.');
  }

  const executable = findExecutable(manager);
  if (!executable) {
    blockers.push('The package manager "' + manager + '" is not installed or not on PATH.');
  }

  if (!fs.existsSync(path.join(repoPath, 'node_modules'))) {
    warnings.push('node_modules was not found at the repository root. Dependencies may need to be installed before running commands.');
  }

  return { manager, lockfiles: lockfiles.map(([name]) => name), available: !!executable };
}

function runtimeNames(workflow) {
  const names = new Set();
  for (const job of workflow.jobs || []) {
    for (const step of job.steps || []) {
      if (typeof step.uses !== 'string') continue;
      const action = step.uses.split('@')[0].toLowerCase();
      for (const name of RUNTIME_ACTIONS.get(action) || []) names.add(name);
    }
  }
  return [...names];
}

async function preflight({ repoPath, workflow, plan, envValues = {}, runtimeProbe = probeExecutable, portProbe = checkPort }) {
  const blockers = [];
  const warnings = [];
  const runtimes = [];
  const services = [];
  const missingSecrets = new Set();
  const missingEnvironment = new Set();

  for (const job of plan.jobs || []) {
    for (const step of job.steps || []) {
      if (!isInside(repoPath, step.cwd)) {
        blockers.push('Job "' + job.id + '" has a working directory outside the repository.');
      } else if (step.kind === 'run' && (!fs.existsSync(step.cwd) || !fs.statSync(step.cwd).isDirectory())) {
        blockers.push('Job "' + job.id + '" working directory does not exist: ' + path.relative(repoPath, step.cwd) + '.');
      }

      if (step.kind !== 'run') continue;

      for (const name of step.secretNames || []) {
        if (!Object.prototype.hasOwnProperty.call(envValues, name) && !process.env[name]) missingSecrets.add(name);
      }
      for (const name of step.referencedEnvNames || []) {
        if (!Object.prototype.hasOwnProperty.call(envValues, name) && !process.env[name]) missingEnvironment.add(name);
      }
    }
  }

  if (missingSecrets.size) {
    blockers.push('Required local secrets are missing: ' + [...missingSecrets].sort().join(', ') + '.');
  }
  if (missingEnvironment.size) {
    warnings.push('Referenced environment values are not set locally: ' + [...missingEnvironment].sort().join(', ') + '.');
  }

  for (const name of runtimeNames(workflow)) {
    const result = await runtimeProbe(name);
    runtimes.push({ name, available: !!result.available, version: result.version || null });
    if (!result.available) blockers.push('Required runtime "' + name + '" was not found on PATH.');
  }

  const manager = packageManager(repoPath, warnings, blockers);
  if (manager) {
    runtimes.push({
      name: manager.manager,
      available: manager.available,
      version: null,
    });
  }

  const planned = new Set((plan.jobs || []).map((job) => job.id));
  for (const job of workflow.jobs || []) {
    if (!planned.has(job.id)) continue;
    for (const serviceName of job.services || []) {
      const ports = SERVICE_PORTS[String(serviceName).toLowerCase()];
      if (!ports) {
        warnings.push('Service "' + serviceName + '" has no recognized default port; its readiness was not checked.');
        continue;
      }
      for (const port of ports) {
        const open = await portProbe(port);
        services.push({ jobId: job.id, name: serviceName, port, available: open });
        if (!open) {
          warnings.push(
            'Service "' + serviceName + '" for job "' + job.id + '" is not running on localhost:' + port + '. Commands that need it may fail. Start it locally if they do.'
          );
        }
      }
    }
  }

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    runtimes,
    packageManager: manager,
    services,
    missingSecrets: [...missingSecrets].sort(),
    missingEnvironment: [...missingEnvironment].sort(),
    host: os.hostname(),
  };
}

module.exports = { preflight, findExecutable, probeExecutable, checkPort };