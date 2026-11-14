const FUNCTIONAL = 'Functional Requirements';
const ARCH = 'Architecture Requirements';
const UX = 'User Experience Requirements';
const TESTING = 'Testing Requirements';

// Edits applied on top of existing presets by key.
// replace: swaps the row with that exact title. add: appends new rows.
module.exports = {
    'analytics-charts': {
        add: [
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Required chart set',
                description: 'Every analytics view and dashboard is built from the same four parts: KPI cards, a line or area chart for trends, bar charts and donut charts. Use a donut for every part-to-whole breakdown (category, channel, payment method, status) and a bar chart for every ranking or comparison (top items, by branch, by hour, this period versus the previous one). Never show a breakdown as plain numbers when a donut or bar chart fits.',
            },
            {
                group: FUNCTIONAL,
                level: 'standard',
                title: 'Bar chart variants',
                description: 'Support vertical, horizontal ranked (top N with an Other group), grouped and stacked bars. Start at a zero baseline, show value labels or tooltips, keep a stable sorted order and cap the bar count so labels stay readable.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Hourly display for a daily period',
                description: 'When the selected period is a single day (Daily), every time-based chart (trend line or area, bars, sparkline) uses hourly buckets from 00 to 23 in the business time zone, with hour labels on the axis. Past hours with no data show zero, hours that have not happened yet stay empty for today, and the current hour is highlighted. Weekly and monthly periods use daily buckets and yearly uses monthly buckets. The granularity comes from one function of the period, never chosen per chart.',
            },
            {
                group: ARCH,
                level: 'standard',
                title: 'Backend: granularity from the period',
                description: 'The backend returns buckets matching the period (hourly for a day, daily for a week or month, monthly for a year), fills missing buckets with zeros and uses the same bucket definitions as the KPI totals so the hours add up to the day total. Days with 23 or 25 hours because of daylight saving are handled correctly.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Granularity and total tests',
                description: 'Test that a day gives 24 hourly buckets, a week and a month give daily buckets and a year gives monthly buckets. Cover a partial current day, a daylight saving day and empty data, and check that donut slices add up to 100 percent and to the matching KPI total.',
            },
        ],
    },

    'dashboard-page': {
        replace: {
            'Key info only': {
                title: 'Key widgets: KPI, donut, bar and hourly',
                description: 'Show a compact set of widgets built from the shared analytics components: KPI cards (today totals with comparison to yesterday), an hourly trend chart, at least one donut for a breakdown (for example category or payment method), at least one bar chart (for example ranked items or sales by channel) and a short recent-activity list. Keep it focused, about six widgets at most, and do not crowd the page with every metric.',
            },
        },
        add: [
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Hourly display',
                description: 'Because the dashboard is daily, every time-based chart uses hourly buckets from 00 to 23 in the business time zone. Past hours with no data show zero, hours that have not happened yet stay empty and the current hour is highlighted. Hourly values add up to the daily KPI totals.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Dashboard chart tests',
                description: 'Test the hourly buckets for a partial day, midnight rollover, a daylight saving day and an empty day, and check that donut and bar values reconcile with the KPI cards.',
            },
        ],
    },

    'confirmation-modal': {
        replace: {
            'Required for risky actions': {
                title: 'Dangerous actions need confirmation',
                description: 'Require confirmation for block and unblock, deactivate, delete, bulk delete, reset password, revoke access or sessions, permission or role changes, publishing and any other irreversible change. Keep one list of these action types in constants so new actions are added in one place.',
            },
        },
        add: [
            {
                group: UX,
                level: 'must-have',
                title: 'Centered in the viewport',
                description: 'The confirmation dialog is centered horizontally and vertically in the browser or window viewport, never positioned relative to the button, a parent container, the scrolled content, the sidebar or the app shell. It stays centered when the window is resized, zoomed to 200 percent or scrolled. On small screens use a full width sheet or a centered card with safe-area padding.',
            },
            {
                group: ARCH,
                level: 'must-have',
                title: 'Rendered in a top-level layer',
                description: 'Render the dialog and its backdrop in a portal at the document root with a z-index token above every other layer, so transforms, overflow rules or stacking contexts of parent elements can never offset or clip it. Use one backdrop and lock page scroll while it is open.',
            },
            {
                group: FUNCTIONAL,
                level: 'standard',
                title: 'Wording per action',
                description: 'Name the item and say what happens. Block: who is blocked and what they lose. Delete: whether it is permanent or recoverable. Reset password: that the user is signed out and receives a reset link. The confirm button names the action (Block user, Delete item, Reset password), never just OK.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Placement tests',
                description: 'Test that the dialog is centered at phone, tablet and desktop sizes, with a scrolled page, with the sidebar open and collapsed, and when opened from inside a transformed or clipped parent.',
            },
        ],
    },

    'modal-dialog': {
        add: [
            {
                group: UX,
                level: 'must-have',
                title: 'Centered in the viewport',
                description: 'Every modal opens centered horizontally and vertically in the viewport, independent of the element that opened it, the page scroll position and the app layout. Render it in a top-level layer so parent transforms or overflow never shift it, and keep it centered on resize and zoom.',
            },
        ],
    },
};