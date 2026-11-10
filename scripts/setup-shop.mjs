#!/usr/bin/env node
// Sets up a new shop: one Firebase project per shop, same codebase.
//
//   npm run setup:shop -- --account you@gmail.com --alias acme --project-id fixbench-acme \
//     --owner-email owner@acme.lk --owner-name "Anura Perera"
//
// Needs: `npx firebase login:add` done once for --account (every Firebase call
// uses that Google account explicitly, never the CLI's default login).
// Safe to rerun with --skip-create: finished steps are skipped.
// Step 6 needs a service-account key for the new project in
// GOOGLE_APPLICATION_CREDENTIALS (Project settings → Service accounts).
//
// STATUS: first draft. Steps 1–3 and 5 call the Firebase CLI; step 4 needs a
// manual click; step 6 uses the Admin SDK. Try it on a throwaway project first.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    account: { type: 'string' },
    alias: { type: 'string' },
    'project-id': { type: 'string' },
    'owner-email': { type: 'string' },
    'owner-name': { type: 'string' },
    'skip-create': { type: 'boolean', default: false },
    'auth-enabled': { type: 'boolean', default: false },
    // Skip steps 1–5 (project, app, database, sign-in, deploy) when they are done.
    'owner-only': { type: 'boolean', default: false },
  },
});

for (const k of ['account', 'alias', 'project-id', 'owner-email', 'owner-name']) {
  if (!args[k]) {
    console.error(`Missing --${k}. See the header of scripts/setup-shop.mjs.`);
    process.exit(1);
  }
}

const alias = `shop-${args.alias}`;
const projectId = args['project-id'];
const quote = (a) => (process.platform === 'win32' && /[\s()]/.test(a) ? `"${a}"` : a);
const firebase = (...a) =>
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['firebase', ...a, '--account', args.account].map(quote),
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], shell: process.platform === 'win32' },
  );
const tryFirebase = (...a) => {
  try {
    return firebase(...a);
  } catch {
    return null;
  }
};
const step = (n, text) => console.log(`\n[${n}/6] ${text}`);

if (!args['owner-only']) {
// 1. Project and alias
step(1, `Project ${projectId} as alias ${alias}`);
if (!args['skip-create']) firebase('projects:create', projectId, '--display-name', `FixBench ${args.alias}`);
const rc = JSON.parse(readFileSync('.firebaserc', 'utf8'));
rc.projects[alias] = projectId;
writeFileSync('.firebaserc', JSON.stringify(rc, null, 2) + '\n');

// 2. Web app and .env.shop-<alias> (reuses the app on a rerun)
step(2, 'Web app config');
const apps = JSON.parse(firebase('apps:list', 'web', '--project', projectId, '--json')).result ?? [];
let appId = apps.find((a) => a.displayName === `fixbench-${args.alias}`)?.appId;
if (!appId) {
  const created = JSON.parse(firebase('apps:create', 'web', `fixbench-${args.alias}`, '--project', projectId, '--json'));
  appId = created.result.appId;
}
const sdk = firebase('apps:sdkconfig', 'web', appId, '--project', projectId, '--json');
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
if (tryFirebase('firestore:databases:get', '(default)', '--project', projectId)) console.log('  Already exists.');
else if (!tryFirebase('firestore:databases:create', '(default)', '--location', 'asia-south1', '--project', projectId)) {
  // New projects have the Firestore API switched off, and the CLI cannot switch it on.
  console.log('  Could not create the database. If the Cloud Firestore API is off, enable it here:');
  console.log(`  https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=${projectId}`);
  console.log('  then wait a minute and rerun with --skip-create (add --auth-enabled if sign-in is already on).');
  process.exit(1);
}

// 4. Email/password sign-in — the CLI cannot switch this on.
step(4, 'Turn on Email/Password sign-in');
if (args['auth-enabled']) {
  console.log('  Already on (--auth-enabled).');
} else {
  console.log(`  Open https://console.firebase.google.com/project/${projectId}/authentication/providers`);
  console.log('  and enable "Email/Password". Leave "Email link" off.');
  if (!process.stdin.isTTY) {
    console.log('  No keyboard attached: rerun with --skip-create --auth-enabled once it is on.');
    process.exit(0);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('  Press Enter when done… ');
  rl.close();
}

// 5. Rules, indexes and the app. New projects may not have a Hosting site yet.
step(5, 'Deploy rules, indexes and app');
if (!tryFirebase('hosting:sites:get', projectId, '--project', projectId)) firebase('hosting:sites:create', projectId, '--project', projectId);
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:shop', alias], { stdio: 'inherit', shell: process.platform === 'win32' });
firebase('deploy', '--only', 'firestore,hosting', '--project', projectId);

} // end of steps 1–5

// 6. Owner account and starting documents.
//
// New Google Cloud projects block service-account keys, so no Admin SDK here.
// Instead: create the owner's sign-in with the public web API, briefly deploy
// rules that let ONLY that new account create its own owner record, write the
// records as the owner, then put the normal rules back (always, even on error).
step(6, 'Owner account');
const env = Object.fromEntries(
  readFileSync(`.env.${alias}`, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const { initializeApp } = await import('firebase/app');
const { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } = await import('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, serverTimestamp, terminate } = await import('firebase/firestore');
const app = initializeApp({
  apiKey: env.VITE_FB_API_KEY,
  authDomain: env.VITE_FB_AUTH_DOMAIN,
  projectId: env.VITE_FB_PROJECT_ID,
  appId: env.VITE_FB_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const tempPassword = randomBytes(9).toString('base64url');
let owner;
try {
  owner = (await createUserWithEmailAndPassword(auth, args['owner-email'], tempPassword)).user;
  await updateProfile(owner, { displayName: args['owner-name'] });
} catch (e) {
  console.error(
    e?.code === 'auth/email-already-in-use'
      ? `  ${args['owner-email']} already has a sign-in in this project. Delete it in the console (Authentication → Users) and rerun.`
      : e?.code === 'auth/operation-not-allowed'
        ? '  Email/Password sign-in is off. Turn it on (step 4) and rerun with --skip-create.'
        : `  Could not create the owner sign-in: ${e?.code ?? e}`,
  );
  process.exit(1);
}

const baseRules = readFileSync('firestore.rules', 'utf8');
const bootstrapRules = baseRules.replace(
  /\}\s*\}\s*$/,
  `
    // TEMPORARY (setup-shop.mjs): only the new owner may create their own record.
    match /users/{uid} {
      allow create: if request.auth != null && request.auth.uid == uid
        && uid == '${owner.uid}' && request.resource.data.role == 'owner';
    }
  }
}
`,
);
const tmpRules = `.firestore.bootstrap-${Date.now()}.rules`;
const tmpConfig = `.firebase.bootstrap-${Date.now()}.json`;
writeFileSync(tmpRules, bootstrapRules);
writeFileSync(tmpConfig, JSON.stringify({ firestore: { rules: tmpRules, indexes: 'firestore.indexes.json' } }));
try {
  console.log('  Deploying temporary rules for the new owner…');
  firebase('deploy', '--only', 'firestore:rules', '--config', tmpConfig, '--project', projectId);
  await new Promise((r) => setTimeout(r, 15000)); // let the new rules take effect

  await setDoc(doc(db, 'users', owner.uid), {
    name: args['owner-name'],
    email: args['owner-email'],
    role: 'owner',
    active: true,
    mustChangePassword: true,
  });
  // Now an owner exists, so the normal rules allow the settings writes.
  if (!(await getDoc(doc(db, 'settings', 'shop'))).exists()) {
    await setDoc(doc(db, 'settings', 'shop'), {
      name: '',
      phone: '',
      currency: 'LKR',
      vatRegistered: false,
      prefixes: { ticket: 'T', quote: 'Q', invoice: 'INV' },
      numberRestart: 'yearly',
      plan: 'spark',
      setupComplete: false,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'settings', 'public'), { name: '' });
  }
} finally {
  console.log('  Restoring the normal rules…');
  firebase('deploy', '--only', 'firestore:rules', '--project', projectId);
  for (const f of [tmpRules, tmpConfig]) rmSync(f, { force: true });
  await signOut(auth);
  await terminate(db);
}

console.log(`\nDone. ${alias} is live at https://${projectId}.web.app`);
console.log(`Owner: ${args['owner-email']}  temporary password: ${tempPassword}`);
console.log('Give the password to the owner in person; they choose their own, then the setup wizard runs.');
const secret = alias.toUpperCase().replace(/[^A-Z0-9]/g, '_');
console.log(`For CI, add {"alias": "${alias}", "secret": "${secret}"} to shops.json and the repository secret`);
console.log(`ENV_${secret} (contents of .env.${alias}). Deploy credentials for CI are set up separately (see README).`);
process.exit(0);
