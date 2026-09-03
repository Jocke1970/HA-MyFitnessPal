"""MyFitnessPal integration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .coordinator import MyFitnessPalCoordinator

PLATFORMS = [Platform.SENSOR]

_FRONTEND_URL = "/myfitnesspal_static"
_FRONTEND_PATH = Path(__file__).parent / "frontend"
_LOADER_URL = f"{_FRONTEND_URL}/ha-myfitnesspal-loader.js?v=0.4.0-beta.5"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up integration-level frontend resources."""
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                _FRONTEND_URL,
                str(_FRONTEND_PATH),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, _LOADER_URL)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up MyFitnessPal from a config entry."""
    coordinator = MyFitnessPalCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a MyFitnessPal config entry."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False

    coordinator: MyFitnessPalCoordinator = entry.runtime_data
    await hass.async_add_executor_job(coordinator.close)
    return True
