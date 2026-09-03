# Changelog

## 0.3.0-beta.2

- Add optional read-only sensors for saturated fat, polyunsaturated fat, monounsaturated fat, trans fat, cholesterol, sodium, potassium and added sugars.
- Keep secondary nutrient sensors disabled by default to avoid cluttering new installations.
- Reuse the already-fetched diary totals, so the extra nutrient sensors add no additional MyFitnessPal API requests.
- Add Swedish and English translations for the secondary nutrient sensors.
- Document the currently available read-only API surfaces and likely next development steps.
- Refactor both Lovelace examples to use the Nutrition diary sensor as their single data source.
- Remove the dashboard dependency on language-specific individual nutrient entity IDs.
- Add a compact Water / Fiber / Sugar row to the Swedish and English dashboard examples.
- Harden button-card JavaScript against missing/unknown values instead of treating them as zero or throwing template errors.
- Add tested Swedish and English dashboard screenshots to the repository and README.
- Add dynamic Nutrition details cards to both dashboard examples for secondary nutrients already present in diary totals.
- Hide missing secondary nutrients from the dashboard and hide the whole details card when none are available.
- Tighten the English macro-card label styling so the full Carbohydrates label fits narrow mobile layouts.

## 0.3.0-beta.1

- Add read-only water intake from MyFitnessPal's website JSON endpoint.
- Add a dedicated Water sensor in milliliters.
- Expose `water_ml` on the Nutrition diary sensor.
- Keep water retrieval fail-soft so a water endpoint problem does not take down the core food diary update.
- Add Swedish and English Water sensor translations.

## 0.2.1

- Add a tested Swedish Lovelace dashboard example for calories, macro goals and the daily food diary.
- Add a matching English Lovelace dashboard example.
- Document the `main` / `dev` branch workflow for stable and in-development changes.

## 0.2.0

- Preserve the difference between a missing nutrient value and an explicit zero.
- Read MyFitnessPal nutrient goals.
- Expose `goal`, `remaining`, `percent_of_goal`, and `goal_source` on nutrient sensors when available.
- Expose normalized `goals`, `remaining`, and `goal_source` on the Nutrition diary sensor.
- Use per-day goal overrides when `day_of_week` is an unambiguous English weekday name; otherwise fall back safely to the default goal.

## 0.1.0

- Initial read-only Home Assistant MVP.
- Config flow authentication without storing the MyFitnessPal password.
- Refresh-token based polling.
- Daily food diary retrieval and normalization.
- Calories, carbohydrates, protein, fat, fiber, sugar and Nutrition diary sensors.
- 15-minute polling interval.
- Swedish and English translations.
