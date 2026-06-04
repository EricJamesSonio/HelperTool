export const TABLE_COLORS = [
  { bg: '#22d3ee', text: '#000' },
  { bg: '#34d399', text: '#000' },
  { bg: '#fbbf24', text: '#000' },
  { bg: '#f87171', text: '#000' },
  { bg: '#a78bfa', text: '#000' },
  { bg: '#f472b6', text: '#000' },
  { bg: '#60a5fa', text: '#000' },
  { bg: '#fb923c', text: '#000' },
  { bg: '#2dd4bf', text: '#000' },
  { bg: '#4ade80', text: '#000' },
  { bg: '#facc15', text: '#000' },
  { bg: '#38bdf8', text: '#000' },
  { bg: '#e879f9', text: '#000' },
  { bg: '#6ee7b7', text: '#000' },
  { bg: '#7dd3fc', text: '#000' },
  { bg: '#c084fc', text: '#000' },
  { bg: '#a5b4fc', text: '#000' },
  { bg: '#fdba74', text: '#000' },
];

export function getTableColor(index) {
  return TABLE_COLORS[index % TABLE_COLORS.length];
}
