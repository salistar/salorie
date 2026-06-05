# Salorie — E2E tests (Maestro)

End-to-end UI tests for the Salorie mobile app, written with
[Maestro](https://maestro.mobile.dev) — the simplest mobile UI testing tool
(YAML flows, no native test harness, works on a real device or emulator).

## Install Maestro

```bash
# macOS / Linux / WSL
curl -Ls "https://get.maestro.mobile.dev" | bash

# Windows: install via the above in WSL, or use Maestro in CI.
```

Maestro talks to whatever Android device/emulator `adb devices` shows
(this repo was validated on a connected physical device).

## Run

```bash
# 1) Install a build on the device first:
adb install -r playstore/salorie/apk/salorie-v1.0.0-prod.apk

# 2) Smoke tests (no login required) — these run by default:
maestro test .maestro

# 3) Authenticated flows (tagged `manual`) — need a Clerk test account:
maestro test \
  --env EMAIL=you@example.com \
  --env PASSWORD=yourpassword \
  --include-tags manual \
  .maestro/04-home-dashboard.yaml
```

## Flows

| File | What it covers | Needs login |
|---|---|---|
| `01-launch-and-welcome.yaml` | Cold start → splash → Welcome screen, nav to sign-up | No |
| `02-auth-screens.yaml` | Sign-up & sign-in fields + Google button render | No |
| `04-home-dashboard.yaml` | Home dashboard + bottom tabs after sign-in | Yes |
| `05-log-water.yaml` | Open water logging screen | Yes |
| `06-log-food-manual.yaml` | Open the manual food-log screen | Yes |
| `07-analytics-and-profile.yaml` | Analytics tab + Profile menu items | Yes |
| `subflows/sign-in.yaml` | Reusable sign-in subflow (`--env EMAIL/PASSWORD`) | — |

## Notes

- Flows assume the **UI language is English**. Set the app/device language to
  English first; otherwise the text assertions won't match.
- Smoke flows (`01`, `02`) run with **no backend** and are safe for CI.
- The `manual`-tagged flows hit Clerk/Firebase, so they need a dedicated
  **test account** and network. They're excluded from the default run via
  `config.yaml`.
- Screenshots taken during a run land in `~/.maestro/tests/<timestamp>/`.
- To make the authenticated flows rock-solid, add `testID` props to the key
  controls (e.g. the central log FAB → `testID="log-fab"`, already referenced
  in `06-log-food-manual.yaml`) and switch the text matchers to `id:` matchers.

## CI

Run the smoke flows on every PR with Maestro Cloud or a self-hosted emulator:

```yaml
# .github/workflows/e2e.yml (sketch)
- uses: mobile-dev-inc/action-maestro-cloud@v1
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app-release.apk
    include-tags: smoke
```
