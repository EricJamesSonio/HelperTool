const ICON_PATHS = {
  schedule: 'M8,3a5,5 0 1,0 0,10 5,5 0 0,0 0,-10 M8,5.5v3L10.5,10',
  webhook: 'M3,8a5,5 0 1,0 10,0 5,5 0 1,0 -10,0 M8,4v5l3-2',
  fileWatch: 'M2,8s2-4,6-4 6,4 6,4-2,4-6,4-6-4-6-4 M8,6a2,2 0 1,0 0,4 2,2 0 0,0 0,-4',
  gitEvent: 'M5,3v8 M5,7a3,3 0 0,0 3,3h3 M8,6L5,3',
  manualTrigger: 'M5.5,3l8,5-8,5z',
  httpRequest: 'M3,8a5,5 0 1,0 10,0 5,5 0 1,0 -10,0 M3,8h10 M5,4.5A7,7 0 0,1 8,4a7,7 0 0,1 3,0.5 M5,11.5A7,7 0 0,0 8,12a7,7 0 0,0 3,-0.5',
  runScript: 'M2,4h12v8H2z M4,6l2,2-2,2',
  sendNotification: 'M8,2.5a3.5,3.5 0 0,1 3.5,3.5c0,2 1,2.5 1,4h-9c0-1.5 1-2 1-4a3.5,3.5 0 0,1 3.5-3.5z M5.5,10h5',
  gitOp: 'M2,8h4 M10,8h4 M7,8a1,1 0 1,0 2,0 1,1 0 1,0 -2,0',
  sendEmail: 'M2,5h12v6H2z M2,5l6,4 6-4',
  condition: 'M8,3l5,5-5,5-5-5z',
  merge: 'M8,12V7 M5,4h7L8,7',
  wait: 'M4,3h8l-4,4 4,4H4z',
  note: 'M3,3h6l4,4v6H3z M9,3v4h4',
  freeForm: 'M5,3h4v2a1,1 0 1,0 2,0V3h2v5h-2a1,1 0 1,0 -2,0h-4V7a1,1 0 1,0 -2,0v-1a1,1 0 1,0 2,0z',
};

export const NODE_TYPES = {
  schedule: { category: 'Triggers', label: 'Schedule', color: '#ff965a', iconPath: ICON_PATHS.schedule, fields: ['Interval', 'Unit'], maxInputs: 0, maxOutputs: 1 },
  webhook: { category: 'Triggers', label: 'Webhook', color: '#5699ff', iconPath: ICON_PATHS.webhook, fields: ['URL', 'Method'], maxInputs: 0, maxOutputs: 1 },
  fileWatch: { category: 'Triggers', label: 'File Watch', color: '#2ea975', iconPath: ICON_PATHS.fileWatch, fields: ['Path', 'Event'], maxInputs: 0, maxOutputs: 1 },
  gitEvent: { category: 'Triggers', label: 'Git Event', color: '#3a42e9', iconPath: ICON_PATHS.gitEvent, fields: ['Event', 'Branch'], maxInputs: 0, maxOutputs: 1 },
  manualTrigger: { category: 'Triggers', label: 'Manual Trigger', color: '#5699ff', iconPath: ICON_PATHS.manualTrigger, fields: [], maxInputs: 0, maxOutputs: 1 },
  httpRequest: { category: 'Actions', label: 'HTTP Request', color: '#31c4ab', iconPath: ICON_PATHS.httpRequest, fields: ['URL', 'Method', 'Body'], maxInputs: 1, maxOutputs: 1 },
  runScript: { category: 'Actions', label: 'Run Script', color: '#e44d26', iconPath: ICON_PATHS.runScript, fields: ['Command', 'Working Dir'], maxInputs: 1, maxOutputs: 1 },
  sendNotification: { category: 'Actions', label: 'Send Notification', color: '#ff6b4a', iconPath: ICON_PATHS.sendNotification, fields: ['Title', 'Message'], maxInputs: 1, maxOutputs: 1 },
  gitOp: { category: 'Actions', label: 'Git Operation', color: '#3a42e9', iconPath: ICON_PATHS.gitOp, fields: ['Operation', 'Branch', 'Message'], maxInputs: 1, maxOutputs: 1 },
  sendEmail: { category: 'Actions', label: 'Send Email (Gmail)', color: '#ea4b71', iconPath: ICON_PATHS.sendEmail, fields: ['To', 'Subject', 'Body'], maxInputs: 1, maxOutputs: 1 },
  condition: { category: 'Logic', label: 'Condition', color: '#553399', iconPath: ICON_PATHS.condition, fields: ['If', 'Operator', 'Value'], maxInputs: 1, maxOutputs: 2 },
  merge: { category: 'Logic', label: 'Merge', color: '#9b6dd5', iconPath: ICON_PATHS.merge, fields: [], maxInputs: 4, maxOutputs: 1 },
  wait: { category: 'Logic', label: 'Wait / Delay', color: '#ff9922', iconPath: ICON_PATHS.wait, fields: ['Duration', 'Unit'], maxInputs: 1, maxOutputs: 1 },
  note: { category: 'Free Form', label: 'Note', color: '#7d7d87', iconPath: ICON_PATHS.note, fields: ['Text'], maxInputs: 0, maxOutputs: 0, isNote: true },
  freeForm: { category: 'Free Form', label: 'Custom Step', color: '#acacb4', iconPath: ICON_PATHS.freeForm, fields: ['Label', 'Description'], maxInputs: 4, maxOutputs: 4 },
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
