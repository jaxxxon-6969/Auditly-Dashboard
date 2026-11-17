# Deploying Auditly with private client workspaces

Auditly uses Supabase Auth for email and password sign-in, a private Supabase Storage bucket for client workspaces, and the existing Node/Express server for file parsing and report preparation. The browser receives only the Supabase project URL and publishable key. The Supabase secret key stays on the server and is never sent to the browser.

## 1. Create the Supabase project

1. Create a Supabase project and wait for it to finish starting.
2. In **Authentication → Sign In / Providers**, enable **Email** and password sign-in.
3. Under **Authentication → Users**, add the auditor account using the email you will set as `AUDITLY_OWNER_EMAIL`. Confirm the email for that user.
4. In **Storage**, create a bucket named `auditly-private` and leave **Public bucket** turned off. Keep the bucket private.
5. In **Project Settings → API Keys**, copy the project's **Project URL**, **Publishable key**, and **Secret key**. Use the new `sb_publishable_...` and `sb_secret_...` keys when available. The publishable key is public; the secret key is server-only.

Auditly checks each signed-in user against its server-side client registry. Clients cannot choose another workspace, and the private bucket is never accessed directly from their browser.

## 2. Prepare the project for Render

Render deploys from a Git repository. Put this project in a private GitHub repository that you control, then connect that repository to Render. The project folder currently needs to be connected to a Git repository before Render can build it. Keep `.env` and all real keys out of Git; `.env.example` contains placeholders only.

The included `render.yaml` sets the Node build and start commands and asks Render to collect the Supabase settings securely. When creating the Blueprint, enter:

- `SUPABASE_URL`: your project URL.
- `SUPABASE_PUBLISHABLE_KEY`: the `sb_publishable_...` key.
- `SUPABASE_SECRET_KEY`: the `sb_secret_...` key. Keep it in Render's secret environment settings only.
- `AUDITLY_OWNER_EMAIL`: the confirmed auditor email.
- `AUDITLY_STORAGE_BUCKET`: `auditly-private`, or the exact private bucket name you created.

Render builds and starts the Express server. It listens on Render's `PORT` value and exposes `/api/health` for its health check.

## 3. First sign-in and client access

1. Open the deployed Render address and sign in with the auditor account created in Supabase.
2. Create a separate client workspace for each company. Auditly displays a temporary password once; share it with that client using a secure channel.
3. Select that client's workspace and upload the Excel, EPF ECR, and ESIC files there. The client signs in with their own email and temporary password, then sets a new password.
4. Client accounts can view their assigned records and reports. The server blocks client uploads, settings changes, and verification decisions.

## 4. Publish later changes

Push updated code to the connected Git branch. Render will build and publish a new version at the same address. Supabase accounts and saved workspaces remain in Supabase between app updates.

## Existing local or Google-hosted data

This code change moves future hosted authentication and storage to Supabase; it does not automatically copy old Firebase users, Google Cloud Storage objects, or browser-only records from `localhost`. Create fresh Auditly logins in Supabase. Before sharing the new address, upload the source Excel/PDF files into the new client's workspace and verify them there. If an earlier Google Cloud project or bucket contains records you need, export and import those workspaces before directing clients to the new address.

## Official setup references

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Render Node and Express deployment](https://render.com/docs/deploy-node-express-app)
- [Render Blueprint settings](https://render.com/docs/blueprint-spec)
