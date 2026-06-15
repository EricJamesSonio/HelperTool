export const NODE_TYPES = {
  schedule: {
    category: 'Triggers',
    label: 'Schedule',
    color: '#e67e22',
    icon: '\u{1F550}',
    fields: ['Interval', 'Unit'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  webhook: {
    category: 'Triggers',
    label: 'Webhook',
    color: '#e67e22',
    icon: '\u{1F310}',
    fields: ['URL', 'Method'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  fileWatch: {
    category: 'Triggers',
    label: 'File Watch',
    color: '#e67e22',
    icon: '\u{1F4C1}',
    fields: ['Path', 'Event'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  gitEvent: {
    category: 'Triggers',
    label: 'Git Event',
    color: '#e67e22',
    icon: '\u{1F500}',
    fields: ['Event', 'Branch'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  manualTrigger: {
    category: 'Triggers',
    label: 'Manual Trigger',
    color: '#e67e22',
    icon: '\u25B6',
    fields: [],
    maxInputs: 0,
    maxOutputs: 1,
  },
  httpRequest: {
    category: 'Actions',
    label: 'HTTP Request',
    color: '#2980b9',
    icon: '\u{1F30D}',
    fields: ['URL', 'Method', 'Body'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  runScript: {
    category: 'Actions',
    label: 'Run Script',
    color: '#2980b9',
    icon: '\u26A1',
    fields: ['Command', 'Working Dir'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  sendNotification: {
    category: 'Actions',
    label: 'Send Notification',
    color: '#2980b9',
    icon: '\u{1F514}',
    fields: ['Title', 'Message'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  gitOp: {
    category: 'Actions',
    label: 'Git Operation',
    color: '#2980b9',
    icon: '\u{1F500}',
    fields: ['Operation', 'Branch', 'Message'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  sendEmail: {
    category: 'Actions',
    label: 'Send Email (Gmail)',
    color: '#2980b9',
    icon: '\u2709\uFE0F',
    fields: ['To', 'Subject', 'Body'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  condition: {
    category: 'Logic',
    label: 'Condition',
    color: '#8e44ad',
    icon: '\u25C6',
    fields: ['If', 'Operator', 'Value'],
    maxInputs: 1,
    maxOutputs: 2,
  },
  merge: {
    category: 'Logic',
    label: 'Merge',
    color: '#8e44ad',
    icon: '\u21D2',
    fields: [],
    maxInputs: 4,
    maxOutputs: 1,
  },
  wait: {
    category: 'Logic',
    label: 'Wait / Delay',
    color: '#8e44ad',
    icon: '\u23F3',
    fields: ['Duration', 'Unit'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  note: {
    category: 'Free Form',
    label: 'Note',
    color: '#f39c12',
    icon: '\u{1F4DD}',
    fields: ['Text'],
    maxInputs: 0,
    maxOutputs: 0,
    isNote: true,
  },
  freeForm: {
    category: 'Free Form',
    label: 'Custom Step',
    color: '#7f8c8d',
    icon: '\u2B21',
    fields: ['Label', 'Description'],
    maxInputs: 4,
    maxOutputs: 4,
  },
};

export function getNodeType(type) {
  return NODE_TYPES[type] || null;
}

export function getCategories() {
  const cats = {};
  for (const [key, def] of Object.entries(NODE_TYPES)) {
    const cat = def.category || 'Other';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ key, ...def });
  }
  return cats;
}
