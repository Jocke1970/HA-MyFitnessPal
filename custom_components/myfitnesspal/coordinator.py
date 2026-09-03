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


@dataclass(slots=True)
class MyFitnessPalData:
    """Normalized daily MyFitnessPal data."""

    date: str
    totals: dict[str, float]
    entries: list[dict[str, Any]]
    goals: dict[str, float]
    goal_source: str
    remaining: dict[str, float]


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

        data = MyFitnessPalData(
            date=target_date.isoformat(),
            totals=totals,
            entries=_normalize_entries(entries),
            goals=goals,
            goal_source=goal_source,
            remaining=_remaining_values(totals, goals),
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
