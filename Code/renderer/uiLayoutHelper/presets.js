export const PRESETS = [
  {
    name: 'App Shell (sidebar + main)',
    description: 'Standard app layout with header, sidebar, and main content area',
    dsl: {
      type: 'box',
      border: 'rounded',
      label: 'App Shell',
      minWidth: 50,
      children: [
        {
          type: 'box',
          border: 'single',
          label: 'Header',
          minHeight: 3,
          minWidth: 50,
          children: [
            {
              type: 'hsplit',
              ratio: [1, 4, 1],
              children: [
                { type: 'label', text: 'Logo' },
                { type: 'label', text: 'Navigation Bar' },
                { type: 'label', text: 'Profile' }
              ]
            }
          ]
        },
        {
          type: 'hsplit',
          ratio: [1, 4],
          children: [
            {
              type: 'box',
              border: 'single',
              label: 'Sidebar',
              minHeight: 10,
              children: [
                { type: 'label', text: 'Menu Item 1' },
                { type: 'label', text: 'Menu Item 2' },
                { type: 'label', text: 'Menu Item 3' }
              ]
            },
            {
              type: 'box',
              border: 'single',
              label: 'Content Area',
              minHeight: 10
            }
          ]
        },
        {
          type: 'box',
          border: 'single',
          label: 'Status Bar',
          minHeight: 2,
          minWidth: 50
        }
      ]
    }
  },
  {
    name: 'Dashboard Grid',
    description: 'Dashboard-style grid layout with header and card grid',
    dsl: {
      type: 'box',
      border: 'rounded',
      label: 'Dashboard',
      minWidth: 60,
      children: [
        {
          type: 'box',
          border: 'single',
          label: 'Dashboard Header',
          minHeight: 3,
          minWidth: 60
        },
        {
          type: 'hsplit',
          ratio: [1, 1],
          children: [
            {
              type: 'box',
              border: 'single',
              label: 'Chart Widget',
              minHeight: 8
            },
            {
              type: 'box',
              border: 'single',
              label: 'Stats Widget',
              minHeight: 8
            }
          ]
        },
        {
          type: 'hsplit',
          ratio: [1, 1, 1],
          children: [
            { type: 'box', border: 'single', label: 'Card 1', minHeight: 6 },
            { type: 'box', border: 'single', label: 'Card 2', minHeight: 6 },
            { type: 'box', border: 'single', label: 'Card 3', minHeight: 6 }
          ]
        }
      ]
    }
  },
  {
    name: 'Modal Dialog',
    description: 'Centered modal with title, body, and action buttons',
    dsl: {
      type: 'box',
      border: 'double',
      label: 'Confirm Action',
      minWidth: 40,
      minHeight: 10,
      children: [
        { type: 'spacer', height: 1 },
        { type: 'label', text: 'Are you sure you want to proceed?' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: 'This action cannot be undone.' },
        { type: 'spacer', height: 2 },
        {
          type: 'hsplit',
          ratio: [1, 1],
          children: [
            {
              type: 'box',
              border: 'single',
              label: 'Cancel',
              minWidth: 12,
              minHeight: 3
            },
            {
              type: 'box',
              border: 'double',
              label: ' Confirm ',
              minWidth: 12,
              minHeight: 3
            }
          ]
        }
      ]
    }
  },
  {
    name: 'Terminal Layout',
    description: 'Split layout with editor on top and terminal on bottom',
    dsl: {
      type: 'box',
      border: 'rounded',
      label: 'IDE Layout',
      minWidth: 60,
      children: [
        {
          type: 'hsplit',
          ratio: [1, 3],
          children: [
            {
              type: 'box',
              border: 'single',
              label: 'File Explorer',
              minHeight: 12
            },
            {
              type: 'vsplit',
              children: [
                {
                  type: 'box',
                  border: 'single',
                  label: 'Editor',
                  minHeight: 8
                },
                {
                  type: 'box',
                  border: 'single',
                  label: 'Terminal',
                  minHeight: 4
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    name: 'Simple Box',
    description: 'A single bordered box with label',
    dsl: {
      type: 'box',
      border: 'rounded',
      label: 'Hello World',
      minWidth: 30,
      minHeight: 5
    }
  },
  {
    name: 'Settings Panel',
    description: 'Two-column settings panel with sidebar categories',
    dsl: {
      type: 'box',
      border: 'rounded',
      label: 'Settings',
      minWidth: 55,
      children: [
        {
      type: 'hsplit',
      ratio: [1, 3],
      children: [
            {
              type: 'box',
              border: 'single',
              label: 'Categories',
              minHeight: 10,
              children: [
                { type: 'label', text: '▸ General' },
                { type: 'label', text: '  Appearance' },
                { type: 'label', text: '  Shortcuts' },
                { type: 'label', text: '  Plugins' }
              ]
            },
            {
              type: 'box',
              border: 'single',
              label: 'Setting Detail',
              minHeight: 10
            }
          ]
        },
        {
          type: 'hsplit',
          ratio: [1, 1],
          children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '[Save]  [Cancel]' }
          ]
        }
      ]
    }
  }
];

export function getPreset(name) {
  return PRESETS.find(p => p.name === name) || null;
}

export function getPresetNames() {
  return PRESETS.map(p => p.name);
}
