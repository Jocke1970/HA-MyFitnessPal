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

The upstream client can read exercise diary entries including exercise data, duration, energy and strength-training fields. Adding this to the Home Assistant coordinator would add another remote request every polling cycle, so it should be introduced deliberately and tested with real account data.

Live testing on 2026-09-03 confirmed three distinct kinds of exercise data:

- normal cardio entries with duration, calories, start time and METS
- strength entries with repetition/set/weight data but no duration, start time or calories in the tested entry
- MyFitnessPal partner calorie-adjustment entries, including Garmin Connect metadata

A calorie adjustment is still returned as `type: exercise_entry`, so it must not be counted as a workout. The reliable discriminator in the tested payload is:

```python
entry.get("is_calorie_adjustment") is True
```

The Garmin Connect adjustment payload also exposed partner metadata such as steps, projected calorie burn, partner exercise calories and the partner name. This should be preserved as adjustment metadata rather than mixed into workout totals.

The nested `exercise.deleted` field must not be used as a diary-entry filter. Tested valid diary entries, including a built-in MyFitnessPal exercise and the Garmin calorie adjustment, were returned with `exercise.deleted: true`.

Likely Home Assistant representation:

- Exercise calories sensor counting only real workouts
- Exercise duration sensor counting only workout entries that actually provide duration
- Workout count sensor
- Exercise diary sensor with normalized workout entries as attributes
- Calorie-adjustment metadata kept separately from real workouts

#### Strength-entry normalization

A tested strength entry contained:

- `quantity`
- `sets`
- `reps_per_set`
- `weight_per_set`

The first live test strongly suggests the API field names for sets/reps do not match the MyFitnessPal UI semantics: an entry entered in the UI as 3 sets x 10 reps returned `sets: 10`, `reps_per_set: 3` and `quantity: 30`. A second deliberately asymmetric test should confirm this before the mapping is implemented in production code.

`weight_per_set` was returned as pounds even though the MyFitnessPal UI was being used metrically. Therefore HA-MyFitnessPal must not infer the display unit from country/locale and must not assume that the raw API unit matches the user's MyFitnessPal presentation.

Unit policy for exercise weights:

1. Read and respect the raw unit supplied by MyFitnessPal.
2. Normalize the internal/native value to SI, using kilograms for weight.
3. Preserve the original raw value and raw unit in normalized diary metadata when useful for diagnostics.
4. Let Home Assistant's configured unit system control user-facing presentation rather than deriving units from country codes.

Conceptually:

```yaml
weight_kg: 15.0
raw_weight:
  value: 33.0693
  unit: pounds
```

This keeps the data model deterministic while allowing future Home Assistant sensors/frontend cards to present metric or imperial units correctly.

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
