export const PRESETS = [
  // ── Navigation Layouts ──
  {
    name: 'Side Navigation',
    description: 'Left sidebar with nav items + main content area',
    dsl: {
      type: 'box', border: 'single', label: 'App', minWidth: 60,
      children: [
        { type: 'hsplit', ratio: [1, 4], children: [
          { type: 'box', border: 'single', label: 'Navigation', minHeight: 15, children: [
            { type: 'label', text: '  🏠 Dashboard' },
            { type: 'label', text: '  📊 Analytics' },
            { type: 'label', text: '  👥 Users' },
            { type: 'label', text: '  📦 Products' },
            { type: 'label', text: '  ⚙️ Settings' },
          ]},
          { type: 'vsplit', children: [
            { type: 'box', border: 'single', label: 'Breadcrumb Home / Page', minHeight: 2 },
            { type: 'box', border: 'single', label: 'Main Content', minHeight: 15 },
          ]}
        ]},
        { type: 'box', border: 'single', label: 'Footer © 2026', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Top Navigation Bar',
    description: 'Horizontal top nav with logo, links, and profile',
    dsl: {
      type: 'box', border: 'single', label: 'Site', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 4, 1], children: [
          { type: 'box', border: 'single', label: '  🏷️ Logo  ', minHeight: 3 },
          { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
            { type: 'label', text: '  Products' },
            { type: 'label', text: '  Solutions' },
            { type: 'label', text: '  Pricing' },
            { type: 'label', text: '  Docs     ' },
          ]},
          { type: 'box', border: 'single', label: '  👤 Profile  ', minHeight: 3 },
        ]},
        { type: 'box', border: 'single', label: 'Page Content', minHeight: 15 },
      ]
    }
  },
  {
    name: 'Holy Grail Layout',
    description: 'Header, footer, left nav, main content, right aside — the classic five-zone layout',
    dsl: {
      type: 'box', border: 'rounded', label: 'Holy Grail', minWidth: 60,
      children: [
        { type: 'box', border: 'single', label: 'Header / Branding', minHeight: 3, minWidth: 60 },
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'box', border: 'single', label: 'Left Nav', minHeight: 15, children: [
            { type: 'label', text: '  Link 1' }, { type: 'label', text: '  Link 2' }, { type: 'label', text: '  Link 3' },
          ]},
          { type: 'box', border: 'single', label: 'Main Content Area', minHeight: 15, children: [
            { type: 'label', text: '  Article title' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Body text goes here...' },
          ]},
          { type: 'box', border: 'single', label: 'Right Aside', minHeight: 15, children: [
            { type: 'label', text: '  Ads' }, { type: 'spacer', height: 1 },
            { type: 'label', text: '  Widget' },
          ]},
        ]},
        { type: 'box', border: 'single', label: 'Footer © 2026', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Tabbed Interface',
    description: 'Horizontal tab bar with content panel below',
    dsl: {
      type: 'box', border: 'rounded', label: 'Tab Panel', minWidth: 45,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  Tab 1  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Tab 2  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Tab 3  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Tab 4  ', minHeight: 2 },
        ]},
        { type: 'box', border: 'single', label: 'Tab Content Panel', minHeight: 8, children: [
          { type: 'label', text: '  This is the active tab content.' },
          { type: 'spacer', height: 1 },
          { type: 'label', text: '  It can contain any components.' },
        ]},
      ]
    }
  },
  {
    name: 'Breadcrumb Trail',
    description: 'Navigation breadcrumbs with content area',
    dsl: {
      type: 'box', border: 'rounded', label: 'Page', minWidth: 45,
      children: [
        { type: 'box', border: 'none', label: 'Home > Products > Details', minHeight: 2 },
        { type: 'box', border: 'single', label: 'Product Detail Page', minHeight: 10 },
      ]
    }
  },

  // ── Hero & Marketing ──
  {
    name: 'Hero Section',
    description: 'Marketing hero with headline, subtitle, and CTA buttons',
    dsl: {
      type: 'box', border: 'rounded', label: 'Hero', minWidth: 50, minHeight: 12,
      children: [
        { type: 'spacer', height: 2 },
        { type: 'label', text: '      Build Faster. Ship Smarter.' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  The all-in-one platform for modern teams.' },
        { type: 'spacer', height: 2 },
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'spacer' },
          { type: 'box', border: 'double', label: '  Get Started Free  ', minHeight: 3, minWidth: 20 },
          { type: 'box', border: 'single', label: '  Learn More  ', minHeight: 3, minWidth: 20 },
        ]},
        { type: 'spacer', height: 1 },
      ]
    }
  },
  {
    name: 'Landing Page',
    description: 'Full marketing page: hero, features, testimonials, CTA',
    dsl: {
      type: 'box', border: 'rounded', label: 'Landing Page', minWidth: 60,
      children: [
        { type: 'box', border: 'single', label: 'Header — Logo | Nav | CTA', minHeight: 3 },
        { type: 'box', border: 'single', label: 'Hero Section', minHeight: 8, children: [
          { type: 'spacer', height: 1 },
          { type: 'label', text: '     The Future of Work' },
          { type: 'label', text: '  Power your team with AI-driven tools.' },
          { type: 'spacer', height: 1 },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: 'Feature 1', minHeight: 6 },
          { type: 'box', border: 'single', label: 'Feature 2', minHeight: 6 },
          { type: 'box', border: 'single', label: 'Feature 3', minHeight: 6 },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: 'Testimonial', minHeight: 5 },
          { type: 'box', border: 'single', label: 'Testimonial', minHeight: 5 },
          { type: 'box', border: 'single', label: 'Testimonial', minHeight: 5 },
        ]},
        { type: 'box', border: 'double', label: '  CTA Banner  ', minHeight: 4 },
        { type: 'box', border: 'single', label: 'Footer', minHeight: 3 },
      ]
    }
  },
  {
    name: 'Feature Grid (3x2)',
    description: 'Six features arranged in a 3-column, 2-row grid',
    dsl: {
      type: 'box', border: 'rounded', label: 'Why Choose Us', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '⚡ Fast Performance', minHeight: 5 },
          { type: 'box', border: 'single', label: '🔒 Secure by Default', minHeight: 5 },
          { type: 'box', border: 'single', label: '☁️ Cloud Native', minHeight: 5 },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '📊 Analytics', minHeight: 5 },
          { type: 'box', border: 'single', label: '🔌 API First', minHeight: 5 },
          { type: 'box', border: 'single', label: '🤖 AI Powered', minHeight: 5 },
        ]},
      ]
    }
  },
  {
    name: 'Testimonials Row',
    description: 'Horizontal row of customer testimonial quote cards',
    dsl: {
      type: 'box', border: 'rounded', label: 'Testimonials', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  ⭐⭐⭐⭐⭐', minHeight: 6, children: [
            { type: 'label', text: '  "Amazing product!"' },
            { type: 'label', text: '  — Jane D.' },
          ]},
          { type: 'box', border: 'single', label: '  ⭐⭐⭐⭐⭐', minHeight: 6, children: [
            { type: 'label', text: '  "Changed our workflow."' },
            { type: 'label', text: '  — John S.' },
          ]},
          { type: 'box', border: 'single', label: '  ⭐⭐⭐⭐', minHeight: 6, children: [
            { type: 'label', text: '  "Great support team."' },
            { type: 'label', text: '  — Alex K.' },
          ]},
        ]},
      ]
    }
  },

  // ── Cards & Grids ──
  {
    name: 'Card Grid (4-column)',
    description: 'Four equal-width cards in a horizontal row',
    dsl: {
      type: 'box', border: 'rounded', label: 'Card Grid', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'box', border: 'single', label: 'Card 1', minHeight: 7, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Content A' },
            { type: 'spacer', height: 1 },
          ]},
          { type: 'box', border: 'single', label: 'Card 2', minHeight: 7, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Content B' },
            { type: 'spacer', height: 1 },
          ]},
          { type: 'box', border: 'single', label: 'Card 3', minHeight: 7, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Content C' },
            { type: 'spacer', height: 1 },
          ]},
          { type: 'box', border: 'single', label: 'Card 4', minHeight: 7, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Content D' },
            { type: 'spacer', height: 1 },
          ]},
        ]},
      ]
    }
  },
  {
    name: 'Media Object',
    description: 'Image thumbnail beside text content, classic media pattern',
    dsl: {
      type: 'box', border: 'rounded', label: 'Media Item', minWidth: 45,
      children: [
        { type: 'hsplit', ratio: [1, 3], children: [
          { type: 'box', border: 'single', label: '  📷 Image  ', minHeight: 8, minWidth: 12 },
          { type: 'box', border: 'none', label: 'Content', minHeight: 8, children: [
            { type: 'label', text: '  Article Title Here' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Description text that wraps' },
            { type: 'label', text: '  around the media object.' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  🔗 Read more →' },
          ]},
        ]},
      ]
    }
  },
  {
    name: 'Pricing Table (3-tier)',
    description: 'Three-column pricing comparison: Basic, Pro, Enterprise',
    dsl: {
      type: 'box', border: 'rounded', label: 'Pricing', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  Basic', minHeight: 10, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  $9/mo' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  1 project' },
            { type: 'label', text: '  5GB storage' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  [Sign Up]' },
          ]},
          { type: 'box', border: 'double', label: '  ★ Pro', minHeight: 10, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  $29/mo' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  10 projects' },
            { type: 'label', text: '  50GB storage' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  [Start Free]' },
          ]},
          { type: 'box', border: 'single', label: '  Enterprise', minHeight: 10, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  $99/mo' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  Unlimited' },
            { type: 'label', text: '  500GB storage' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  [Contact]' },
          ]},
        ]},
      ]
    }
  },
  {
    name: 'Profile Card',
    description: 'User profile card with avatar, name, bio, and stats',
    dsl: {
      type: 'box', border: 'rounded', label: 'Profile', minWidth: 30, minHeight: 12,
      children: [
        { type: 'spacer', height: 1 },
        { type: 'label', text: '        👤' },
        { type: 'label', text: '    John Doe' },
        { type: 'label', text: '  @johndoe' },
        { type: 'spacer', height: 1 },
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'label', text: '  42 posts' },
          { type: 'label', text: '  1.2k followers' },
          { type: 'label', text: '  89 following' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Full-stack developer.' },
        { type: 'label', text: '  Open source enthusiast.' },
      ]
    }
  },
  {
    name: 'Stat Cards Row',
    description: 'Horizontal row of KPI stat cards with icon, value, label',
    dsl: {
      type: 'box', border: 'rounded', label: 'KPIs', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  📈', minHeight: 5, children: [
            { type: 'label', text: '  12,847' },
            { type: 'label', text: '  Users' },
          ]},
          { type: 'box', border: 'single', label: '  💰', minHeight: 5, children: [
            { type: 'label', text: '  $48.2K' },
            { type: 'label', text: '  Revenue' },
          ]},
          { type: 'box', border: 'single', label: '  ⚡', minHeight: 5, children: [
            { type: 'label', text: '  99.9%' },
            { type: 'label', text: '  Uptime' },
          ]},
          { type: 'box', border: 'single', label: '  🎯', minHeight: 5, children: [
            { type: 'label', text: '  87%' },
            { type: 'label', text:  ' Retention' },
          ]},
        ]},
      ]
    }
  },

  // ── Forms & Inputs ──
  {
    name: 'Login Form',
    description: 'Centered login card with email, password, and submit button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Sign In', minWidth: 35, minHeight: 12,
      children: [
        { type: 'spacer', height: 1 },
        { type: 'label', text: '    Welcome back' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  Email address', minHeight: 2 },
        { type: 'box', border: 'single', label: '  Password', minHeight: 2 },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  Sign In →', minHeight: 2 },
        { type: 'spacer', height: 1 },
      ]
    }
  },
  {
    name: 'Signup Form',
    description: 'Registration form with name, email, password, and terms',
    dsl: {
      type: 'box', border: 'rounded', label: 'Create Account', minWidth: 35, minHeight: 14,
      children: [
        { type: 'label', text: '    Join millions of users' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  Full name', minHeight: 2 },
        { type: 'box', border: 'single', label: '  Email address', minHeight: 2 },
        { type: 'box', border: 'single', label: '  Password', minHeight: 2 },
        { type: 'hsplit', ratio: [1, 4], children: [
          { type: 'box', border: 'single', label: '  ☐', minHeight: 2, minWidth: 4 },
          { type: 'label', text: '  I agree to the Terms & Conditions' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  Create Account →', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Contact Form',
    description: 'Contact form with name, email, subject, message, and send button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Contact Us', minWidth: 40, minHeight: 14,
      children: [
        { type: 'label', text: '  Get in touch' },
        { type: 'spacer', height: 1 },
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'box', border: 'single', label: '  Your name', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Your email', minHeight: 2 },
        ]},
        { type: 'box', border: 'single', label: '  Subject', minHeight: 2 },
        { type: 'box', border: 'single', label: '  Message...', minHeight: 4 },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  Send Message →', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Newsletter Signup',
    description: 'Email capture with headline and subscribe button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Newsletter', minWidth: 40, minHeight: 7,
      children: [
        { type: 'label', text: '  Stay in the loop' },
        { type: 'hsplit', ratio: [3, 1], children: [
          { type: 'box', border: 'single', label: '  your@email.com', minHeight: 2 },
          { type: 'box', border: 'double', label: '  Subscribe', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Search Interface',
    description: 'Search bar with filters and results list',
    dsl: {
      type: 'box', border: 'rounded', label: 'Search', minWidth: 45,
      children: [
        { type: 'box', border: 'single', label: '  🔍 Search...', minHeight: 2 },
        { type: 'hsplit', ratio: [1, 4], children: [
          { type: 'box', border: 'single', label: 'Filters', minHeight: 10, children: [
            { type: 'label', text: '  ☐ Category' },
            { type: 'label', text:  '  ☐ Price' },
            { type: 'label', text: '  ☐ Rating' },
          ]},
          { type: 'box', border: 'single', label: 'Results', minHeight: 10, children: [
            { type: 'label', text: '  Result 1 — $29' },
            { type: 'label', text: '  Result 2 — $49' },
            { type: 'label', text: '  Result 3 — $19' },
            { type: 'label', text: '  Result 4 — $99' },
          ]},
        ]},
      ]
    }
  },

  // ── Data & Tables ──
  {
    name: 'Data Table',
    description: 'Table layout with column headers and data rows',
    dsl: {
      type: 'box', border: 'rounded', label: 'Users Table', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  Name', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Email', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Role', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Status', minHeight: 2 },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'label', text: '  Alice' }, { type: 'label', text: '  alice@...' },
          { type: 'label', text: '  Admin' }, { type: 'label', text: '  ✅ Active' },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'label', text: '  Bob' }, { type: 'label', text: '  bob@...' },
          { type: 'label', text: '  Editor' }, { type: 'label', text: '  ✅ Active' },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'label', text: '  Carol' }, { type: 'label', text: '  carol@...' },
          { type: 'label', text: '  Viewer' }, { type: 'label', text: '  ⏸ Pending' },
        ]},
      ]
    }
  },
  {
    name: 'Kanban Board',
    description: 'Three-column kanban: To Do, In Progress, Done',
    dsl: {
      type: 'box', border: 'rounded', label: 'Kanban Board', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  📋 To Do', minHeight: 12, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  ☐ Task 1' },
            { type: 'label', text: '  ☐ Task 2' },
            { type: 'label', text: '  ☐ Task 3' },
          ]},
          { type: 'box', border: 'single', label: '  🔄 In Progress', minHeight: 12, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  ▶ Task 4' },
            { type: 'label', text: '  ▶ Task 5' },
          ]},
          { type: 'box', border: 'single', label: '  ✅ Done', minHeight: 12, children: [
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  ✓ Task 6' },
            { type: 'label', text: '  ✓ Task 7' },
            { type: 'label', text: '  ✓ Task 8' },
          ]},
        ]},
      ]
    }
  },

  // ── Chat & Social ──
  {
    name: 'Chat Interface',
    description: 'Messaging UI with message list and input bar',
    dsl: {
      type: 'box', border: 'rounded', label: 'Chat', minWidth: 40,
      children: [
        { type: 'box', border: 'single', label: '  Chat with Support', minHeight: 2 },
        { type: 'box', border: 'single', label: 'Messages', minHeight: 10, children: [
          { type: 'label', text: '  👤 Hi! How can I help?' },
          { type: 'label', text: '  👤 I need help with billing.' },
          { type: 'label', text: '  🤖 Sure, let me check...' },
          { type: 'label', text: '  🤖 Your invoice is ready.' },
        ]},
        { type: 'hsplit', ratio: [4, 1], children: [
          { type: 'box', border: 'single', label: '  Type a message...', minHeight: 2 },
          { type: 'box', border: 'double', label: '  Send', minHeight: 2 },
        ]},
      ]
    }
  },

  // ── Notifications & Feedback ──
  {
    name: 'Toast Notification',
    description: 'Floating toast/snackbar with message and dismiss button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Notification', minWidth: 35, minHeight: 4,
      children: [
        { type: 'hsplit', ratio: [5, 1], children: [
          { type: 'label', text: '  ✅ File uploaded successfully!' },
          { type: 'label', text: '  ✕' },
        ]},
      ]
    }
  },
  {
    name: 'Alert Banner',
    description: 'Full-width alert bar with icon, message, and action',
    dsl: {
      type: 'box', border: 'single', label: '  ⚠️', minWidth: 50, minHeight: 3,
      children: [
        { type: 'hsplit', ratio: [4, 1], children: [
          { type: 'label', text: '  Your trial ends in 3 days.' },
          { type: 'label', text: '  Upgrade →' },
        ]},
      ]
    }
  },
  {
    name: 'Empty State',
    description: 'Empty state placeholder with icon, title, and action button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Empty State', minWidth: 35, minHeight: 10,
      children: [
        { type: 'spacer', height: 2 },
        { type: 'label', text: '        📂' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  No projects yet' },
        { type: 'label', text: '  Create your first project' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  + New Project  ', minHeight: 2, minWidth: 18 },
        { type: 'spacer', height: 2 },
      ]
    }
  },
  {
    name: 'Error Page (404)',
    description: 'Fun 404 error page with illustration and link home',
    dsl: {
      type: 'box', border: 'rounded', label: 'Oops!', minWidth: 40, minHeight: 12,
      children: [
        { type: 'spacer', height: 2 },
        { type: 'label', text: '        404' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Page not found' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  The page you\'re looking for' },
        { type: 'label', text: '  doesn\'t exist or was moved.' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  ← Back to Home', minHeight: 2, minWidth: 20 },
        { type: 'spacer', height: 2 },
      ]
    }
  },

  // ── Dashboard & Analytics ──
  {
    name: 'Analytics Dashboard',
    description: 'Analytics view with chart area, stats bar, and data table',
    dsl: {
      type: 'box', border: 'rounded', label: 'Analytics', minWidth: 60,
      children: [
        { type: 'box', border: 'single', label: '  📊 Overview', minHeight: 2 },
        { type: 'hsplit', ratio: [1, 4], children: [
          { type: 'box', border: 'single', label: 'Date Range', minHeight: 8, children: [
            { type: 'label', text: '  📅 Last 7 days' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  📅 Last 30 days' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '  📅 Custom' },
          ]},
          { type: 'box', border: 'single', label: 'Chart Area', minHeight: 8, children: [
            { type: 'spacer', height: 3 },
            { type: 'label', text: '    ▁▃▄▆▇▆▅▃▁▂▃▅▇█▇▆▄▃▁' },
            { type: 'spacer', height: 1 },
            { type: 'label', text: '    ████████████████████' },
          ]},
        ]},
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'label', text: '  Views 12.4K' },
          { type: 'label', text: '  Visits 8.2K' },
          { type: 'label', text: '  Bounce 32%' },
          { type: 'label', text: '  Avg. 4m12s' },
        ]},
      ]
    }
  },

  // ── Documentation ──
  {
    name: 'Blog Post',
    description: 'Article layout with title, meta, and content body',
    dsl: {
      type: 'box', border: 'rounded', label: 'Blog', minWidth: 45,
      children: [
        { type: 'box', border: 'none', label: 'Title', children: [
          { type: 'label', text: '  How to Build Great UIs' },
          { type: 'label', text: '  By Jane · 5 min read · Jun 2026' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  📷 Featured Image', minHeight: 5 },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'none', label: 'Content', children: [
          { type: 'label', text: '  This is the article body.' },
          { type: 'label', text: '  It contains paragraphs of' },
          { type: 'label', text: '  text explaining the topic.' },
          { type: 'spacer', height: 1 },
          { type: 'label', text: '  ## Key takeaways' },
          { type: 'label', text: '  • Tip one' },
          { type: 'label', text: '  • Tip two' },
        ]},
      ]
    }
  },
  {
    name: 'FAQ Accordion',
    description: 'Stacked FAQ items with question and expandable answer',
    dsl: {
      type: 'box', border: 'rounded', label: 'FAQs', minWidth: 45,
      children: [
        { type: 'box', border: 'single', label: '  ▼ What is this?', minHeight: 2, children: [
          { type: 'label', text: '  This is a great tool!' },
        ]},
        { type: 'box', border: 'single', label: '  ▶ How do I start?', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ▶ Is it free?', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ▶ Can I upgrade?', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Timeline',
    description: 'Vertical timeline with date and event entries',
    dsl: {
      type: 'box', border: 'rounded', label: 'Timeline', minWidth: 40,
      children: [
        { type: 'label', text: '  ● Jun 2026  — v3.0 Released' },
        { type: 'label', text: '  │' },
        { type: 'label', text: '  ● Mar 2026  — v2.5 Beta' },
        { type: 'label', text: '  │' },
        { type: 'label', text: '  ● Dec 2025  — v2.0 Launch' },
        { type: 'label', text: '  │' },
        { type: 'label', text: '  ● Aug 2025  — v1.0 MVP' },
      ]
    }
  },

  // ── Misc / Utility ──
  {
    name: 'Footer (4-column)',
    description: 'Multi-column footer with links, social, and copyright',
    dsl: {
      type: 'box', border: 'single', label: 'Footer', minWidth: 55, minHeight: 8,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'box', border: 'none', label: 'Company', children: [
            { type: 'label', text: '  About' }, { type: 'label', text: '  Blog' },
            { type: 'label', text: '  Careers' }, { type: 'label', text: '  Press' },
          ]},
          { type: 'box', border: 'none', label: 'Product', children: [
            { type: 'label', text: '  Features' }, { type: 'label', text: '  Pricing' },
            { type: 'label', text: '  Integrations' }, { type: 'label', text: '  API' },
          ]},
          { type: 'box', border: 'none', label: 'Support', children: [
            { type: 'label', text: '  Docs' }, { type: 'label', text: '  Tutorials' },
            { type: 'label', text: '  Status' }, { type: 'label', text: '  Contact' },
          ]},
          { type: 'box', border: 'none', label: 'Social', children: [
            { type: 'label', text: '  𝕏 Twitter' }, { type: 'label', text: '  GitHub' },
            { type: 'label', text: '  Discord' }, { type: 'label', text: '  LinkedIn' },
          ]},
        ]},
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  © 2026 Company Inc. All rights reserved.' },
      ]
    }
  },
  {
    name: 'Wizard / Stepper',
    description: 'Multi-step form with step indicators and navigation',
    dsl: {
      type: 'box', border: 'rounded', label: 'Setup Wizard', minWidth: 45, minHeight: 14,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'double', label: '  1. Account  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  2. Profile  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  3. Confirm  ', minHeight: 2 },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Step 1: Create your account' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  Username', minHeight: 2 },
        { type: 'box', border: 'single', label: '  Email', minHeight: 2 },
        { type: 'box', border: 'single', label: '  Password', minHeight: 2 },
        { type: 'spacer', height: 1 },
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'box', border: 'single', label: '  ← Back', minHeight: 2 },
          { type: 'box', border: 'double', label: '  Next →', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Split View (50/50)',
    description: 'Two equal panes side by side, great for before/after comparisons',
    dsl: {
      type: 'box', border: 'single', label: 'Split View', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'box', border: 'single', label: 'Before', minHeight: 12, children: [
            { type: 'label', text: '    Old version' },
            { type: 'label', text: '    with limited' },
            { type: 'label', text: '    features and' },
            { type: 'label', text: '    basic layout.' },
          ]},
          { type: 'box', border: 'single', label: 'After', minHeight: 12, children: [
            { type: 'label', text: '    New version' },
            { type: 'label', text: '    with modern' },
            { type: 'label', text: '    features and' },
            { type: 'label', text: '    rich layout.' },
          ]},
        ]},
      ]
    }
  },
  {
    name: 'Invoice / Receipt',
    description: 'Simple invoice layout with items and totals',
    dsl: {
      type: 'box', border: 'double', label: 'INVOICE #1024', minWidth: 45, minHeight: 14,
      children: [
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'label', text: '  From: Company Inc.' },
          { type: 'label', text: '  Date: Jul 08, 2026' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'hsplit', ratio: [2, 1, 1], children: [
          { type: 'box', border: 'single', label: '  Item', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Qty', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Price', minHeight: 2 },
        ]},
        { type: 'hsplit', ratio: [2, 1, 1], children: [
          { type: 'label', text: '  Pro Plan' }, { type: 'label', text: '  1' }, { type: 'label', text: '  $29' },
        ]},
        { type: 'hsplit', ratio: [2, 1, 1], children: [
          { type: 'label', text: '  Add-on: Storage' }, { type: 'label', text: '  2' }, { type: 'label', text: '  $10' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Total: $39.00' },
      ]
    }
  },
  {
    name: 'Toolbar + Content',
    description: 'Top toolbar with actions and main content area below',
    dsl: {
      type: 'box', border: 'rounded', label: 'Workspace', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [4, 1, 1, 1], children: [
          { type: 'label', text: '  📄 Document title' },
          { type: 'box', border: 'single', label: '  Edit  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  View  ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Share ', minHeight: 2 },
        ]},
        { type: 'box', border: 'single', label: 'Content Area', minHeight: 12, children: [
          { type: 'spacer', height: 2 },
          { type: 'label', text: '  Start typing here...' },
        ]},
      ]
    }
  },
  {
    name: 'Two-Column Layout',
    description: 'Simple left sidebar + right content split',
    dsl: {
      type: 'box', border: 'single', label: 'Layout', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 3], children: [
          { type: 'box', border: 'single', label: 'Sidebar', minHeight: 12 },
          { type: 'box', border: 'single', label: 'Main Content', minHeight: 12 },
        ]},
      ]
    }
  },
  {
    name: 'Three-Column Layout',
    description: 'Left sidebar + main content + right aside',
    dsl: {
      type: 'box', border: 'single', label: '3-Column', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'box', border: 'single', label: 'Left', minHeight: 12 },
          { type: 'box', border: 'single', label: 'Main Content', minHeight: 12 },
          { type: 'box', border: 'single', label: 'Right', minHeight: 12 },
        ]},
      ]
    }
  },
  {
    name: 'Team Grid (3x2)',
    description: 'Team member cards: 2 rows of 3 with name and role',
    dsl: {
      type: 'box', border: 'rounded', label: 'Our Team', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  👤 Alice', minHeight: 5, children: [
            { type: 'label', text: '  CEO' },
          ]},
          { type: 'box', border: 'single', label: '  👤 Bob', minHeight: 5, children: [
            { type: 'label', text: '  CTO' },
          ]},
          { type: 'box', border: 'single', label: '  👤 Carol', minHeight: 5, children: [
            { type: 'label', text: '  Design' },
          ]},
        ]},
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  👤 Dave', minHeight: 5, children: [
            { type: 'label', text: '  Dev' },
          ]},
          { type: 'box', border: 'single', label: '  👤 Eve', minHeight: 5, children: [
            { type: 'label', text: '  DevOps' },
          ]},
          { type: 'box', border: 'single', label: '  👤 Frank', minHeight: 5, children: [
            { type: 'label', text: '  PM' },
          ]},
        ]},
      ]
    }
  },

  // ── Retain the original 6 presets ──
  {
    name: 'App Shell (sidebar + main)',
    description: 'Standard app layout with header, sidebar, and main content area',
    dsl: {
      type: 'box', border: 'rounded', label: 'App Shell', minWidth: 50,
      children: [
        { type: 'box', border: 'single', label: 'Header', minHeight: 3, minWidth: 50, children: [
          { type: 'hsplit', ratio: [1, 4, 1], children: [
            { type: 'label', text: 'Logo' },
            { type: 'label', text: 'Navigation Bar' },
            { type: 'label', text: 'Profile' }
          ]}
        ]},
        { type: 'hsplit', ratio: [1, 4], children: [
          { type: 'box', border: 'single', label: 'Sidebar', minHeight: 10, children: [
            { type: 'label', text: 'Menu Item 1' },
            { type: 'label', text: 'Menu Item 2' },
            { type: 'label', text: 'Menu Item 3' }
          ]},
          { type: 'box', border: 'single', label: 'Content Area', minHeight: 10 }
        ]},
        { type: 'box', border: 'single', label: 'Status Bar', minHeight: 2, minWidth: 50 }
      ]
    }
  },
  {
    name: 'Dashboard Grid',
    description: 'Dashboard-style grid layout with header and card grid',
    dsl: {
      type: 'box', border: 'rounded', label: 'Dashboard', minWidth: 60,
      children: [
        { type: 'box', border: 'single', label: 'Dashboard Header', minHeight: 3, minWidth: 60 },
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'box', border: 'single', label: 'Chart Widget', minHeight: 8 },
          { type: 'box', border: 'single', label: 'Stats Widget', minHeight: 8 }
        ]},
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: 'Card 1', minHeight: 6 },
          { type: 'box', border: 'single', label: 'Card 2', minHeight: 6 },
          { type: 'box', border: 'single', label: 'Card 3', minHeight: 6 }
        ]}
      ]
    }
  },
  {
    name: 'Modal Dialog',
    description: 'Centered modal with title, body, and action buttons',
    dsl: {
      type: 'box', border: 'double', label: 'Confirm Action', minWidth: 40, minHeight: 10,
      children: [
        { type: 'spacer', height: 1 },
        { type: 'label', text: 'Are you sure you want to proceed?' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: 'This action cannot be undone.' },
        { type: 'spacer', height: 2 },
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'box', border: 'single', label: 'Cancel', minWidth: 12, minHeight: 3 },
          { type: 'box', border: 'double', label: ' Confirm ', minWidth: 12, minHeight: 3 }
        ]}
      ]
    }
  },
  {
    name: 'Terminal Layout',
    description: 'Split layout with editor on top and terminal on bottom',
    dsl: {
      type: 'box', border: 'rounded', label: 'IDE Layout', minWidth: 60,
      children: [
        { type: 'hsplit', ratio: [1, 3], children: [
          { type: 'box', border: 'single', label: 'File Explorer', minHeight: 12 },
          { type: 'vsplit', children: [
            { type: 'box', border: 'single', label: 'Editor', minHeight: 8 },
            { type: 'box', border: 'single', label: 'Terminal', minHeight: 4 }
          ]}
        ]}
      ]
    }
  },
  {
    name: 'Simple Box',
    description: 'A single bordered box with label',
    dsl: {
      type: 'box', border: 'rounded', label: 'Hello World', minWidth: 30, minHeight: 5
    }
  },
  {
    name: 'Settings Panel',
    description: 'Two-column settings panel with sidebar categories',
    dsl: {
      type: 'box', border: 'rounded', label: 'Settings', minWidth: 55,
      children: [
        { type: 'hsplit', ratio: [1, 3], children: [
          { type: 'box', border: 'single', label: 'Categories', minHeight: 10, children: [
            { type: 'label', text: '▸ General' },
            { type: 'label', text: '  Appearance' },
            { type: 'label', text: '  Shortcuts' },
            { type: 'label', text: '  Plugins' }
          ]},
          { type: 'box', border: 'single', label: 'Setting Detail', minHeight: 10 }
        ]},
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'spacer', height: 1 },
          { type: 'label', text: '[Save]  [Cancel]' }
        ]}
      ]
    }
  },
  // ── More UI Patterns ──
  {
    name: 'Cookie Consent Banner',
    description: 'Floating bottom banner with GDPR cookie consent message and buttons',
    dsl: {
      type: 'box', border: 'rounded', label: 'Cookie Consent', minWidth: 50, minHeight: 5,
      children: [
        { type: 'hsplit', ratio: [3, 1, 1], children: [
          { type: 'label', text: '  🍪 This site uses cookies to improve your experience.' },
          { type: 'box', border: 'single', label: '  Settings', minHeight: 2 },
          { type: 'box', border: 'double', label: '  Accept All', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Dropdown Menu',
    description: 'Clickable dropdown with a list of menu options',
    dsl: {
      type: 'box', border: 'rounded', label: 'Dropdown', minWidth: 18, minHeight: 10,
      children: [
        { type: 'box', border: 'single', label: '  ☰ Menu ▾', minHeight: 2 },
        { type: 'box', border: 'single', label: 'User Menu', minHeight: 8, children: [
          { type: 'label', text: '  👤 Profile' },
          { type: 'label', text: '  ⚙️ Settings' },
          { type: 'label', text: '  📁 Files' },
          { type: 'spacer', height: 1 },
          { type: 'label', text: '  🚪 Logout' },
        ]},
      ]
    }
  },
  {
    name: 'Pagination',
    description: 'Page navigation with numbers and prev/next buttons',
    dsl: {
      type: 'box', border: 'rounded', label: 'Pagination', minWidth: 40, minHeight: 4,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1, 1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  ←', minHeight: 2 },
          { type: 'box', border: 'single', label: '  1 ', minHeight: 2 },
          { type: 'box', border: 'double', label: '  2 ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  3 ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  … ', minHeight: 2 },
          { type: 'box', border: 'single', label: '  10', minHeight: 2 },
          { type: 'box', border: 'single', label: '  →', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Tag Cloud',
    description: 'Horizontal list of badges/tags with varying sizes',
    dsl: {
      type: 'box', border: 'rounded', label: 'Tags', minWidth: 40, minHeight: 5,
      children: [
        { type: 'label', text: '  [React]  [TypeScript]  [Node.js]  [CSS]  [Python]' },
        { type: 'label', text: '  [Go]  [Rust]  [GraphQL]  [Docker]  [K8s]  [AWS]' },
        { type: 'label', text: '  [Postgres]  [Redis]  [Mongo]  [Next.js]  [Vue]' },
      ]
    }
  },
  {
    name: 'Command Palette',
    description: 'Spotlight-style search overlay with commands list',
    dsl: {
      type: 'box', border: 'rounded', label: 'Command Palette', minWidth: 40, minHeight: 12,
      children: [
        { type: 'box', border: 'single', label: '  🔍 Type a command...', minHeight: 2 },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  > Open Settings' },
        { type: 'label', text: '  > Create New File' },
        { type: 'label', text: '  > Run Build' },
        { type: 'label', text: '  > Deploy to Production' },
        { type: 'label', text: '  > Search Documentation' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  ↑↓ navigate  ↵ select  esc close' },
      ]
    }
  },
  {
    name: 'File Upload Dropzone',
    description: 'Drag-and-drop file upload area with icon and browse button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Upload Files', minWidth: 40, minHeight: 10,
      children: [
        { type: 'spacer', height: 2 },
        { type: 'label', text: '       📁 Drag & drop files here' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '    or' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  Browse Files  ', minHeight: 2, minWidth: 18 },
        { type: 'spacer', height: 2 },
      ]
    }
  },
  {
    name: 'Comments Section',
    description: 'Threaded comments with avatar, name, text, and reply input',
    dsl: {
      type: 'box', border: 'rounded', label: 'Comments (12)', minWidth: 45,
      children: [
        { type: 'box', border: 'single', label: '  👤 Jane — 2h ago', minHeight: 3, children: [
          { type: 'label', text: '  Great article! Very helpful.' },
        ]},
        { type: 'box', border: 'single', label: '  👤 John — 1h ago', minHeight: 3, children: [
          { type: 'label', text: '  I agree. Thanks for sharing!' },
        ]},
        { type: 'box', border: 'single', label: '  👤 Sam — 30m ago', minHeight: 3, children: [
          { type: 'label', text: '  Could you add more examples?' },
        ]},
        { type: 'hsplit', ratio: [4, 1], children: [
          { type: 'box', border: 'single', label: '  Add a comment...', minHeight: 2 },
          { type: 'box', border: 'double', label: '  Post', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Activity Feed',
    description: 'Vertical feed of recent activity events with timestamps',
    dsl: {
      type: 'box', border: 'rounded', label: 'Recent Activity', minWidth: 40,
      children: [
        { type: 'box', border: 'single', label: '  🔔 Today', minHeight: 2 },
        { type: 'label', text: '   10:30 — Jane pushed to main' },
        { type: 'label', text: '   09:15 — Deploy #42 succeeded' },
        { type: 'label', text: '   08:00 — Bob created issue #89' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  🔔 Yesterday', minHeight: 2 },
        { type: 'label', text: '   16:45 — PR #128 merged' },
        { type: 'label', text: '   14:20 — New release v3.1' },
      ]
    }
  },
  {
    name: 'Product Card',
    description: 'E-commerce product card with image, title, price, and add to cart',
    dsl: {
      type: 'box', border: 'rounded', label: 'Product', minWidth: 25, minHeight: 12,
      children: [
        { type: 'box', border: 'single', label: '  📷 Product Image', minHeight: 5 },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Wireless Headphones' },
        { type: 'label', text: '  ★★★★☆ (128 reviews)' },
        { type: 'label', text: '  $79.99' },
        { type: 'box', border: 'double', label: '  Add to Cart +', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Shopping Cart',
    description: 'Cart summary with item list, quantities, and checkout button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Shopping Cart', minWidth: 45,
      children: [
        { type: 'hsplit', ratio: [3, 1, 1], children: [
          { type: 'box', border: 'single', label: '  Headphones', minHeight: 3, children: [
            { type: 'label', text: '  $79.99 × 1' },
          ]},
          { type: 'label', text: '  +' },
          { type: 'label', text: '  -' },
        ]},
        { type: 'hsplit', ratio: [3, 1, 1], children: [
          { type: 'box', border: 'single', label: '  USB Cable', minHeight: 3, children: [
            { type: 'label', text: '  $12.99 × 2' },
          ]},
          { type: 'label', text: '  +' },
          { type: 'label', text: '  -' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Subtotal: $105.97' },
        { type: 'label', text: '  Shipping: Free' },
        { type: 'label', text: '  Total: $105.97' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  Proceed to Checkout →', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Checkout Flow',
    description: 'Checkout with billing, shipping, payment sections',
    dsl: {
      type: 'box', border: 'rounded', label: 'Checkout', minWidth: 45, minHeight: 18,
      children: [
        { type: 'box', border: 'single', label: '  📍 Shipping Address', minHeight: 3, children: [
          { type: 'label', text: '  123 Main St, City, State' },
        ]},
        { type: 'box', border: 'single', label: '  💳 Payment', minHeight: 3, children: [
          { type: 'label', text: '  •••• 4242' },
        ]},
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'box', border: 'single', label: '  Order Summary', minHeight: 5 },
          { type: 'box', border: 'double', label: '  Place Order — 💰', minHeight: 5 },
        ]},
      ]
    }
  },
  {
    name: 'Calendar Widget',
    description: 'Mini calendar with month header and day grid',
    dsl: {
      type: 'box', border: 'rounded', label: 'Calendar', minWidth: 28, minHeight: 12,
      children: [
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'label', text: '  ◀' },
          { type: 'label', text: '  July 2026' },
          { type: 'label', text: '  ▶' },
        ]},
        { type: 'hsplit', ratio: [1,1,1,1,1,1,1], children: [
          { type: 'label', text: ' Mo' }, { type: 'label', text: ' Tu' },
          { type: 'label', text: ' We' }, { type: 'label', text: ' Th' },
          { type: 'label', text: ' Fr' }, { type: 'label', text: ' Sa' },
          { type: 'label', text: ' Su' },
        ]},
        { type: 'hsplit', ratio: [1,1,1,1,1,1,1], children: [
          { type: 'label', text: '  1' }, { type: 'label', text: '  2' },
          { type: 'label', text: '  3' }, { type: 'label', text: '  4' },
          { type: 'label', text: '  5' }, { type: 'label', text: '  6' },
          { type: 'label', text: '  7' },
        ]},
        { type: 'hsplit', ratio: [1,1,1,1,1,1,1], children: [
          { type: 'label', text: '  8' }, { type: 'label', text: '  9' },
          { type: 'label', text: ' 10' }, { type: 'label', text: ' 11' },
          { type: 'label', text: ' 12' }, { type: 'label', text: ' 13' },
          { type: 'label', text: ' 14' },
        ]},
        { type: 'hsplit', ratio: [1,1,1,1,1,1,1], children: [
          { type: 'label', text: ' 15' }, { type: 'label', text: ' 16' },
          { type: 'label', text: ' 17' }, { type: 'label', text: ' 18' },
          { type: 'label', text: ' 19' }, { type: 'label', text: ' 20' },
          { type: 'box', border: 'double', label: ' 21', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Image Gallery',
    description: 'Photo grid with thumbnails in a 3-column layout',
    dsl: {
      type: 'box', border: 'rounded', label: 'Gallery', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  📷 Photo 1', minHeight: 6 },
          { type: 'box', border: 'single', label: '  📷 Photo 2', minHeight: 6 },
          { type: 'box', border: 'single', label: '  📷 Photo 3', minHeight: 6 },
        ]},
        { type: 'hsplit', ratio: [1, 1, 1], children: [
          { type: 'box', border: 'single', label: '  📷 Photo 4', minHeight: 6 },
          { type: 'box', border: 'single', label: '  📷 Photo 5', minHeight: 6 },
          { type: 'box', border: 'single', label: '  📷 Photo 6', minHeight: 6 },
        ]},
      ]
    }
  },
  {
    name: 'Video Player',
    description: 'Video player with controls: play, progress, volume, fullscreen',
    dsl: {
      type: 'box', border: 'rounded', label: 'Video Player', minWidth: 50, minHeight: 12,
      children: [
        { type: 'box', border: 'single', label: '  ▶️ Video Player Area', minHeight: 6 },
        { type: 'hsplit', ratio: [1, 6, 1, 1], children: [
          { type: 'label', text: '  ⏪' },
          { type: 'box', border: 'single', label: '  ████████░░░░ 1:23 / 3:45', minHeight: 2 },
          { type: 'label', text: '  🔊' },
          { type: 'label', text: '  ⛶' },
        ]},
      ]
    }
  },
  {
    name: 'Progress Steps',
    description: 'Horizontal step indicator showing completion progress',
    dsl: {
      type: 'box', border: 'rounded', label: 'Progress', minWidth: 45, minHeight: 4,
      children: [
        { type: 'hsplit', ratio: [1, 1, 1, 1], children: [
          { type: 'label', text: '  ● Done' },
          { type: 'label', text: '  ● Done' },
          { type: 'label', text: '  ○ Current' },
          { type: 'label', text: '  ○ Next' },
        ]},
        { type: 'label', text: '  ████████░░░░░░░░░░ 40%' },
      ]
    }
  },
  {
    name: 'Notification Center',
    description: 'Notification panel with grouped notifications and mark-read',
    dsl: {
      type: 'box', border: 'rounded', label: 'Notifications', minWidth: 35, minHeight: 14,
      children: [
        { type: 'hsplit', ratio: [3, 1], children: [
          { type: 'label', text: '  🔔 Notifications' },
          { type: 'label', text: '  Mark all read' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  ● New comment on your post', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ● John followed you', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ○ PR #42 needs review', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ○ Build #128 passed', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Inbox / Mail List',
    description: 'Email inbox with sender, subject, and date columns',
    dsl: {
      type: 'box', border: 'rounded', label: 'Inbox', minWidth: 50,
      children: [
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'box', border: 'single', label: '  From', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Subject', minHeight: 2 },
          { type: 'box', border: 'single', label: '  Date', minHeight: 2 },
        ]},
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'label', text: '  Alice' }, { type: 'label', text: '  Meeting tomorrow' }, { type: 'label', text: '  Just now' },
        ]},
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'label', text: '  Bob' }, { type: 'label', text: '  Invoice attached' }, { type: 'label', text: '  1h ago' },
        ]},
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'label', text: '  Carol' }, { type: 'label', text:  '  PR approved 🎉' }, { type: 'label', text: '  3h ago' },
        ]},
        { type: 'hsplit', ratio: [1, 3, 1], children: [
          { type: 'label', text: '  Dave' }, { type: 'label', text: '  Welcome to the team' }, { type: 'label', text: '  Yesterday' },
        ]},
      ]
    }
  },
  {
    name: 'Loading Skeleton',
    description: 'Placeholder skeleton screen with shimmer bars',
    dsl: {
      type: 'box', border: 'rounded', label: 'Loading...', minWidth: 40, minHeight: 12,
      children: [
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  ████████████░░░░░░', minHeight: 2 },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  ████████░░░░░░░░░░', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ████████████░░░░░░', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ████░░░░░░░░░░░░░░', minHeight: 2 },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Loading... please wait' },
      ]
    }
  },
  {
    name: 'Floating Action Button',
    description: 'FAB with speed-dial actions for mobile patterns',
    dsl: {
      type: 'box', border: 'rounded', label: 'FAB', minWidth: 16, minHeight: 16,
      children: [
        { type: 'spacer', height: 6 },
        { type: 'label', text: '       ✏️' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '       📎' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '    ＋', minHeight: 3, minWidth: 6 },
        { type: 'spacer', height: 2 },
      ]
    }
  },
  {
    name: 'Drawer / Off-canvas',
    description: 'Slide-in drawer overlay with navigation links',
    dsl: {
      type: 'box', border: 'rounded', label: 'Drawer', minWidth: 24, minHeight: 18,
      children: [
        { type: 'hsplit', ratio: [4, 1], children: [
          { type: 'label', text: '  Menu' },
          { type: 'label', text: '  ✕' },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  🏠 Dashboard' },
        { type: 'label', text: '  📊 Analytics' },
        { type: 'label', text: '  📁 Projects' },
        { type: 'label', text: '  👥 Team' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  ⚙️ Settings' },
        { type: 'label', text: '  🚪 Logout' },
      ]
    }
  },
  {
    name: 'Bottom Sheet',
    description: 'Mobile bottom sheet with handle, title, and action list',
    dsl: {
      type: 'box', border: 'rounded', label: 'Sheet', minWidth: 35, minHeight: 12,
      children: [
        { type: 'label', text: '       ───' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Share this content' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  📱 Share to Twitter', minHeight: 2 },
        { type: 'box', border: 'single', label: '  ✉️ Share via Email', minHeight: 2 },
        { type: 'box', border: 'single', label: '  🔗 Copy Link', minHeight: 2 },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  Cancel', minHeight: 2 },
      ]
    }
  },
  {
    name: 'OTP Verification',
    description: 'One-time password input with 6 digit boxes and verify button',
    dsl: {
      type: 'box', border: 'rounded', label: 'Verify OTP', minWidth: 35, minHeight: 10,
      children: [
        { type: 'label', text: '  Enter the code sent to' },
        { type: 'label', text: '  your email ***@gmail.com' },
        { type: 'spacer', height: 1 },
        { type: 'hsplit', ratio: [1,1,1,1,1,1], children: [
          { type: 'box', border: 'single', label: '  _', minHeight: 2 },
          { type: 'box', border: 'single', label: '  _', minHeight: 2 },
          { type: 'box', border: 'single', label: '  _', minHeight: 2 },
          { type: 'box', border: 'single', label: '  _', minHeight: 2 },
          { type: 'box', border: 'single', label: '  _', minHeight: 2 },
          { type: 'box', border: 'single', label: '  _', minHeight: 2 },
        ]},
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'double', label: '  Verify →', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Review / Rating Card',
    description: 'User review card with star rating, text, and helpful votes',
    dsl: {
      type: 'box', border: 'rounded', label: 'Reviews', minWidth: 40,
      children: [
        { type: 'box', border: 'single', label: '  ⭐⭐⭐⭐⭐', minHeight: 4, children: [
          { type: 'label', text: '  "Amazing quality! Highly recommend."' },
          { type: 'label', text: '  — Sarah M. · Verified Purchase' },
          { type: 'label', text: '  👍 24 helpful' },
        ]},
        { type: 'box', border: 'single', label: '  ⭐⭐⭐⭐', minHeight: 4, children: [
          { type: 'label', text: '  "Good value for the price."' },
          { type: 'label', text: '  — Tom K. · Verified Purchase' },
          { type: 'label', text: '  👍 12 helpful' },
        ]},
      ]
    }
  },
  {
    name: 'Order Summary',
    description: 'Compact order summary with items, discounts, and totals',
    dsl: {
      type: 'box', border: 'rounded', label: 'Order Summary', minWidth: 35, minHeight: 12,
      children: [
        { type: 'label', text: '  Item 1 ................ $29.99' },
        { type: 'label', text: '  Item 2 ................ $49.99' },
        { type: 'spacer', height: 1 },
        { type: 'label', text: '  Subtotal .............. $79.98' },
        { type: 'label', text: '  Discount .............. -$10.00' },
        { type: 'spacer', height: 1 },
        { type: 'box', border: 'single', label: '  Total: $69.98', minHeight: 2 },
      ]
    }
  },
  {
    name: 'Color Theme Switcher',
    description: 'Color palette theme selection cards',
    dsl: {
      type: 'box', border: 'rounded', label: 'Theme', minWidth: 35, minHeight: 8,
      children: [
        { type: 'hsplit', ratio: [1,1,1,1], children: [
          { type: 'box', border: 'double', label: '  🌙 Dark', minHeight: 3 },
          { type: 'box', border: 'single', label: '  ☀️ Light', minHeight: 3 },
          { type: 'box', border: 'single', label: '  🌿 Forest', minHeight: 3 },
          { type: 'box', border: 'single', label: '  🌊 Ocean', minHeight: 3 },
        ]},
      ]
    }
  },
  {
    name: 'Toggle / Switch Preferences',
    description: 'Settings list with toggle switches for each option',
    dsl: {
      type: 'box', border: 'rounded', label: 'Preferences', minWidth: 40,
      children: [
        { type: 'hsplit', ratio: [3, 1], children: [
          { type: 'label', text: '  Enable notifications' },
          { type: 'box', border: 'double', label: '  ON ', minHeight: 2 },
        ]},
        { type: 'hsplit', ratio: [3, 1], children: [
          { type: 'label', text: '  Dark mode' },
          { type: 'box', border: 'double', label: '  ON ', minHeight: 2 },
        ]},
        { type: 'hsplit', ratio: [3, 1], children: [
          { type: 'label', text: '  Sound effects' },
          { type: 'box', border: 'single', label: '  OFF', minHeight: 2 },
        ]},
        { type: 'hsplit', ratio: [3, 1], children: [
          { type: 'label', text: '  Auto-save' },
          { type: 'box', border: 'double', label: '  ON ', minHeight: 2 },
        ]},
      ]
    }
  },
  {
    name: 'Keyboard Shortcuts',
    description: 'List of keyboard shortcuts for the application',
    dsl: {
      type: 'box', border: 'rounded', label: 'Shortcuts', minWidth: 35,
      children: [
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'label', text: '  Ctrl+S' }, { type: 'label', text: '  Save' },
        ]},
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'label', text: '  Ctrl+Shift+P' }, { type: 'label', text: '  Command Palette' },
        ]},
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'label', text: '  Ctrl+K' }, { type: 'label', text: '  Search' },
        ]},
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'label', text: '  Ctrl+B' }, { type: 'label', text: '  Toggle Sidebar' },
        ]},
        { type: 'hsplit', ratio: [1, 1], children: [
          { type: 'label', text: '  F11' }, { type: 'label', text: '  Fullscreen' },
        ]},
      ]
    }
  },
  {
    name: 'Mobile Device Frame',
    description: 'Phone-shaped frame with notch and mobile app layout',
    dsl: {
      type: 'box', border: 'rounded', label: '📱 Mobile', minWidth: 28, minHeight: 20,
      children: [
        { type: 'label', text: '  ┌───┐' },
        { type: 'label', text: '  │ ● │' },
        { type: 'label', text: '  └───┘' },
        { type: 'hsplit', ratio: [4, 1], children: [
          { type: 'label', text: '  9:41' },
          { type: 'label', text: '  🔋' },
        ]},
        { type: 'box', border: 'single', label: 'App Content', minHeight: 10, children: [
          { type: 'label', text: '  Welcome!' },
          { type: 'spacer', height: 1 },
          { type: 'label', text: '  Get started by' },
          { type: 'label', text: '  exploring the app.' },
        ]},
        { type: 'box', border: 'single', label: '  Home  Search  Profile', minHeight: 2 },
      ]
    }
  },
];

export function getPreset(name) {
  return PRESETS.find(p => p.name === name) || null;
}

export function getPresetNames() {
  return PRESETS.map(p => p.name);
}
