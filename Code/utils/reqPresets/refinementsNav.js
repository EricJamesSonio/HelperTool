const FUNCTIONAL = 'Functional Requirements';
const ARCH = 'Architecture Requirements';
const UX = 'User Experience Requirements';
const TESTING = 'Testing Requirements';
const ACCESS = 'Accessibility Requirements';

// Edits for navigation presets. Same shape as refinements.js.
module.exports = {
    'sidebar': {
        replace: {
            'Collapse and expand': {
                level: 'must-have',
                title: 'Collapse and expand',
                description: 'Support an icon-only collapsed mode with tooltips that show the page name, toggled by the collapse button in the pinned bottom block. Remember the state per user and keep the pinned block visible in both modes.',
            },
        },
        add: [
            {
                group: ARCH,
                level: 'must-have',
                title: 'Two zones: scrolling pages and pinned footer',
                description: 'The sidebar has exactly two zones. The top zone holds the page links and scrolls on its own (vertical scroll inside the sidebar, never the whole page) when the links exceed the available height. The bottom zone is pinned and never scrolls, shrinks or hides, whatever the number of pages, the window height or the zoom level. Separate the zones with a thin divider.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Pinned footer order',
                description: 'The pinned footer shows, from top to bottom: the profile card (name and role badge, linking to the profile page), the collapse button and the Sign out button as the lowest item. Sign out is always the last element at the bottom edge and uses the danger color token. These three are fixed and are not part of the page configuration.',
            },
            {
                group: UX,
                level: 'must-have',
                title: 'Collapse button',
                description: 'The collapse button is a full-width outlined button with only a panel icon (no text) that flips its direction between collapsed and expanded, labelled for screen readers and shown in a tooltip.',
            },
            {
                group: UX,
                level: 'must-have',
                title: 'Icons without color',
                description: 'Every page icon is a simple outline icon in one single color, taken from the text color token. No colored, filled, gradient or multi-color icons, and no per-page icon colors. The icon follows the text color in every state and every theme. Use one icon set with one stroke width and one size from the design tokens.',
            },
            {
                group: UX,
                level: 'must-have',
                title: 'Item design',
                description: 'Each item is a row with the icon on the left and the label to its right, with comfortable padding and rounded corners. The active page has a soft neutral background token and a bolder label and its icon stays the same single color. Hover uses a lighter version of that background. State is never shown by icon color.',
            },
            {
                group: UX,
                level: 'standard',
                title: 'Profile card',
                description: 'The profile card shows the user name and a small role badge. In collapsed mode it shrinks to the avatar or initials with the name and role in a tooltip. The badge colors come from the label theme tokens.',
            },
            {
                group: FUNCTIONAL,
                level: 'standard',
                title: 'Sign out behavior',
                description: 'Sign out calls the shared logout service, which invalidates the session on the server, clears the cache and the store, and redirects to the login page. Use the confirmation modal when the user has unsaved changes.',
            },
            {
                group: ACCESS,
                level: 'standard',
                title: 'Footer accessibility',
                description: 'Keep the keyboard order pages first, then profile, collapse and Sign out. Give the icon-only collapse button an accessible name and state, and keep the scrolling page list focusable so keyboard users can reach every link.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Pinned layout tests',
                description: 'Test with few and many pages, short windows and 200 percent zoom to confirm that the footer stays visible and the page list scrolls alone. Check the footer order, the collapsed mode, the active item style, that all icons use one color and that Sign out is the lowest item.',
            },
        ],
    },

    'navbar': {
        add: [
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Notification bell lives in the top bar',
                description: 'Notifications are not a page and have no sidebar entry. The navbar shows a single notification bell icon with an unseen-count badge and opens the notification panel from the Notifications preset. Place it before the user area and keep it visible on every screen size.',
            },
        ],
    },
};