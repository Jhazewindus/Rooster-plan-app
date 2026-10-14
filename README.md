# RoosterPlan

RoosterPlan is a Dutch-language Android tablet app for planning a small animal-care team. Its warm dog-and-cat theme fits a pet boarding setting, while the roster features work for any small team. App data stays on the tablet; it does not need a website, account, or permanent hosting.

## Install on a tablet

Download [RoosterPlan.apk](https://github.com/Jhazewindus/Rooster-plan-app/raw/refs/heads/apk-downloads/RoosterPlan.apk) on the Android tablet and open the downloaded file. Allow the browser to install apps if Android asks. The app requires Android 7.0 or newer. Signed APKs and their checksums are published on the `apk-downloads` branch.

## Build an Android APK

The Android Gradle project is included. On Linux, install Node.js, Java 17, Android SDK Platform 36, and Android build tools. Create a private release keystore and provide its path and credentials through the `ROOSTERPLAN_KEYSTORE_PATH`, `ROOSTERPLAN_KEYSTORE_PASSWORD`, `ROOSTERPLAN_KEY_PASSWORD`, and `ROOSTERPLAN_KEY_ALIAS` environment variables. Do not put the keystore or passwords in GitHub.

```sh
npm ci
npm run typecheck
npm run test:core
npm run build:android:local
```

Gradle builds the release variant, then Android's `zipalign` and `apksigner` prepare and verify the signed APK at `dist/RoosterPlan.apk`. Keep the private key backed up outside GitHub and use the same key for every update so Android can install newer versions over the existing app. The script also checks the package metadata and prints the APK checksum.

The native project compiles with Android SDK 36 but targets API 35. Android 16 can ignore fixed landscape orientation for apps targeting API 36 on large screens; targeting API 35 keeps the intended tablet orientation for this sideloaded APK.

## App flow

1. Add or edit employees, contract hours, roles, and regular hours. Interns have a stage period and are scheduled only alongside a regular employee.
2. Generate or regenerate one week or 1, 6, or 12 months from the team's current availability. Manual shifts can be added, edited, and removed per day.
3. Record, edit, or delete full-day or timed absences. Affected weeks are rebuilt to restore regular shifts; manual shifts and still-valid replacement assignments are retained.
4. Set recurring day or evening break windows by weekday in Settings. Overlapping break minutes are deducted from counted hours for employees and interns.
5. Review ranked replacement suggestions, confirm full or split coverage, finalize a roster, and export a designed PNG.

Planning rules live outside the screen components. The app stores roster data locally on the device, so it works offline and does not sync between devices. Calendar integration, staff accounts, leave requests, and notifications are later work.
