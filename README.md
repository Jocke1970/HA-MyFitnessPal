# HA-MyFitnessPal

Read-only Home Assistant integration for MyFitnessPal, providing today's nutrition diary, macros and nutrient goals via MyFitnessPal's native mobile API.

> [!IMPORTANT]
> This is an unofficial, experimental integration. It is not affiliated with or endorsed by MyFitnessPal. The underlying mobile API is not officially published and may change without notice.

## Features

- Read-only access to today's MyFitnessPal food diary.
- Daily totals for calories, carbohydrates, protein, fat, fiber and sugar.
- Read-only daily water intake in milliliters.
- Preserves the distinction between a nutrient that is explicitly `0` and a nutrient that MyFitnessPal did not provide.
- Reads MyFitnessPal nutrient goals and exposes goal, remaining amount and percentage of goal when available.
- Exposes a normalized nutrition diary sensor with individual food entries, serving information, nutrients, totals, goals and water intake.
- Polls every 15 minutes.
- Swedish and English entity/config-flow translations.
- Password is used only during initial login or reauthentication and is not stored by the integration.
- Refresh-token authentication is used for subsequent updates.
- No food, weight, exercise, water or goal write methods are called.

## Sensors

The integration currently creates:

- Calories
- Carbohydrates
- Protein
- Fat
- Fiber
- Sugar
- Water
- Nutrition diary

The **Nutrition diary** sensor exposes today's normalized food entries as attributes, including meal, food name, brand, servings, serving size and nutrients. It also exposes daily totals, effective goals, remaining amounts and `water_ml`.

## Lovelace dashboard

The repository includes read-only Lovelace examples inspired by the information hierarchy in the MyFitnessPal app while remaining Home Assistant-native.

The examples provide:

- a calorie card with consumed, goal, remaining and progress bar
- carbohydrates, fat and protein with individual goal progress bars
- a diary card grouped by meal with food entries and calories

They intentionally do **not** include food logging controls because this integration is read-only.

- Swedish: [`examples/lovelace-mfp-dashboard.yaml`](examples/lovelace-mfp-dashboard.yaml)
- English: [`examples/lovelace-mfp-dashboard_en.yaml`](examples/lovelace-mfp-dashboard_en.yaml)

The examples currently require [`custom:button-card`](https://github.com/custom-cards/button-card). Entity IDs may need to be adjusted if Home Assistant generated different IDs in your installation.

## Installation

### Manual installation

1. Copy `custom_components/myfitnesspal` from this repository to:

   ```text
   /config/custom_components/myfitnesspal
   ```

2. Restart Home Assistant.
3. Open **Settings → Devices & services → Add integration**.
4. Search for **MyFitnessPal**.
5. Enter your MyFitnessPal email/username and password.

The password is used for the initial authentication exchange only and is not saved in the Home Assistant config entry. The integration stores the returned refresh token and MyFitnessPal domain user ID so it can renew access without repeatedly using your password.

## Read-only design

This project intentionally treats MyFitnessPal as the place where nutrition data is entered and Home Assistant as a read-only consumer.

The integration currently reads:

- food diary entries
- nutrient totals
- nutrient goals
- water intake

It does **not** expose Home Assistant services or entities for writing data back to MyFitnessPal.

## Dependency

This integration uses [`Rift-Walker/mfp-api`](https://github.com/Rift-Walker/mfp-api), pinned to commit:

```text
89b61eb5bee9062e62ccc98101b1c5527e5c0775
```

Pinning the dependency keeps the Home Assistant integration on a known, tested API-client revision until an update is deliberately made.

## Credits

A major credit goes to **Nathan Walker / Rift-Walker**, creator of [`mfp-api`](https://github.com/Rift-Walker/mfp-api).

`mfp-api` provides the authentication and native MyFitnessPal mobile-API client that makes this Home Assistant integration possible. The upstream project reverse-engineered the API used by the official MyFitnessPal mobile app and documents the relevant REST endpoints and authentication flow.

`mfp-api` is distributed under the MIT License. See the [upstream license](https://github.com/Rift-Walker/mfp-api/blob/main/LICENSE) for details.

## Privacy and security

- Your MyFitnessPal password is not persisted by this integration.
- Home Assistant stores the refresh token in the config entry, like other integration credentials/tokens.
- Nutrition data is fetched directly from MyFitnessPal by your Home Assistant instance.
- This project does not run a proxy, relay or external cloud service of its own.

## Development workflow

- `main` tracks the current tested/stable version.
- `dev` is used for active development and UI experiments before promotion to `main`.

## Current status

Current stable version on `main`: **0.2.1**

Current development version on `dev`: **0.3.0-beta.1**

This is early-stage software built against an unofficial API. Expect changes while the integration is tested and expanded.

## License

HA-MyFitnessPal is released under the MIT License. See [`LICENSE`](LICENSE).
