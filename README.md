# RoosterPlan

RoosterPlan is a Dutch-language Android tablet app for planning a small animal-care team. Its warm dog-and-cat theme fits a pet boarding setting, while the roster features work for any small team. App data stays on the tablet; it does not need a website, account, or permanent hosting.

## Build an Android APK

The Android Gradle project is included. On Linux, install Node.js, Java 17, Android SDK Platform 36, and Android build tools. Create a private release keystore and provide its path and credentials through the `ROOSTERPLAN_KEYSTORE_PATH`, `ROOSTERPLAN_KEYSTORE_PASSWORD`, `ROOSTERPLAN_KEY_PASSWORD`, and `ROOSTERPLAN_KEY_ALIAS` environment variables. Do not put the keystore or passwords in GitHub.

```sh
npm ci
npm run typecheck
npm run test:core
npm run build:android:local
```

Gradle builds the release variant, then Android's `zipalign` and `apksigner` prepare and verify the signed APK at `dist/RoosterPlan.apk`. Keep the private key backed up outside GitHub and use the same key for every update so Android can install newer versions over the existing app. The script also checks the package metadata and prints the APK checksum.

## App flow

1. Add employees, contract hours, roles, and regular hours for each weekday.
2. Generate a standard week from the team's availability.
3. Record full-day or timed absences; only affected shift intervals become open.
4. Review ranked replacement suggestions. Conflict and absence checks prevent unsafe assignments, while over-contract hours remain visible as a warning.
5. Confirm full or split replacements, finalize the roster, and export a designed PNG.

Planning rules live outside the screen components. The app stores roster data locally on the device, so it works offline and does not sync between devices. Calendar integration, staff accounts, leave requests, and notifications are later work.
