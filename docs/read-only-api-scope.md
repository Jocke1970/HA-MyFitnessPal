# Read-only MyFitnessPal API scope

HA-MyFitnessPal intentionally uses MyFitnessPal as the source of truth and exposes data to Home Assistant without writing anything back.

The integration currently depends on [`Rift-Walker/mfp-api`](https://github.com/Rift-Walker/mfp-api), pinned to a known revision. The upstream client exposes several read surfaces that are useful for Home Assistant features.

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
- MyFitnessPal exercise-energy allocation settings used to calculate effective daily calorie and macro targets

One goals request is made per coordinator update.

HA-MyFitnessPal preserves both the selected unadjusted goal bundle (`base_goals`) and the exercise-adjusted daily values (`goals`). When MyFitnessPal is configured to assign exercise energy to the daily budget, real exercise calories and partner calorie-adjustment entries can change the effective daily goal. Macro targets are adjusted with MyFitnessPal's own exercise carbohydrate, fat and protein percentages rather than a hard-coded ratio.

### Water intake

`MfpClient.get_water(date)`

Used for today's water intake in milliliters. This read uses MyFitnessPal's website JSON endpoint rather than the REST v2 host. The integration treats water as optional/fail-soft so a water-specific failure does not prevent food diary updates.

One water request is made per coordinator update.

### Exercise diary

`MfpClient.get_exercise_diary(date)`

Exercise diary support is implemented as an additional read-only request per coordinator update.

Live testing confirmed three distinct kinds of exercise data:

- normal cardio entries with duration, calories, start time and METS
- strength entries with set/repetition/weight data but no duration, start time or calories in the tested entries
- MyFitnessPal partner calorie-adjustment entries, including Garmin Connect metadata

A calorie adjustment is still returned as `type: exercise_entry`, so it must not be counted as exercise. The reliable discriminator in the tested payload is:

```python
entry.get("is_calorie_adjustment") is True
```

The implementation also checks the nested exercise flag as a defensive fallback. Garmin Connect adjustment payloads are preserved separately from real exercise entries and can contain metadata such as steps, projected calorie burn, partner exercise calories and partner name.

The nested `exercise.deleted` field is not used as a diary-entry filter. Tested valid diary entries, including a built-in MyFitnessPal exercise and the Garmin calorie adjustment, were returned with `exercise.deleted: true`.

Home Assistant representation:

- Exercise calories sensor, excluding partner calorie adjustments
- Exercise duration sensor, summing only real entries that provide duration
- Exercise diary sensor whose state is the number of real exercise entries and whose attributes contain normalized exercise entries plus separate calorie-adjustment metadata
- `goal_adjustment_calories` metadata exposing the combined real-exercise/partner value used for effective-goal calculation

Exercise retrieval is fail-soft. If that endpoint fails while food/nutrition still succeeds, the nutrition entities keep updating and the exercise entities become unavailable rather than reporting false zero values.

#### Strength-entry normalization

An explicit asymmetric live test entered **4 Set / 7 Reps / 12 kg** in the MyFitnessPal UI and returned:

- `sets: 4`
- `reps_per_set: 7`
- `quantity: 28`
- `weight_per_set: {unit: pounds, value: 26.4555}`

This confirms the direct field mapping used by the integration:

- MyFitnessPal UI `Set` -> API `sets`
- MyFitnessPal UI `Reps` -> API `reps_per_set`
- API `quantity` -> total repetitions (`sets * reps_per_set` in the tested data)
- MyFitnessPal UI `Vikt` -> API `weight_per_set`

`weight_per_set` was returned as pounds even though the MyFitnessPal UI was being used metrically. The 12 kg test entry returned approximately 26.4555 lb. Therefore HA-MyFitnessPal does not infer the display unit from country/locale and does not assume that the raw API unit matches the user's MyFitnessPal presentation.

Unit policy for exercise weights:

1. Read and respect the raw unit supplied by MyFitnessPal.
2. Normalize the internal value to SI, using kilograms for weight.
3. Preserve the original raw value and raw unit in normalized diary metadata for diagnostics.
4. Let Home Assistant's configured unit system control user-facing presentation where applicable rather than deriving units from country codes.

Conceptually:

```yaml
weight_kg: 12.0
raw_weight:
  value: 26.4555
  unit: pounds
```

No MyFitnessPal exercise write methods are called.

## Available in the pinned client, not polled by HA-MyFitnessPal

### Weight measurements

`MfpClient.get_measurements(measurement_type="Weight", ...)`

The upstream client can read weight measurements. HA-MyFitnessPal deliberately does not poll that endpoint in the current integration.

If weight support is ever added, a likely Home Assistant representation would be a latest-weight sensor with measurement date metadata. Historical import should only be considered if there is a clear need.

### Multi-day nutrition reports

`MfpClient.get_report(start_date, end_date)`

There is no dedicated server-side report endpoint. The upstream helper performs one food-diary request per day and aggregates the results client-side. Because that can multiply API traffic quickly, HA-MyFitnessPal does not call it from the normal 15-minute coordinator.

Any future history feature should use a separate, lower-frequency update path or local Home Assistant statistics rather than repeatedly re-fetching long date ranges.

## Nutrient fields available without extra API traffic

The normal food diary can contain more nutrients than the default six sensors. HA-MyFitnessPal normalizes every numeric nutrient returned by MyFitnessPal into the Nutrition diary `totals` attribute.

Optional disabled-by-default sensors expose common secondary values when present:

- saturated fat
- polyunsaturated fat
- monounsaturated fat
- trans fat
- cholesterol
- sodium
- potassium
- added sugars

These sensors do **not** add API requests; they reuse the diary data already fetched by the coordinator.

## Event-loop safety

The upstream client is synchronous and creates `httpx` clients that may perform blocking SSL certificate loading during construction. HA-MyFitnessPal creates the MyFitnessPal authentication/client objects in Home Assistant's executor during coordinator setup, and normal polling also runs through the executor. This keeps synchronous HTTP-client setup and API calls outside Home Assistant's event loop.

## Intentionally not implemented

HA-MyFitnessPal does not call the write methods exposed by the upstream client, including food logging, deletion, exercise logging, measurements, water updates or goal updates.
