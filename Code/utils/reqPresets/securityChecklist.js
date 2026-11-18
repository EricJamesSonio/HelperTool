const GROUP_CONTROL = 'Security Requirements';

const GENERAL = [
    ['m', 'Input Validation', 'Validate all incoming data against expected types, formats, lengths and constraints.'],
    ['m', 'Input Sanitization', 'Remove or neutralize dangerous input where appropriate.'],
    ['m', 'Output Encoding', 'Prevent untrusted data from being interpreted as executable HTML or JavaScript.'],
    ['m', 'SQL Injection Prevention', 'Use parameterized queries and ORM-safe operations.'],
    ['m', 'NoSQL Injection Prevention', 'Prevent malicious query operators and manipulated database filters.'],
    ['m', 'Command Injection Prevention', 'Never pass untrusted input to system commands.'],
    ['m', 'Path Traversal Prevention', 'Prevent access to files outside authorized directories.'],
    ['m', 'XSS Prevention', 'Prevent malicious scripts from running through user-generated content.'],
    ['x', 'XML External Entity (XXE) Prevention', 'Prevent malicious XML documents from reaching external resources or local files.'],
    ['x', 'Prototype Pollution Prevention', 'Protect JavaScript objects from manipulated properties and prototypes.'],
    ['x', 'Deserialization Protection', 'Prevent unsafe processing of manipulated serialized objects.'],
    ['x', 'ReDoS Protection', 'Prevent malicious regular expressions from consuming excessive CPU.'],
    ['m', 'Secure Password Hashing', 'Use Argon2id or an appropriately configured password-hashing algorithm.'],
    ['m', 'Strong Password Policies', 'Enforce reasonable password length and compromised-password checks.'],
    ['m', 'Multi-Factor Authentication (MFA)', 'Require additional verification for sensitive accounts and operations.'],
    ['m', 'Role-Based Access Control (RBAC)', 'Restrict features and resources based on user roles.'],
    ['m', 'Permission-Based Authorization', 'Check individual permissions instead of trusting frontend restrictions.'],
    ['m', 'Server-Side Authorization', 'Verify permissions on every protected backend operation.'],
    ['m', 'Account Lockout / Login Throttling', 'Prevent automated password-guessing attacks.'],
    ['m', 'Secure Password Reset', 'Use time-limited, single-use password reset tokens.'],
    ['m', 'Session Revocation', 'Invalidate sessions after logout, password change or suspicious activity.'],
    ['m', 'Brute-Force Protection', 'Limit repeated authentication attempts.'],
    ['x', 'Privilege Escalation Prevention', 'Prevent users from gaining higher privileges through manipulated requests.'],
    ['x', 'Reauthentication for Sensitive Actions', 'Require password or MFA verification before critical operations.'],
    ['x', 'Session Anomaly Detection', 'Identify unusual authentication patterns and potentially compromised sessions.'],
    ['m', 'HTTPS / TLS Encryption', 'Encrypt communication between clients and servers.'],
    ['m', 'Secure Password Storage', 'Never store plaintext passwords or reversibly encrypted passwords.'],
    ['m', 'Secure Token Generation', 'Generate unpredictable authentication and verification tokens.'],
    ['m', 'Encryption at Rest', 'Encrypt sensitive stored information and database backups.'],
    ['m', 'Secure Secret Management', 'Keep API keys, database credentials and signing secrets outside source code.'],
    ['x', 'Key Rotation', 'Regularly rotate encryption keys, API credentials and signing secrets.'],
    ['x', 'Cryptographic Key Separation', 'Use different keys for different cryptographic purposes.'],
    ['x', 'Sensitive Data Masking', 'Hide passwords, tokens, personal information and sensitive fields in logs and interfaces.'],
    ['x', 'Secure Data Disposal', 'Remove sensitive information properly when it is no longer required.'],
    ['x', 'Forward Secrecy', 'Use TLS configurations where a compromised long-term key cannot expose earlier captured sessions.'],
    ['m', 'Secure Error Handling', 'Never expose stack traces, database details, internal paths or secrets to users.'],
    ['m', 'Security Logging', 'Record authentication failures, access violations and other security events.'],
    ['m', 'Dependency Vulnerability Scanning', 'Detect vulnerable third-party packages.'],
    ['m', 'Secure Configuration', 'Disable debug mode and unnecessary services in production.'],
    ['m', 'Environment Variable Protection', 'Protect production credentials and environment configuration.'],
    ['m', 'File Upload Validation', 'Validate file types, extensions, sizes and actual file contents.'],
    ['x', 'Malware Scanning', 'Scan uploaded files for malicious content.'],
    ['m', 'Rate Limiting', 'Limit excessive requests and automated abuse.'],
    ['x', 'Denial-of-Service Protection', 'Protect application resources against resource-exhaustion attacks.'],
    ['m', 'Security Audit Trail', 'Keep records of important security-sensitive operations.'],
    ['x', 'Automated Security Testing', 'Run security checks in the CI/CD pipeline.'],
    ['x', 'Software Supply Chain Protection', 'Verify dependencies, build artifacts and package integrity.'],
    ['m', 'Reference standards', 'Use established standards as the implementation and verification reference: CIS Controls for infrastructure and the NIST Cybersecurity Framework (identify, protect, detect, respond, recover).'],
    ['m', 'Rule: never trust the client', 'Everything that comes from a browser, desktop application or mobile device is untrusted input.'],
    ['m', 'Rule: the backend is the authority', 'Frontend validation improves usability. Backend validation and authorization enforce security.'],
    ['m', 'Rule: never expose secrets', 'No database credentials, private API keys, signing secrets or privileged tokens in frontend bundles or application source code.'],
    ['m', 'Rule: fail securely', 'If authentication, authorization or a security check fails, deny access instead of continuing.'],
    ['m', 'Rule: defense in depth', 'Protect sensitive resources with several independent controls.'],
    ['m', 'Rule: protect the business logic', 'Security must protect existing business rules and never silently change them.'],
    ['m', 'Rule: test the controls', 'Every important security requirement has a corresponding test.'],
    ['m', 'Rule: security is never finished', 'Dependencies, infrastructure and attack techniques change, so review and patch regularly.'],
];

const WEB = [
    ['m', 'Content Security Policy (CSP)', 'Restrict which scripts, styles, images and resources the browser can load.'],
    ['m', 'HTTP Strict Transport Security (HSTS)', 'Force browsers to use HTTPS.'],
    ['m', 'X-Content-Type-Options', 'Prevent browsers from guessing content types.'],
    ['m', 'X-Frame-Options / frame-ancestors', 'Prevent unauthorized sites from embedding the application.'],
    ['m', 'Referrer-Policy', 'Control how much referrer information browsers send.'],
    ['x', 'Permissions-Policy', 'Restrict browser capabilities such as camera, microphone and geolocation.'],
    ['m', 'Secure Cookie Configuration', 'Set HttpOnly, Secure and SameSite on cookies.'],
    ['x', 'Subresource Integrity (SRI)', 'Verify the integrity of externally loaded scripts and stylesheets where applicable.'],
    ['m', 'MIME Type Enforcement', 'Serve every resource with the correct content type.'],
    ['m', 'CSRF Protection', 'Prevent other websites from submitting authenticated requests on behalf of users.'],
    ['m', 'Secure Session Management', 'Use secure session identifiers and expiration policies.'],
    ['m', 'Session Fixation Prevention', 'Regenerate session identifiers after authentication or privilege changes.'],
    ['m', 'Refresh Token Rotation', 'Rotate refresh tokens and detect reuse of invalidated tokens.'],
    ['m', 'Access Token Expiration', 'Use short-lived access tokens.'],
    ['m', 'Origin Validation', 'Validate request origins where appropriate.'],
    ['m', 'CORS Restrictions', 'Allow only trusted origins, methods and headers.'],
    ['m', 'Clickjacking Protection', 'Prevent unauthorized framing and deceptive interactions.'],
    ['m', 'Cache-Control for Sensitive Pages', 'Prevent sensitive authenticated content from being cached.'],
    ['m', 'WebSocket Authentication', 'Authenticate WebSocket connections and authorize individual subscriptions and events.'],
    ['x', 'WebSocket Origin Validation', 'Prevent unauthorized websites from opening connections.'],
    ['m', 'WebSocket Message Validation', 'Validate incoming WebSocket messages like normal API requests.'],
    ['m', 'API Authentication', 'Require valid authentication for protected endpoints.'],
    ['m', 'API Authorization', 'Verify resource-level permissions on every request.'],
    ['m', 'API Rate Limiting', 'Prevent endpoint abuse and automated attacks.'],
    ['m', 'Request Size Limits', 'Prevent oversized requests from exhausting server resources.'],
    ['m', 'Request Timeout', 'Prevent requests from consuming server resources indefinitely.'],
    ['m', 'Strict DTO Validation', 'Reject unexpected properties and invalid request structures.'],
    ['m', 'Mass Assignment Protection', 'Prevent users from changing restricted fields through manipulated requests.'],
    ['m', 'SSRF Prevention', 'Prevent backend services from making unauthorized requests to internal systems or sensitive network resources.'],
    ['x', 'HTTP Parameter Pollution Protection', 'Prevent duplicate parameters from bypassing validation.'],
    ['x', 'API Schema Validation', 'Enforce consistent request and response structures.'],
    ['x', 'GraphQL Query Restrictions', 'Restrict query depth, complexity and introspection where GraphQL is used.'],
    ['x', 'API Version Security', 'Prevent outdated API versions from keeping vulnerable security behavior.'],
    ['m', 'Response Data Filtering', 'Never return sensitive database fields just because they exist.'],
    ['m', 'Database Access Restrictions', 'Restrict database access to authorized backend services.'],
    ['m', 'Least-Privilege Database Accounts', 'Give database accounts only the permissions they require.'],
    ['m', 'Database Connection Encryption', 'Encrypt database connections.'],
    ['m', 'Database Backup Encryption', 'Protect backups from unauthorized access.'],
    ['m', 'Tenant Isolation', 'Prevent one organization from accessing the records of another. Hiding data in the frontend is not security: the backend and, where appropriate, the database must enforce isolation.'],
    ['m', 'Tenant Context Validation', 'Derive the tenant from the trusted authentication context, never from arbitrary client input.'],
    ['m', 'Cross-Tenant Access Prevention', 'Make every resource operation respect organization boundaries.'],
    ['x', 'Database Audit Logging', 'Track sensitive database operations and access patterns.'],
    ['x', 'Row-Level Security (RLS)', 'Add database-level restrictions that prevent unauthorized access to rows.'],
    ['x', 'Database Network Isolation', 'Prevent public access to database infrastructure.'],
    ['m', 'Standard: OWASP ASVS', 'Use OWASP ASVS Level 2 as the verification target, and Level 3 for highly sensitive applications. Use the OWASP Top 10 and the Web Security Testing Guide as references.'],
];

const DESKTOP = [
    ['m', 'Secure IPC Communication', 'Validate and authorize communication between application processes.'],
    ['m', 'IPC Input Validation', 'Never trust arguments received from the UI process.'],
    ['m', 'Least-Privilege Execution', 'Do not run the application with administrator or root privileges unless necessary.'],
    ['m', 'Secure File Access', 'Restrict access to authorized application directories and files.'],
    ['m', 'Secure Temporary Files', 'Protect temporary files from unauthorized access and manipulation.'],
    ['m', 'Command Execution Protection', 'Prevent untrusted input from running operating system commands.'],
    ['x', 'Process Isolation', 'Separate sensitive operations into restricted processes.'],
    ['x', 'Application Sandboxing', 'Restrict application access to operating system resources.'],
    ['x', 'Memory Protection', 'Reduce exposure of sensitive data in application memory.'],
    ['x', 'Debugging Protection', 'Disable production debugging interfaces and development tools where appropriate.'],
    ['m', 'Code Signing', 'Sign executables and installers to establish publisher authenticity.'],
    ['m', 'Secure Auto Updates', 'Download updates through authenticated and encrypted channels.'],
    ['m', 'Update Signature Verification', 'Verify update authenticity before installation.'],
    ['m', 'Installer Integrity Verification', 'Prevent tampered installers from being distributed or run.'],
    ['m', 'Dependency Integrity', 'Protect dependencies from unauthorized modification.'],
    ['x', 'Rollback Protection', 'Prevent attackers from forcing installation of vulnerable older versions.'],
    ['x', 'Secure Update Delivery', 'Protect the update distribution pipeline and release infrastructure.'],
    ['m', 'Secure Credential Storage', 'Use the operating system credential storage (Credential Manager, Keychain or equivalent).'],
    ['m', 'Local Database Encryption', 'Encrypt sensitive locally stored information.'],
    ['m', 'Secure Token Storage', 'Never keep authentication tokens in easily readable plaintext files.'],
    ['m', 'File Permission Restrictions', 'Prevent other users from accessing application data.'],
    ['m', 'Local Session Protection', 'Protect persistent login sessions from unauthorized access.'],
    ['x', 'Sensitive Data Cleanup', 'Remove temporary credentials and sensitive information when no longer needed.'],
    ['x', 'Local Tampering Detection', 'Detect unexpected modification of sensitive application resources.'],
    ['x', 'Application Integrity Verification', 'Verify that critical application components have not been modified.'],
    ['m', 'Desktop (Electron only): nodeIntegration disabled', 'If the app uses Electron, set nodeIntegration to false so the UI process cannot use Node.js APIs directly.'],
    ['m', 'Desktop (Electron only): contextIsolation enabled', 'If the app uses Electron, set contextIsolation to true to separate preload scripts from UI code.'],
    ['m', 'Desktop (Electron only): sandbox enabled', 'If the app uses Electron, enable renderer sandboxing.'],
    ['m', 'Desktop (Electron only): restricted preload API', 'If the app uses Electron, expose only explicitly authorized functions through contextBridge.'],
    ['m', 'Desktop (Electron only): IPC sender validation', 'If the app uses Electron, verify which window and frame sent each IPC request.'],
    ['m', 'Desktop (Electron only): navigation restrictions', 'If the app uses Electron, block navigation to unauthorized external websites.'],
    ['m', 'Desktop (Electron only): window opening restrictions', 'If the app uses Electron, prevent websites from opening uncontrolled windows.'],
    ['m', 'Desktop (Electron only): permission request restrictions', 'If the app uses Electron, explicitly control camera, microphone, notification and other permission requests.'],
    ['x', 'Desktop (Electron only): webview restrictions', 'If the app uses Electron, restrict embedded webview capabilities and navigation.'],
    ['x', 'Desktop (Electron only): remote content isolation', 'If the app uses Electron, keep untrusted remote content isolated from privileged code.'],
    ['x', 'Desktop (Electron only): DevTools restrictions', 'If the app uses Electron, restrict developer tools in production builds when appropriate.'],
    ['x', 'Desktop (Electron only): secure protocol handling', 'If the app uses Electron, validate custom application protocols and their inputs.'],
];

const MOBILE = [
    ['m', 'Secure Local Storage', 'Store sensitive data with Android Keystore or iOS Keychain-backed mechanisms.'],
    ['m', 'Encrypted Local Database', 'Encrypt sensitive locally stored database records.'],
    ['m', 'Secure Token Storage', 'Never keep authentication tokens in plaintext preferences or ordinary local storage.'],
    ['x', 'Screenshot Protection', 'Restrict screenshots on sensitive screens where appropriate.'],
    ['x', 'Clipboard Protection', 'Avoid exposing sensitive information through the clipboard.'],
    ['m', 'Sensitive Data Cleanup', 'Remove sensitive temporary data when it is no longer required.'],
    ['m', 'Backup Protection', 'Prevent sensitive application data from leaking through insecure device backups.'],
    ['x', 'Root / Jailbreak Detection', 'Detect potentially compromised devices and apply appropriate restrictions.'],
    ['x', 'App Tampering Detection', 'Detect modified or repackaged application binaries.'],
    ['m', 'HTTPS Enforcement', 'Require encrypted communication.'],
    ['m', 'Certificate Validation', 'Validate server certificates correctly.'],
    ['x', 'Certificate Pinning', 'Restrict trusted server certificates or public keys for selected high-risk applications.'],
    ['m', 'Secure API Authentication', 'Protect API requests with appropriate authentication.'],
    ['m', 'Secure Token Refresh', 'Prevent refresh token theft and reuse.'],
    ['m', 'Network Traffic Protection', 'Prevent sensitive information from travelling over insecure channels.'],
    ['x', 'Proxy / MITM Resistance', 'Increase resistance to interception and manipulation of network traffic.'],
    ['x', 'Application Code Obfuscation', 'Make reverse engineering more difficult.'],
    ['x', 'Anti-Tampering Protection', 'Detect unauthorized application modifications.'],
    ['x', 'Debugger Detection', 'Detect debugging activity in sensitive production applications.'],
    ['x', 'Runtime Integrity Verification', 'Verify important application components during execution.'],
    ['m', 'Secure Deep Links', 'Validate incoming links to prevent unauthorized actions and malicious input.'],
    ['m', 'Secure Inter-App Communication', 'Validate data received from other applications.'],
    ['x', 'Biometric Authentication', 'Use platform biometric authentication for sensitive operations.'],
    ['x', 'Device Attestation', 'Verify device and application integrity with supported platform attestation.'],
    ['m', 'Standard: OWASP MASVS', 'Use OWASP MASVS as the security baseline and the Mobile Security Testing Guide for test procedures.'],
];

const FILES = [
    ['m', 'File Extension Validation', 'Restrict allowed file extensions.'],
    ['m', 'MIME Type Validation', 'Validate declared file content types.'],
    ['m', 'File Signature Validation', 'Inspect actual file signatures instead of trusting extensions.'],
    ['m', 'File Size Restrictions', 'Prevent oversized uploads.'],
    ['m', 'Randomized File Names', 'Never use user-provided filenames for storage.'],
    ['m', 'File Storage Isolation', 'Store uploads outside executable application directories.'],
    ['m', 'File Access Authorization', 'Verify permissions before allowing downloads.'],
    ['x', 'Malware Scanning', 'Scan uploaded documents and attachments.'],
    ['x', 'Image Metadata Removal', 'Remove sensitive EXIF metadata when appropriate.'],
    ['x', 'Archive Bomb Protection', 'Prevent malicious compressed files from exhausting storage or processing resources.'],
    ['x', 'Document Content Inspection', 'Inspect potentially dangerous embedded content in uploaded documents.'],
    ['x', 'Signed Download URLs', 'Use short-lived, permission-controlled download links.'],
    ['x', 'Secure File Deletion', 'Protect sensitive files during deletion and retention processes.'],
];

const NETWORK = [
    ['m', 'TLS 1.2 / 1.3', 'Use modern encrypted communication protocols.'],
    ['m', 'Certificate Verification', 'Never disable certificate validation in production.'],
    ['x', 'Secure DNS Configuration', 'Protect domain resolution against manipulation where appropriate.'],
    ['m', 'Firewall Rules', 'Restrict unnecessary inbound and outbound connections.'],
    ['x', 'Network Segmentation', 'Separate application servers, databases and internal services.'],
    ['x', 'Egress Filtering', 'Restrict which external destinations application servers can contact.'],
    ['x', 'API Gateway Protection', 'Centralize API security enforcement where appropriate.'],
    ['x', 'DDoS Protection', 'Protect public-facing services against distributed denial-of-service attacks.'],
    ['x', 'Web Application Firewall (WAF)', 'Filter malicious HTTP requests before they reach application services.'],
    ['m', 'Secure Third-Party Integrations', 'Authenticate external integrations and restrict their permissions.'],
    ['m', 'Webhook Signature Verification', 'Verify that incoming webhook requests come from trusted providers.'],
    ['x', 'Replay Attack Protection', 'Prevent captured requests from being reused maliciously.'],
];

const OPS = [
    ['m', 'Authentication Activity Monitoring', 'Monitor login attempts, failures and suspicious authentication activity.'],
    ['m', 'Security Event Logging', 'Record security-related events.'],
    ['m', 'Audit Trail', 'Record who performed important actions and when.'],
    ['m', 'Dependency Monitoring', 'Continuously monitor vulnerable packages.'],
    ['m', 'Automated Vulnerability Scanning', 'Regularly scan application code and infrastructure.'],
    ['x', 'Penetration Testing', 'Run controlled security assessments against deployed applications.'],
    ['m', 'Static Application Security Testing (SAST)', 'Analyze source code for security vulnerabilities.'],
    ['x', 'Dynamic Application Security Testing (DAST)', 'Test running applications for exploitable vulnerabilities.'],
    ['m', 'Software Composition Analysis (SCA)', 'Identify vulnerable or compromised dependencies.'],
    ['x', 'Container Image Scanning', 'Scan Docker images and operating system packages.'],
    ['m', 'Infrastructure Security Auditing', 'Check cloud infrastructure and deployment configuration.'],
    ['m', 'Incident Response Plan', 'Define procedures for handling security incidents.'],
    ['m', 'Automated Secret Detection', 'Detect accidentally committed credentials and API keys.'],
    ['m', 'Backup Restoration Testing', 'Verify that backups can actually be restored.'],
    ['m', 'Security Patch Management', 'Regularly patch vulnerable frameworks, libraries and operating systems.'],
];

const SECTIONS = [
    { prefix: 'General: ', type: null, rows: GENERAL },
    { prefix: 'Web: ', type: 'web', rows: WEB },
    { prefix: 'Desktop: ', type: 'desktop', rows: DESKTOP },
    { prefix: 'Mobile: ', type: 'mobile', rows: MOBILE },
    { prefix: 'Files: ', type: null, rows: FILES },
    { prefix: 'Network: ', type: null, rows: NETWORK },
    { prefix: 'Ops: ', type: null, rows: OPS },
];

const RELATED = ['authentication', 'rbac', 'frontend-sanitizer', 'db-security', 'devops-security', 'security-layer'];

function auditRows() {
    return [
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: 'Audit first, then implement',
            description: 'Do not start by writing code. First inspect the project and check every control below against the real code and configuration. For each control decide its status: present, partial, missing or not applicable. Implement only the controls that are missing or partial, and reuse what already exists.',
            types: [],
        },
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: 'Ask for the files to check',
            description: 'If you cannot see the code that would contain a control (authentication, middleware, server entry, configuration, database access, bridge or IPC handlers, build and CI configuration, environment loading), do not assume. Reply first with the full repo-relative paths of the files you need, one per line, and wait for them. Never mark a control as present or missing without having seen the code that would show it.',
            types: [],
        },
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: 'Audit report format',
            description: 'Report the result as a list: control, status (present, partial, missing, not applicable), the file that proves it, and the fix you will apply. Give a reason for every not applicable control. Show the report before large changes, then implement the missing and partial controls.',
            types: [],
        },
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: 'Scope by application type',
            description: 'The controls apply to the selected application type. Shared controls (general, files, network, operations) apply to every type. Platform controls (web, desktop, mobile) are listed only for the matching type. Mark a control not applicable when the feature does not exist in this project, for example file uploads in an app without uploads.',
            types: [],
        },
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: 'Do not break existing behavior',
            description: 'Security must protect existing business rules, not silently change them. Do not remove or rewrite working features to satisfy a control. If a control would change behavior, explain the change and ask the user first.',
            types: [],
        },
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: 'Ask before large changes',
            description: 'If closing a gap needs a large or risky change (new infrastructure, a new dependency, a data migration, replacing the auth system, rotating secrets), stop and ask the user. Do not guess and do not leave half-finished protections.',
            types: [],
        },
        {
            group: 'Architecture Requirements',
            level: 'standard',
            title: 'Implementation priority',
            description: 'When many controls are missing, fix them in this order: 1 authentication, authorization, password and session security; 2 input validation, sanitization, injection prevention and output encoding; 3 HTTPS, CORS, CSRF, CSP and security headers; 4 database security, encryption and tenant isolation; 5 API protection, rate limiting, SSRF and request limits; 6 file upload security; 7 desktop and mobile controls; 8 logging, audit trail, monitoring and incident response; 9 dependency scanning, SAST, DAST and SCA; 10 advanced protections. Strict controls come after the must-have ones.',
            types: [],
        },
        {
            group: 'Testing Requirements',
            level: 'standard',
            title: 'Test every control',
            description: 'Every control you implement or fix gets a test that proves it works, such as rejecting hostile input, denying a missing permission, blocking a cross-tenant read or enforcing a rate limit. Place the tests in the matching test folders.',
            types: [],
        },
        {
            group: 'Acceptance Criteria',
            level: 'must-have',
            title: 'Verified',
            description: 'The audit report is delivered, no must-have control is left missing unless the user accepted the risk, existing behavior is unchanged, and every implemented control has a passing test.',
            types: [],
        },
    ];
}

function controlRows(section, typed) {
    return section.rows.map((row) => ({
        group: GROUP_CONTROL,
        level: row[0] === 'm' ? 'must-have' : 'strict',
        title: section.prefix + row[1],
        description: row[2],
        types: typed && section.type ? [section.type] : [],
    }));
}

function makePreset(key, name, description, tags, requirements) {
    return {
        key,
        name,
        description,
        category: 'Security',
        subcategory: 'Checklist',
        tags,
        related: RELATED,
        requirements,
    };
}

function sectionPreset(key, name, description, tags, section) {
    return makePreset(key, name, description, tags, auditRows().concat(controlRows(section, false)));
}

const fullRows = auditRows();
for (const section of SECTIONS) {
    for (const r of controlRows(section, true)) fullRows.push(r);
}

module.exports = [
    makePreset(
        'security-audit-full',
        'Security Audit: Full Checklist',
        'The complete security checklist in one preset. The AI audits the project first, asks for the files it needs, and implements only what is missing. Controls are filtered by the selected application type.',
        ['security', 'audit', 'checklist', 'owasp', 'bundle'],
        fullRows
    ),
    sectionPreset(
        'security-general',
        'Security: General (All Applications)',
        'Input validation, authentication, cryptography, infrastructure protection and the core security rules that apply to every application.',
        ['security', 'general', 'audit', 'validation', 'auth', 'crypto'],
        SECTIONS[0]
    ),
    sectionPreset(
        'security-web',
        'Security: Web Application',
        'Browser security, session and request security, API and backend security, and database and tenant isolation for web applications.',
        ['security', 'web', 'audit', 'csp', 'csrf', 'cors', 'api', 'tenant'],
        SECTIONS[1]
    ),
    sectionPreset(
        'security-desktop',
        'Security: Desktop Application',
        'Runtime, installation and update, and local data security for desktop applications, with the Electron-specific controls marked as such.',
        ['security', 'desktop', 'audit', 'ipc', 'updates', 'electron'],
        SECTIONS[2]
    ),
    sectionPreset(
        'security-mobile',
        'Security: Mobile Application',
        'Device and storage, network and application integrity security for Android and iOS applications.',
        ['security', 'mobile', 'audit', 'keystore', 'pinning', 'masvs'],
        SECTIONS[3]
    ),
    sectionPreset(
        'security-files-media',
        'Security: Files, Media & Documents',
        'Security for uploads and downloads: validation, storage, authorization and malware protection.',
        ['security', 'files', 'upload', 'audit'],
        SECTIONS[4]
    ),
    sectionPreset(
        'security-network',
        'Security: Network & Communication',
        'Transport security, network boundaries, third-party integrations, webhooks and denial-of-service protection.',
        ['security', 'network', 'tls', 'waf', 'audit'],
        SECTIONS[5]
    ),
    sectionPreset(
        'security-monitoring',
        'Security: Monitoring & Maintenance',
        'Monitoring, audit trails, scanning, testing, incident response and patching after deployment.',
        ['security', 'monitoring', 'sast', 'sca', 'audit'],
        SECTIONS[6]
    ),
];