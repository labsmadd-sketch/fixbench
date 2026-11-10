#!/usr/bin/env node
// Sets up a new shop: one Firebase project per shop, same codebase.
//
//   npm run setup:shop -- --alias acme --project-id fixbench-acme \
//     --owner-email owner@acme.lk --owner-name "Anura Perera"
//
// Needs: `npx firebase login` done once, and a billing-free Google account.
// Step 6 needs a service-account key for the new project in
// GOOGLE_APPLICATION_CREDENTIALS (Project settings → Service accounts).
//
// STATUS: first draft. Steps 1–3 and 5 call the Firebase CLI; step 4 needs a
// manual click; step 6 uses the Admin SDK. Try it on a throwaway project first.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    alias: { type: 'string' },
    'project-id': { type: 'string' },
    'owner-email': { type: 'string' },
    'owner-name': { type: 'string' },
    'skip-create': { type: 'boolean', default: false },
  },
});

for (const k of ['alias', 'project-id', 'owner-email', 'owner-name']) {
  if (!args[k]) {
    console.error(`Missing --${k}. See the header of scripts/setup-shop.mjs.`);
    process.exit(1);
  }
}

const alias = `shop-${args.alias}`;
const projectId = args['project-id'];
const firebase = (...a) =>
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['firebase', ...a], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });
const step = (n, text) => console.log(`\n[${n}/6] ${text}`);

// 1. Project and alias
step(1, `Project ${projectId} as alias ${alias}`);
if (!args['skip-create']) firebase('projects:create', projectId, '--display-name', `FixBench ${args.alias}`);
const rc = JSON.parse(readFileSync('.firebaserc', 'utf8'));
rc.projects[alias] = projectId;
writeFileSync('.firebaserc', JSON.stringify(rc, null, 2) + '\n');

// 2. Web app and .env.shop-<alias>
step(2, 'Web app config');
firebase('apps:create', 'web', `fixbench-${args.alias}`, '--project', projectId);
const sdk = firebase('apps:sdkconfig', 'web', '--project', projectId, '--json');
const cfg = JSON.parse(sdk).result.sdkConfig;
writeFileSync(
  `.env.${alias}`,
  [
    `VITE_FB_API_KEY=${cfg.apiKey}`,
    `VITE_FB_AUTH_DOMAIN=${cfg.authDomain}`,
    `VITE_FB_PROJECT_ID=${cfg.projectId}`,
    `VITE_FB_APP_ID=${cfg.appId}`,
    'VITE_USE_EMULATORS=false',
    '',
  ].join('\n'),
);

// 3. Firestore database
step(3, 'Firestore database (asia-south1, Mumbai — closest region to Sri Lanka)');
firebase('firestore:databases:create', '(default)', '--location', 'asia-south1', '--project', projectId);

// 4. Email/password sign-in — the CLI cannot switch this on.
step(4, 'Turn on Email/Password sign-in');
console.log(`  Open https://console.firebase.google.com/project/${projectId}/authentication/providers`);
console.log('  and enable "Email/Password". Leave "Email link" off.');
const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('  Press Enter when done… ');
rl.close();

// 5. Rules, indexes and the app
step(5, 'Deploy rules, indexes and app');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:shop', alias], { stdio: 'inherit', shell: process.platform === 'win32' });
firebase('deploy', '--only', 'firestore,hosting', '--project', projectId);

// 6. Owner account and starting documents (Admin SDK)
step(6, 'Owner account');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('  GOOGLE_APPLICATION_CREDENTIALS is not set. Download a service-account key for this project,');
  console.error('  set the variable, and rerun with --skip-create to finish this step.');
  process.exit(1);
}
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId });

const tempPassword = randomBytes(9).toString('base64url');
const owner = await getAuth().createUser({ email: args['owner-email'], password: tempPassword, displayName: args['owner-name'] });
const db = getFirestore();
await db.doc(`users/${owner.uid}`).set({ name: args['owner-name'], email: args['owner-email'], role: 'owner', active: true, mustChangePassword: true });
await db.doc('settings/shop').set({
  name: '',
  phone: '',
  currency: 'LKR',
  vatRegistered: false,
  prefixes: { ticket: 'T', quote: 'Q', invoice: 'INV' },
  numberRestart: 'yearly',
  plan: 'spark',
  setupComplete: false,
  updatedAt: FieldValue.serverTimestamp(),
});
await db.doc('settings/public').set({ name: '' });

console.log(`\nDone. ${alias} is live at https://${projectId}.web.app`);
console.log(`Owner: ${args['owner-email']}  temporary password: ${tempPassword}`);
console.log('Give the password to the owner in person; the setup wizard runs at first sign-in.');
const secret = alias.toUpperCase().replace(/[^A-Z0-9]/g, '_');
console.log(`For CI, add {"alias": "${alias}", "secret": "${secret}"} to shops.json`);
console.log(`and repository secrets ENV_${secret} (contents of .env.${alias}) and FIREBASE_SA_${secret}.`);
