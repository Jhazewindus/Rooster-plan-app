import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { Auth, getAuth, GoogleAuthProvider, initializeAuth, Persistence, signInWithCredential, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { PlannerData } from '../domain';
import { applyDownloads, baselineFromRemote, CLOUD_SCHEMA_VERSION, CloudPartId, isCloudPartId, parseRemotePart, planSync, RemoteParts, SyncBaseline, SyncPlan, Upload } from './model';

export type CloudConfig = {
  apiKey: string;
  appId: string;
  projectId: string;
  googleWebClientId: string;
  teamId: string;
};

export type SyncResult = {
  data: PlannerData;
  baseline: SyncBaseline;
  plan: SyncPlan;
  applied: boolean;
};

export class CloudConflictError extends Error {
  constructor(public readonly partId: CloudPartId) {
    super(`Cloud-onderdeel ${partId} is intussen door iemand anders gewijzigd.`);
    this.name = 'CloudConflictError';
  }
}

function configured(value: string): boolean { return typeof value === 'string' && value.trim().length > 0; }

function validateConfig(config: CloudConfig): void {
  if (![config.apiKey, config.appId, config.projectId, config.googleWebClientId, config.teamId].every(configured)
    || !/^[A-Za-z0-9_-]{1,100}$/.test(config.teamId)) throw new Error('Firebase-configuratie ontbreekt of is ongeldig.');
}

function firebaseApp(config: CloudConfig): FirebaseApp {
  const name = `roosterplan-cloud-${config.projectId}`;
  return getApps().some((app) => app.name === name)
    ? getApp(name)
    : initializeApp({ apiKey: config.apiKey, appId: config.appId, projectId: config.projectId }, name);
}

function persistentAuth(app: FirebaseApp): Auth {
  // Firebase's public TypeScript entry omits this React Native export; Metro resolves its RN entry at runtime.
  const nativeAuth = firebaseAuth as typeof firebaseAuth & { getReactNativePersistence(storage: typeof AsyncStorage): Persistence };
  try { return initializeAuth(app, { persistence: nativeAuth.getReactNativePersistence(AsyncStorage) }); }
  catch (error) {
    if ((error as { code?: string }).code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
}

/** Inactive until a Firebase project is configured and the app explicitly calls this factory. */
export function createCloudClient(config: CloudConfig) {
  validateConfig(config);
  const app = firebaseApp(config);
  const auth = persistentAuth(app);
  const db = getFirestore(app);
  const teamRef = doc(db, 'teams', config.teamId);
  const partsRef = collection(teamRef, 'parts');
  GoogleSignin.configure({ webClientId: config.googleWebClientId, offlineAccess: false });

  async function requireMember(): Promise<string> {
    await auth.authStateReady();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Log eerst in met een toegestaan Google-account.');
    const team = await getDoc(teamRef);
    const members: unknown = team.data()?.memberUids;
    if (!Array.isArray(members) || members.length > 3 || !members.includes(uid)) throw new Error('Dit account heeft geen toegang tot het roosterteam.');
    return uid;
  }

  async function signInWithGoogle(): Promise<string | null> {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return null;
    const token = response.data.idToken;
    if (!token) throw new Error('Google heeft geen aanmeldtoken teruggegeven.');
    await signInWithCredential(auth, GoogleAuthProvider.credential(token));
    try { return await requireMember(); }
    catch (error) {
      await signOut(auth);
      await GoogleSignin.signOut();
      throw error;
    }
  }

  async function readParts(): Promise<RemoteParts> {
    await requireMember();
    const snapshot = await getDocs(partsRef);
    const parts: RemoteParts = {};
    for (const item of snapshot.docs) {
      if (!isCloudPartId(item.id)) throw new Error(`Onbekend cloud-onderdeel: ${item.id}.`);
      parts[item.id] = parseRemotePart(item.id, item.data());
    }
    return parts;
  }

  async function commitUploads(uploads: Upload[]): Promise<void> {
    if (uploads.length === 0) return;
    const uid = await requireMember();
    // Firestore transactions must read every document before their first write.
    await runTransaction(db, async (transaction) => {
      const documents = await Promise.all(uploads.map(async (upload) => ({
        upload,
        ref: doc(partsRef, upload.id),
      })));
      const current = await Promise.all(documents.map(({ ref }) => transaction.get(ref)));
      documents.forEach(({ upload }, index) => {
        const actual = current[index].exists() ? parseRemotePart(upload.id, current[index].data()).revision : 0;
        if (actual !== upload.expectedRevision) throw new CloudConflictError(upload.id);
      });
      documents.forEach(({ upload, ref }) => {
        // Local model fields may be undefined; Firestore only accepts JSON values.
        const payload = JSON.parse(JSON.stringify(upload.payload)) as typeof upload.payload;
        transaction.set(ref, { schemaVersion: CLOUD_SCHEMA_VERSION, revision: upload.expectedRevision + 1,
          payload, updatedAt: serverTimestamp(), updatedBy: uid });
      });
    });
  }

  async function syncOnce(local: PlannerData, baseline: SyncBaseline): Promise<SyncResult> {
    const remote = await readParts();
    const plan = planSync(local, baseline, remote);
    if (plan.conflicts.length) return { data: local, baseline, plan, applied: false };
    try { await commitUploads(plan.uploads); }
    catch (error) {
      if (error instanceof CloudConflictError) return { data: local, baseline,
        plan: { ...plan, conflicts: [error.partId] }, applied: false };
      throw error;
    }
    const current = plan.uploads.length ? await readParts() : remote;
    const finalPlan = planSync(local, baseline, current);
    if (finalPlan.conflicts.length || finalPlan.uploads.length) return { data: local, baseline, plan: finalPlan, applied: false };
    return { data: applyDownloads(local, finalPlan.downloads), baseline: baselineFromRemote(current), plan: finalPlan, applied: true };
  }

  async function disconnect(): Promise<void> {
    await signOut(auth);
    await GoogleSignin.signOut();
  }

  return { auth, db, signInWithGoogle, readParts, commitUploads, syncOnce, disconnect };
}
