# AUDITLY — Payroll Contribution Verification

Auditly compares attendance/payroll Excel data with EPF ECR and ESIC IP records, supports manual review, and prepares editable audit reports.

## Run locally

Requires Node.js. From this folder, run:

```text
npm install
npm run dev
```

The local development server runs at `http://localhost:3000` and uses a local auditor workspace.

## Build for deployment

```text
npm run lint
npm run build
```

The build creates the browser app in `dist/` and the production server in `dist-server/`.

## Deploy with private client access

Read [DEPLOYMENT.md](./DEPLOYMENT.md) before publishing. Production startup refuses to run unless Supabase Auth, the server-only Supabase secret key, and a private Storage bucket are configured. This prevents a public deployment from falling back to local, in-memory data.
