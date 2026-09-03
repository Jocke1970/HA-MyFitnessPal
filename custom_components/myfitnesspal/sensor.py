"""Sensors for MyFitnessPal."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import UnitOfEnergy, UnitOfMass, UnitOfVolume
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import MyFitnessPalCoordinator


@dataclass(frozen=True, kw_only=True)
class MyFitnessPalSensorDescription(SensorEntityDescription):
    """Describe a MyFitnessPal nutrient sensor."""

    nutrient_key: str


PRIMARY_SENSORS: tuple[MyFitnessPalSensorDescription, ...] = (
    MyFitnessPalSensorDescription(
        key="calories",
        translation_key="calories",
        nutrient_key="energy",
        native_unit_of_measurement=UnitOfEnergy.KILO_CALORIE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:fire",
        suggested_display_precision=0,
    ),
    MyFitnessPalSensorDescription(
        key="carbohydrates",
        translation_key="carbohydrates",
        nutrient_key="carbohydrates",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:bread-slice",
        suggested_display_precision=1,
    ),
    MyFitnessPalSensorDescription(
        key="protein",
        translation_key="protein",
        nutrient_key="protein",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:food-steak",
        suggested_display_precision=1,
    ),
    MyFitnessPalSensorDescription(
        key="fat",
        translation_key="fat",
        nutrient_key="fat",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water",
        suggested_display_precision=1,
    ),
    MyFitnessPalSensorDescription(
        key="fiber",
        translation_key="fiber",
        nutrient_key="fiber",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:leaf",
        suggested_display_precision=1,
    ),
    MyFitnessPalSensorDescription(
        key="sugar",
        translation_key="sugar",
        nutrient_key="sugar",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:cube-outline",
        suggested_display_precision=1,
    ),
)


# These values are already present in the normalized diary totals when MFP
# supplies them, so exposing them adds no extra API requests. Keep them disabled
# by default to avoid flooding a new installation with secondary entities.
SECONDARY_SENSORS: tuple[MyFitnessPalSensorDescription, ...] = (
    MyFitnessPalSensorDescription(
        key="saturated_fat",
        translation_key="saturated_fat",
        nutrient_key="saturated_fat",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water",
        suggested_display_precision=1,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="polyunsaturated_fat",
        translation_key="polyunsaturated_fat",
        nutrient_key="polyunsaturated_fat",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water-outline",
        suggested_display_precision=1,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="monounsaturated_fat",
        translation_key="monounsaturated_fat",
        nutrient_key="monounsaturated_fat",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water-outline",
        suggested_display_precision=1,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="trans_fat",
        translation_key="trans_fat",
        nutrient_key="trans_fat",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water-alert",
        suggested_display_precision=1,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="cholesterol",
        translation_key="cholesterol",
        nutrient_key="cholesterol",
        native_unit_of_measurement=UnitOfMass.MILLIGRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:heart-pulse",
        suggested_display_precision=0,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="sodium",
        translation_key="sodium",
        nutrient_key="sodium",
        native_unit_of_measurement=UnitOfMass.MILLIGRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:shaker-outline",
        suggested_display_precision=0,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="potassium",
        translation_key="potassium",
        nutrient_key="potassium",
        native_unit_of_measurement=UnitOfMass.MILLIGRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:flash-outline",
        suggested_display_precision=0,
        entity_registry_enabled_default=False,
    ),
    MyFitnessPalSensorDescription(
        key="added_sugars",
        translation_key="added_sugars",
        nutrient_key="added_sugars",
        native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:cube-scan",
        suggested_display_precision=1,
        entity_registry_enabled_default=False,
    ),
)

SENSORS = PRIMARY_SENSORS + SECONDARY_SENSORS


async def async_setup_entry(
    hass,
    entry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up MyFitnessPal sensors."""
    coordinator: MyFitnessPalCoordinator = entry.runtime_data
    async_add_entities(
        [MyFitnessPalNutrientSensor(coordinator, description) for description in SENSORS]
        + [MyFitnessPalWaterSensor(coordinator), MyFitnessPalDiarySensor(coordinator)]
    )


class MyFitnessPalEntity(CoordinatorEntity[MyFitnessPalCoordinator], SensorEntity):
    """Base entity for MyFitnessPal."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: MyFitnessPalCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.domain_user_id)},
            name="MyFitnessPal",
            manufacturer="MyFitnessPal",
        )


class MyFitnessPalNutrientSensor(MyFitnessPalEntity):
    """Daily nutrient total sensor."""

    entity_description: MyFitnessPalSensorDescription

    def __init__(
        self,
        coordinator: MyFitnessPalCoordinator,
        description: MyFitnessPalSensorDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{coordinator.domain_user_id}_{description.key}"

    @property
    def native_value(self) -> float | None:
        """Return today's nutrient total, preserving missing vs explicit zero."""
        return self.coordinator.data.totals.get(self.entity_description.nutrient_key)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose goal and remaining value when MFP provides enough data."""
        key = self.entity_description.nutrient_key
        goal = self.coordinator.data.goals.get(key)
        remaining = self.coordinator.data.remaining.get(key)
        attrs: dict[str, Any] = {
            "date": self.coordinator.data.date,
            "goal_source": self.coordinator.data.goal_source,
        }
        if goal is not None:
            attrs["goal"] = goal
        if remaining is not None:
            attrs["remaining"] = remaining
        if goal not in (None, 0) and self.native_value is not None:
            attrs["percent_of_goal"] = round((self.native_value / goal) * 100, 1)
        return attrs


class MyFitnessPalWaterSensor(MyFitnessPalEntity):
    """Today's read-only water intake."""

    _attr_translation_key = "water"
    _attr_icon = "mdi:cup-water"
    _attr_native_unit_of_measurement = UnitOfVolume.MILLILITERS
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 0

    def __init__(self, coordinator: MyFitnessPalCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.domain_user_id}_water"

    @property
    def native_value(self) -> float | None:
        """Return today's water intake in milliliters."""
        return self.coordinator.data.water_ml

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose the date represented by the value."""
        return {"date": self.coordinator.data.date}


class MyFitnessPalDiarySensor(MyFitnessPalEntity):
    """Expose a compact read-only view of today's food diary."""

    _attr_translation_key = "diary"
    _attr_icon = "mdi:food-apple-outline"

    def __init__(self, coordinator: MyFitnessPalCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.domain_user_id}_diary"

    @property
    def native_value(self) -> int:
        """Return number of food entries today."""
        return len(self.coordinator.data.entries)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the normalized diary and totals."""
        return {
            "date": self.coordinator.data.date,
            "entries": self.coordinator.data.entries,
            "totals": self.coordinator.data.totals,
            "goals": self.coordinator.data.goals,
            "goal_source": self.coordinator.data.goal_source,
            "remaining": self.coordinator.data.remaining,
            "water_ml": self.coordinator.data.water_ml,
        }
