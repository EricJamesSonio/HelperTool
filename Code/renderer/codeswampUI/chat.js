import { state } from './state.js';
import { getConversation } from './history.js';
import {
  createTerminalSession,
  killTerminalSession,
} from './terminalManager.js';

export function clearTerminal() {
  // No-op: terminal is managed by xterm
}

export async function loadConvMessages(convIdOrMessages) {
  let messages = convIdOrMessages;
  if (typeof convIdOrMessages === 'string') {
    const data = await getConversation(convIdOrMessages);
    messages = data?.messages || [];
  }
  return messages;
}

export async function openTerminalForRepo(repoPath, slotIndex = 0) {
  const welcome = document.getElementById('ocWelcome');
  const terminal = document.getElementById('ocTerminal');
  if (welcome) welcome.style.display = 'none';
  if (terminal) terminal.style.display = '';

  await createTerminalSession(repoPath, slotIndex);
}

export function showWelcome() {
  const welcome = document.getElementById('ocWelcome');
  const terminal = document.getElementById('ocTerminal');
  if (welcome) welcome.style.display = '';
  if (terminal) terminal.style.display = 'none';
}

export function closeTerminalSession(repoPath) {
  killTerminalSession(repoPath);
}
