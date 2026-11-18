const FUNCTIONAL = 'Functional Requirements';
const ARCH = 'Architecture Requirements';
const UX = 'User Experience Requirements';
const TESTING = 'Testing Requirements';
const SECURITY = 'Security Requirements';
const ACCESS = 'Accessibility Requirements';

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

    'data-table': {
        replace: {
            'Pagination': {
                level: 'must-have',
                title: 'Pagination is always on',
                description: 'Every list and table is paginated, always, on the frontend and on the backend. No table, list or card list loads all records at once, even when the data is small today, because it will grow. The table shows only the current page and gets its page, page size and totals from the server.',
            },
        },
        add: [
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Previous and Next buttons',
                description: 'Every table has Previous and Next buttons at the bottom, always present and using the shared Button component. Previous is disabled on the first page and Next is disabled on the last page. Show "Page X of Y" and a range such as "Showing 21 to 40 of 135". Provide page numbers for large lists where it helps, but Previous and Next are always there.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Rows-per-page threshold',
                description: 'Provide a rows-per-page selector with a fixed set of allowed sizes (for example 10, 25, 50 and 100) and a default. The allowed sizes, the default and the maximum come from one shared constant and never from literals inside components. The chosen size is sent to the server, and changing it resets the table to page one.',
            },
            {
                group: ARCH,
                level: 'must-have',
                title: 'Backend integration for every list',
                description: 'Every table is backed by a paginated list endpoint that accepts page and size (or a cursor) and returns the rows with the total, total pages and next and previous flags. The table never loads the full dataset and slices it in the browser. If a list endpoint does not exist yet or is not paginated, build or extend it as part of the same change.',
            },
            {
                group: ARCH,
                level: 'standard',
                title: 'Shared limits on both sides',
                description: 'The default page size, the allowed sizes and the maximum page size live in one shared constants module used by both the frontend and the backend. The frontend never offers a size above the backend maximum.',
            },
            {
                group: UX,
                level: 'standard',
                title: 'Stable paging behavior',
                description: 'Keep the previous rows visible with a subtle loading state while the next page loads, keep the controls in place and disable Previous and Next while a request is in flight. When a page becomes empty after deletions, move to the last page that has data. Keep page and size in the query state, mirrored in the URL on the web, and clamp out-of-range pages.',
            },
            {
                group: ACCESS,
                level: 'standard',
                title: 'Accessible paging controls',
                description: 'Use navigation semantics with a label for the pager, label Previous and Next clearly, mark the current page, announce the new page and range through a live region and keep every pager control keyboard operable.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Paging tests',
                description: 'Test the first and last page (Previous and Next disabled), a single page, an empty list, a changed page size, a page emptied by deletion, an out-of-range page in the URL and a size above the maximum being clamped by the server.',
            },
        ],
    },

    'pagination': {
        add: [
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Always paired with a list',
                description: 'Any list, table or card grid that shows server data uses this control. It is never skipped because the data set is small.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Previous and Next always present',
                description: 'The control always shows Previous and Next buttons. Previous is disabled on the first page and Next on the last page. It also shows the current page, the total pages and a range such as "Showing 21 to 40 of 135". Page numbers with ellipsis are optional on top of that.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Rows-per-page threshold',
                description: 'Provide the page size selector with the allowed sizes and the default from one shared constant. The control never offers a size above the backend maximum, and changing the size resets to page one.',
            },
            {
                group: ARCH,
                level: 'must-have',
                title: 'Backend contract',
                description: 'The control works from the list envelope returned by the backend (items, page, size, total, totalPages, hasNext, hasPrev) and never computes totals itself. Page changes always call the server.',
            },
        ],
    },

    'list-endpoint': {
        add: [
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Always paginated',
                description: 'Every list endpoint is paginated, with no exceptions and no unbounded mode. When the caller sends no page parameters, the endpoint applies the default page size.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Page size threshold',
                description: 'Define the default page size, the allowed sizes and the maximum page size in one shared constants module that the frontend also uses. A size above the maximum is clamped to the maximum, a size below one or a page below one is rejected with a 400 error, and the response returns the size that was actually applied.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Pager fields in the envelope',
                description: 'Return items, page, size, total, totalPages, hasNext and hasPrev in the one shared list envelope so the Previous and Next buttons need no calculation on the client. For cursor pagination return nextCursor and prevCursor instead of page numbers.',
            },
            {
                group: SECURITY,
                level: 'standard',
                title: 'Pagination abuse protection',
                description: 'Cap the offset depth, apply the maximum size before running the query and rate-limit list endpoints so large page sizes and deep pages cannot be used to drain the database.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Paging contract tests',
                description: 'Test the default size, a size above the maximum being clamped, an invalid page or size returning 400, the first and last page flags, an empty result and the totals matching the filtered data.',
            },
        ],
    },
};