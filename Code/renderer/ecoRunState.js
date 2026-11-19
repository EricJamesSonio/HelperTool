let run = null;

export function getRun() {
  return run;
}

export function setRun(next) {
  if (!next) {
    run = null;
    return;
  }
  run = {
    cwd: next.cwd || '',
    command: next.command || '',
    label: next.label || '',
  };
}

export function clearRun() {
  run = null;
}