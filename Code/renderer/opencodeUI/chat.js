import { state } from './state.js';
import { getConversation } from './history.js';

function getTerminal() {
  return document.getElementById('ocTerminalOutput');
}

export function clearTerminal() {
  const pre = getTerminal();
  if (pre) pre.innerHTML = '';
}

export function appendToTerminal(text, className) {
  const pre = getTerminal();
  if (!pre) return;
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  pre.appendChild(span);
  scrollToBottom();
}

export function appendUserMessage(text) {
  appendToTerminal('$ ' + text + '\n', 'oc-term-user');
}

export function appendResponse(text) {
  appendToTerminal(text);
}

export function appendStreamChunk(chunk) {
  const pre = getTerminal();
  if (!pre) return;

  // If last child is a streaming response span, append to it
  let last = pre.lastElementChild;
  if (!last || !last.classList.contains('oc-term-streaming')) {
    last = document.createElement('span');
    last.className = 'oc-term-streaming';
    pre.appendChild(last);
  }

  last.textContent += chunk;
  state.streamBuffer += chunk;
  scrollToBottom();
}

export function finalizeStream(fullContent) {
  const pre = getTerminal();
  if (!pre) return;

  let last = pre.lastElementChild;
  if (last && last.classList.contains('oc-term-streaming')) {
    last.classList.remove('oc-term-streaming');
    last.textContent = fullContent;
  }

  state.streamBuffer = '';
  state.streaming = false;
  scrollToBottom();
}

export async function loadConvMessages(convIdOrMessages) {
  let messages = convIdOrMessages;
  if (typeof convIdOrMessages === 'string') {
    const data = await getConversation(convIdOrMessages);
    messages = data?.messages || [];
  }
  clearTerminal();
  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'human') {
      appendUserMessage(msg.content);
    } else {
      appendResponse(msg.content);
    }
  }
  return messages;
}

export function scrollToBottom() {
  requestAnimationFrame(() => {
    const container = document.getElementById('ocTerminal');
    if (container) container.scrollTop = container.scrollHeight;
  });
}
