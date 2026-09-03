# Read-only MyFitnessPal API scope

HA-MyFitnessPal intentionally uses MyFitnessPal as the source of truth and exposes data to Home Assistant without writing anything back.

The integration currently depends on [`Rift-Walker/mfp-api`](https://github.com/Rift-Walker/mfp-api), pinned to a known revision. The upstream client exposes several read surfaces that are useful for future Home Assistant features.

## Implemented

### Food diary

`MfpClient.get_food_diary(date)`

Used for:

- individual food entries
- meal names
- serving information
- per-entry nutrient contents
- today's aggregated nutrient totals

One diary request is made per coordinator update.

### Nutrient goals

`MfpClient.get_goals()`

Used for:

- calorie goal
- macro goals
- other nutrient goals when MyFitnessPal supplies them
- remaining values and percentage of goal

One goals request is made per coordinator update.

### Water intake

`MfpClient.get_water(date)`

Used for today's water intake in milliliters. This read uses MyFitnessPal's website JSON endpoint rather than the REST v2 host. The integration treats water as optional/fail-soft so a water-specific failure does not prevent food diary updates.

One water request is made per coordinator update.

## Available in the pinned client, not yet polled by HA-MyFitnessPal

### Exercise diary

`MfpClient.get_exercise_diary(date)`

The upstream client can read exercise diary entries including exercise data, duration and energy. Adding this to the Home Assistant coordinator would add another remote request every polling cycle, so it should be introduced deliberately and tested with real account data.

Likely Home Assistant representation:

- Exercise calories sensor
- Exercise duration sensor
- Exercise diary sensor with normalized entries as attributes

### Weight measurements

`MfpClient.get_measurements(measurement_type="Weight", ...)`

The upstream client can read weight measurements. This is a separate resource from the food diary.

Likely Home Assistant representation:

- Latest weight sensor
- measurement date attribute
- optional historical import only if there is a clear need

### Multi-day nutrition reports

`MfpClient.get_report(start_date, end_date)`

There is no dedicated server-side report endpoint. The upstream helper performs one food-diary request per day and aggregates the results client-side. Because that can multiply API traffic quickly, HA-MyFitnessPal does not currently call it from the normal 15-minute coordinator.

A future history feature should use a separate, lower-frequency update path or local Home Assistant statistics rather than repeatedly re-fetching long date ranges.

## Nutrient fields already available without extra API traffic

The normal food diary can contain more nutrients than the default six sensors. HA-MyFitnessPal normalizes every numeric nutrient returned by MyFitnessPal into the Nutrition diary `totals` attribute.

As of `0.3.0-beta.2`, optional disabled-by-default sensors expose common secondary values when present:

- saturated fat
- polyunsaturated fat
- monounsaturated fat
- trans fat
- cholesterol
- sodium
- potassium
- added sugars

These sensors do **not** add API requests; they reuse the diary data already fetched by the coordinator.

## Intentionally not implemented

HA-MyFitnessPal does not call the write methods exposed by the upstream client, including food logging, deletion, exercise logging, measurements, water updates or goal updates.
