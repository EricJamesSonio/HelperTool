const ICON_PATHS = {
  schedule: 'M3,8a5,5 0 1,0 10,0 5,5 0 1,0 -10,0 M8,5v4l2.5,1.5',
  webhook: 'M3,8a5,5 0 1,0 10,0 5,5 0 1,0 -10,0 M3,8h10 M8,3v10',
  fileWatch: 'M2,4h4l2,2h8v7H2z',
  gitEvent: 'M6,3v10 M6,6l5,3 M6,10l5-3',
  manualTrigger: 'M5,3l8,5-8,5z',
  httpRequest: 'M3,8a5,5 0 1,0 10,0 5,5 0 1,0 -10,0 M5,8h5l-2,2 M10,8l-2-2',
  runScript: 'M9,2l-5,7h4l-2,7 7-9h-4z',
  sendNotification: 'M8,3a3,3 0 0 1 3,3c0,2 1,2.5 1,3.5H4c0-1 1-1.5 1-3.5a3,3 0 0 1 3-3z M5,10h6',
  gitOp: 'M6,3v10 M6,6l5,3 M6,10l5-3',
  sendEmail: 'M2,5h12v7H2z M2,6l6,4 6-4',
  condition: 'M8,3l5,5-5,5-5-5z',
  merge: 'M8,11V7a3,3 0 0 0-3-3H3 M8,7a3,3 0 0 1 3-3h2 M8,4l2,2 M8,4l-2,2',
  wait: 'M4,3h8l-4,5 4,5H4l4-5-4-5z',
  note: 'M3,3h7l4,4v9H3z M10,3v4h4',
  freeForm: 'M8,3l5,2.5v5L8,13l-5-2.5v-5z',
};

export const NODE_TYPES = {
  schedule: {
    category: 'Triggers',
    label: 'Schedule',
    color: '#e67e22',
    iconPath: ICON_PATHS.schedule,
    fields: ['Interval', 'Unit'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  webhook: {
    category: 'Triggers',
    label: 'Webhook',
    color: '#e67e22',
    iconPath: ICON_PATHS.webhook,
    fields: ['URL', 'Method'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  fileWatch: {
    category: 'Triggers',
    label: 'File Watch',
    color: '#e67e22',
    iconPath: ICON_PATHS.fileWatch,
    fields: ['Path', 'Event'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  gitEvent: {
    category: 'Triggers',
    label: 'Git Event',
    color: '#e67e22',
    iconPath: ICON_PATHS.gitEvent,
    fields: ['Event', 'Branch'],
    maxInputs: 0,
    maxOutputs: 1,
  },
  manualTrigger: {
    category: 'Triggers',
    label: 'Manual Trigger',
    color: '#e67e22',
    iconPath: ICON_PATHS.manualTrigger,
    fields: [],
    maxInputs: 0,
    maxOutputs: 1,
  },
  httpRequest: {
    category: 'Actions',
    label: 'HTTP Request',
    color: '#2980b9',
    iconPath: ICON_PATHS.httpRequest,
    fields: ['URL', 'Method', 'Body'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  runScript: {
    category: 'Actions',
    label: 'Run Script',
    color: '#2980b9',
    iconPath: ICON_PATHS.runScript,
    fields: ['Command', 'Working Dir'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  sendNotification: {
    category: 'Actions',
    label: 'Send Notification',
    color: '#2980b9',
    iconPath: ICON_PATHS.sendNotification,
    fields: ['Title', 'Message'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  gitOp: {
    category: 'Actions',
    label: 'Git Operation',
    color: '#2980b9',
    iconPath: ICON_PATHS.gitOp,
    fields: ['Operation', 'Branch', 'Message'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  sendEmail: {
    category: 'Actions',
    label: 'Send Email (Gmail)',
    color: '#2980b9',
    iconPath: ICON_PATHS.sendEmail,
    fields: ['To', 'Subject', 'Body'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  condition: {
    category: 'Logic',
    label: 'Condition',
    color: '#8e44ad',
    iconPath: ICON_PATHS.condition,
    fields: ['If', 'Operator', 'Value'],
    maxInputs: 1,
    maxOutputs: 2,
  },
  merge: {
    category: 'Logic',
    label: 'Merge',
    color: '#8e44ad',
    iconPath: ICON_PATHS.merge,
    fields: [],
    maxInputs: 4,
    maxOutputs: 1,
  },
  wait: {
    category: 'Logic',
    label: 'Wait / Delay',
    color: '#8e44ad',
    iconPath: ICON_PATHS.wait,
    fields: ['Duration', 'Unit'],
    maxInputs: 1,
    maxOutputs: 1,
  },
  note: {
    category: 'Free Form',
    label: 'Note',
    color: '#f39c12',
    iconPath: ICON_PATHS.note,
    fields: ['Text'],
    maxInputs: 0,
    maxOutputs: 0,
    isNote: true,
  },
  freeForm: {
    category: 'Free Form',
    label: 'Custom Step',
    color: '#7f8c8d',
    iconPath: ICON_PATHS.freeForm,
    fields: ['Label', 'Description'],
    maxInputs: 4,
    maxOutputs: 4,
  },
};

export { ICON_PATHS };

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
