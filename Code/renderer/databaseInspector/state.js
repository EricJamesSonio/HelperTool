export const state = {
  connections: [],
  snapshots: [],
  currentConnectionId: null,
  currentSnapshotId: null,
  graphData: null,
  selectedTable: null,
  selectedTableDetails: null,
  diffData: null,
  seeds: [],
  selectedSeed: null,
  seedDirty: false,
};

export function setState(partial) {
  Object.assign(state, partial);
}
