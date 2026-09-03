"""Data coordinator for MyFitnessPal."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import logging
from numbers import Number
from typing import Any

import httpx
from mfp_api import MfpApiError, MfpAuth, MfpAuthError, MfpClient, MfpSession, TokenInfo

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import (
    CONF_DOMAIN_USER_ID,
    CONF_REFRESH_TOKEN,
    DEFAULT_UPDATE_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

_POUNDS_TO_KG = 0.45359237


@dataclass(slots=True)
class MyFitnessPalData:
    """Normalized daily MyFitnessPal data."""

    date: str
    totals: dict[str, float]
    entries: list[dict[str, Any]]
    goals: dict[str, float]
    goal_source: str
    remaining: dict[str, float]
    water_ml: float | None
    exercise_entries: list[dict[str, Any]] | None
    calorie_adjustments: list[dict[str, Any]] | None
    exercise_calories: float | None
    exercise_duration_minutes: float | None


def _nutrient_value(value: Any) -> float | None:
    """Convert an MFP nutrient value to a simple float."""
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, Number):
        return float(value)
    return None


def _normalize_nutrients(raw: dict[str, Any] | None) -> dict[str, float]:
    """Keep only numeric nutrient values."""
    out: dict[str, float] = {}
    for key, value in (raw or {}).items():
        numeric = _nutrient_value(value)
        if numeric is not None:
            out[key] = numeric
    return out


def _effective_goals(raw: dict[str, Any], target_date: date) -> tuple[dict[str, float], str]:
    """Return the effective numeric nutrition goals for a date.

    MFP provides a default goal plus optional per-day overrides. We only select
    a daily override when its day_of_week can be matched unambiguously; otherwise
    we safely fall back to default_goal.
    """
    selected = raw.get("default_goal") or {}
    source = "default"

    weekday_names = (
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    )
    target_name = weekday_names[target_date.weekday()]
    target_short = target_name[:3]

    for daily in raw.get("daily_goals") or []:
        day = daily.get("day_of_week")
        if not isinstance(day, str):
            continue
        normalized = day.strip().lower()
        if normalized in {target_name, target_short}:
            selected = daily
            source = "daily"
            break

    return _normalize_nutrients(selected), source


def _remaining_values(
    totals: dict[str, float], goals: dict[str, float]
) -> dict[str, float]:
    """Calculate remaining values only where both consumed and goal are known."""
    return {
        key: goal - totals[key]
        for key, goal in goals.items()
        if key in totals
    }


def _normalize_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Trim diary entries to attributes useful in Home Assistant."""
    normalized: list[dict[str, Any]] = []
    for entry in entries:
        food = entry.get("food") or {}
        serving_size = entry.get("serving_size") or {}
        normalized.append(
            {
                "id": entry.get("id"),
                "meal": entry.get("meal_name"),
                "food": food.get("description"),
                "brand": food.get("brand_name"),
                "servings": entry.get("servings"),
                "serving_size": {
                    "value": serving_size.get("value"),
                    "unit": serving_size.get("unit"),
                    "gram_weight": serving_size.get("gram_weight"),
                },
                "nutrients": _normalize_nutrients(entry.get("nutritional_contents")),
            }
        )
    return normalized


def _sum_totals(entries: list[dict[str, Any]]) -> dict[str, float]:
    """Aggregate numeric nutrition values for all diary entries."""
    totals: dict[str, float] = {}
    for entry in entries:
        for key, value in _normalize_nutrients(
            entry.get("nutritional_contents")
        ).items():
            totals[key] = totals.get(key, 0.0) + value
    return totals


def _weight_in_kg(raw: Any) -> float | None:
    """Normalize a MyFitnessPal exercise weight to kilograms."""
    if not isinstance(raw, dict):
        return None

    value = raw.get("value")
    if not isinstance(value, Number):
        return None

    unit = str(raw.get("unit") or "").strip().lower()
    numeric = float(value)

    if unit in {"kilogram", "kilograms", "kg"}:
        return numeric
    if unit in {"gram", "grams", "g"}:
        return numeric / 1000
    if unit in {"pound", "pounds", "lb", "lbs"}:
        return numeric * _POUNDS_TO_KG

    return None


def _is_calorie_adjustment(entry: dict[str, Any]) -> bool:
    """Return whether an exercise diary item is a partner calorie adjustment."""
    exercise = entry.get("exercise") or {}
    return bool(
        entry.get("is_calorie_adjustment")
        or exercise.get("is_calorie_adjustment")
    )


def _normalize_exercise_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Normalize a real cardio or strength exercise diary entry."""
    exercise = entry.get("exercise") or {}
    duration_seconds = entry.get("duration")
    if not isinstance(duration_seconds, Number):
        duration_seconds = None

    raw_weight = entry.get("weight_per_set")
    weight_kg = _weight_in_kg(raw_weight)

    return {
        "id": entry.get("id"),
        "date": entry.get("date"),
        "name": exercise.get("description"),
        "type": exercise.get("type"),
        "mets": _nutrient_value(exercise.get("mets")),
        "duration_seconds": float(duration_seconds) if duration_seconds is not None else None,
        "duration_minutes": round(float(duration_seconds) / 60, 2)
        if duration_seconds is not None
        else None,
        "calories": _nutrient_value(entry.get("energy")),
        "start_time": entry.get("start_time"),
        "created_at": entry.get("created_at"),
        "avg_heart_rate": entry.get("avg_heart_rate"),
        "max_heart_rate": entry.get("max_heart_rate"),
        "sets": entry.get("sets"),
        "reps_per_set": entry.get("reps_per_set"),
        "total_reps": entry.get("quantity"),
        "weight_kg": round(weight_kg, 3) if weight_kg is not None else None,
        "raw_weight": raw_weight if isinstance(raw_weight, dict) else None,
    }


def _normalize_calorie_adjustment(entry: dict[str, Any]) -> dict[str, Any]:
    """Normalize partner calorie-adjustment metadata separately from exercise."""
    exercise = entry.get("exercise") or {}
    contents = entry.get("contents")
    return {
        "id": entry.get("id"),
        "date": entry.get("date"),
        "name": exercise.get("description"),
        "calories": _nutrient_value(entry.get("energy")),
        "created_at": entry.get("created_at"),
        "contents": contents if isinstance(contents, list) else [],
    }


def _normalize_exercise_diary(
    entries: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], float, float]:
    """Split real exercise from calorie adjustments and calculate daily totals."""
    exercise_entries: list[dict[str, Any]] = []
    calorie_adjustments: list[dict[str, Any]] = []

    for entry in entries:
        if _is_calorie_adjustment(entry):
            calorie_adjustments.append(_normalize_calorie_adjustment(entry))
        else:
            exercise_entries.append(_normalize_exercise_entry(entry))

    exercise_calories = sum(
        entry.get("calories") or 0.0 for entry in exercise_entries
    )
    exercise_duration_minutes = sum(
        entry.get("duration_minutes") or 0.0 for entry in exercise_entries
    )

    return (
        exercise_entries,
        calorie_adjustments,
        round(exercise_calories, 2),
        round(exercise_duration_minutes, 2),
    )


class MyFitnessPalCoordinator(DataUpdateCoordinator[MyFitnessPalData]):
    """Coordinate MyFitnessPal polling."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self._auth = MfpAuth()
        stored_session = MfpSession(
            user_token=TokenInfo(
                access_token="",
                refresh_token=entry.data[CONF_REFRESH_TOKEN],
                id_token=None,
                expires_at=0,
            ),
            domain_user_id=entry.data[CONF_DOMAIN_USER_ID],
        )
        self._client = MfpClient(stored_session, self._auth)

        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=DEFAULT_UPDATE_INTERVAL,
        )

    def _fetch(self, target_date: date) -> tuple[MyFitnessPalData, str | None]:
        entries = self._client.get_food_diary(target_date)
        raw_goals = self._client.get_goals()
        totals = _sum_totals(entries)
        goals, goal_source = _effective_goals(raw_goals, target_date)

        # Water is exposed by MFP through a separate website JSON endpoint. Keep
        # it optional so a water-endpoint problem never takes down core diary data.
        water_ml: float | None = None
        try:
            water_ml = _nutrient_value(self._client.get_water(target_date))
        except (MfpApiError, httpx.HTTPError) as err:
            _LOGGER.debug("Could not read MyFitnessPal water intake: %s", err)

        # Exercise uses a separate diary request. Keep it fail-soft so an
        # exercise-specific endpoint problem does not take down nutrition data.
        exercise_entries: list[dict[str, Any]] | None = None
        calorie_adjustments: list[dict[str, Any]] | None = None
        exercise_calories: float | None = None
        exercise_duration_minutes: float | None = None
        try:
            raw_exercise = self._client.get_exercise_diary(target_date)
            (
                exercise_entries,
                calorie_adjustments,
                exercise_calories,
                exercise_duration_minutes,
            ) = _normalize_exercise_diary(raw_exercise)
        except MfpAuthError:
            raise
        except MfpApiError as err:
            if err.response.status_code == 401:
                raise
            _LOGGER.debug("Could not read MyFitnessPal exercise diary: %s", err)
        except httpx.HTTPError as err:
            _LOGGER.debug("Could not read MyFitnessPal exercise diary: %s", err)

        data = MyFitnessPalData(
            date=target_date.isoformat(),
            totals=totals,
            entries=_normalize_entries(entries),
            goals=goals,
            goal_source=goal_source,
            remaining=_remaining_values(totals, goals),
            water_ml=water_ml,
            exercise_entries=exercise_entries,
            calorie_adjustments=calorie_adjustments,
            exercise_calories=exercise_calories,
            exercise_duration_minutes=exercise_duration_minutes,
        )

        # mfp-api 0.1.0 does not expose the current session publicly. The package is
        # pinned to a commit, so this isolated access lets us persist rotated refresh
        # tokens without storing the user's MFP password in Home Assistant.
        refresh_token = self._client._session.user_token.refresh_token  # noqa: SLF001
        return data, refresh_token

    async def _async_update_data(self) -> MyFitnessPalData:
        target_date = dt_util.now().date()

        try:
            data, refresh_token = await self.hass.async_add_executor_job(
                self._fetch, target_date
            )
        except MfpAuthError as err:
            raise ConfigEntryAuthFailed("MyFitnessPal authentication failed") from err
        except MfpApiError as err:
            if err.response.status_code == 401:
                raise ConfigEntryAuthFailed(
                    "MyFitnessPal rejected the authentication token"
                ) from err
            raise UpdateFailed(f"MyFitnessPal API error: {err}") from err
        except httpx.HTTPError as err:
            raise UpdateFailed(f"Could not connect to MyFitnessPal: {err}") from err

        if refresh_token and refresh_token != self.entry.data.get(CONF_REFRESH_TOKEN):
            new_data = {**self.entry.data, CONF_REFRESH_TOKEN: refresh_token}
            self.hass.config_entries.async_update_entry(self.entry, data=new_data)

        return data

    def close(self) -> None:
        """Close HTTP clients."""
        self._client.close()

    @property
    def account_name(self) -> str:
        """Return configured account name."""
        return self.entry.data.get(CONF_USERNAME, self.entry.title)

    @property
    def domain_user_id(self) -> str:
        """Return the MFP domain user ID."""
        return self.entry.data[CONF_DOMAIN_USER_ID]
