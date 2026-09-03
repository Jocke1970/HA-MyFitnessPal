"""MyFitnessPal integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .coordinator import MyFitnessPalCoordinator

PLATFORMS = [Platform.SENSOR]


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
