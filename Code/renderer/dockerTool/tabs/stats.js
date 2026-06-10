import * as state from '../state.js';
import { getStatsPanel } from '../template.js';
import { bytes, loading, showToast } from '../ui.js';

export async function render() {
  const tab = document.getElementById('dtTabStats');
  if (!tab) return;
  tab.innerHTML = getStatsPanel();
  const select = document.getElementById('dtStatsSelect');
  const containers = state.get('containers');
  select.innerHTML = '<option value="">— Select container —</option>';
  containers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
  if (selectedContainerId && state.get('containers').some(c => c.id === selectedContainerId)) {
    select.value = selectedContainerId;
  }
  select.addEventListener('change', () => {
    selectedContainerId = select.value || null;
    if (selectedContainerId) loadStats(selectedContainerId);
    else clearStats();
  });
  if (select.value) loadStats(select.value);
}

let selectedContainerId = null;

function clearStats() {
  setStat('dtStatCpu', '—');
  setStat('dtStatMem', '—');
  setStat('dtStatMemFill', '0%');
  setStat('dtStatNetRx', '—');
  setStat('dtStatNetTx', '—');
  setStat('dtStatPids', '—');
}

function setStat(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setStyle(id, val) {
  const el = document.getElementById(id);
  if (el) el.style.width = val;
}

async function loadStats(id) {
  loading(true);
  try {
    const s = await window.dockerAPI.getStats(id);
    if (!s) {
      showToast('Failed to load stats', 'error');
      clearStats();
      return;
    }
    state.set('stats', { ...state.get('stats'), [id]: s });
    setStat('dtStatCpu', s.cpuPct.toFixed(1) + '%');
    setStat('dtStatMem', bytes(s.memUsage) + ' / ' + bytes(s.memLimit));
    setStat('dtStatMemFill', Math.min(s.memPct, 100).toFixed(1) + '%');
    setStyle('dtStatMemFill', Math.min(s.memPct, 100) + '%');
    setStat('dtStatNetRx', bytes(s.netRx));
    setStat('dtStatNetTx', bytes(s.netTx));
    setStat('dtStatPids', String(s.pids));
  } catch (err) {
    showToast(err.message, 'error');
    clearStats();
  } finally {
    loading(false);
  }
}
