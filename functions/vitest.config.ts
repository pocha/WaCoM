import {defineConfig} from "vitest/config";

// One shared Firestore/Auth emulator state, mutated across tests in
// declared order — not independent, isolated tests. fileParallelism keeps
// multiple test files (if any are added later) from racing on that shared
// state; within a file vitest already runs tests sequentially by default.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      GCLOUD_PROJECT: "wacom-test",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      WATOBOT_API_BASE: "https://watobot.test",
    },
  },
});
