function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function runCommand(runner, body) {
  if (!runner) return { success: false, error: 'Command runner not available' };
  try {
    const result = runner.run({
      command: body.command,
      cwd: body.cwd || undefined,
      shell: body.shell || undefined,
    });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function stopCommand(runner, body) {
  if (!runner) return { success: false, error: 'Command runner not available' };
  const id = body.id;
  if (!id) return { success: false, error: 'id is required' };
  const ok = runner.stop(id);
  return { success: ok, error: ok ? undefined : 'Command not found' };
}

function listCommands(runner) {
  if (!runner) return [];
  return runner.list();
}

function getCommand(runner, id) {
  if (!runner) return null;
  return runner.getStatus(id);
}

function getCommandOutput(runner, id, tail) {
  if (!runner) return '';
  return runner.getOutput(id, { tail });
}

module.exports = { runCommand, stopCommand, listCommands, getCommand, getCommandOutput, getBody };
