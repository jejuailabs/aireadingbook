// Firebase web app identifiers supplied by the project owner.
// This module contains configuration only: importing it never loads an SDK,
// initializes Analytics, contacts Firebase, or creates a cloud resource.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyC0ZkXaQmgFQR4RykWblTtx9I-JNZzCDBA',
  authDomain: 'automovie-4498a.firebaseapp.com',
  projectId: 'automovie-4498a',
  storageBucket: 'automovie-4498a.firebasestorage.app',
  messagingSenderId: '962678187965',
  appId: '1:962678187965:web:02d9e4f8e3ad3e63b394d4',
  measurementId: 'G-0V69CVTQRQ'
});

// Configuration availability is not permission to use a billable service.
// These statuses are informational, not an authorization mechanism.
export const firebaseConnection = Object.freeze({
  projectId: firebaseConfig.projectId,
  configured: true,
  initialized: false,
  authentication: 'google' ,
  firestore: 'not-connected',
  storage: 'not-connected',
  analytics: 'disabled'
});
