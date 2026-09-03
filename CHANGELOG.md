# Changelog

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
