"""Config flow for MyFitnessPal."""

from __future__ import annotations

import logging

import httpx
from mfp_api import MfpAuth, MfpAuthError, MfpSession
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant

from .const import CONF_DOMAIN_USER_ID, CONF_REFRESH_TOKEN, DOMAIN

_LOGGER = logging.getLogger(__name__)


async def _async_login(
    hass: HomeAssistant, username: str, password: str
) -> MfpSession:
    """Authenticate against MFP without storing the password."""

    def _login() -> MfpSession:
        auth = MfpAuth()
        try:
            return auth.login(username, password)
        finally:
            auth.close()

    return await hass.async_add_executor_job(_login)


class MyFitnessPalConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for MyFitnessPal."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial setup step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            username = user_input[CONF_USERNAME].strip()
            password = user_input[CONF_PASSWORD]

            try:
                session = await _async_login(self.hass, username, password)
            except MfpAuthError:
                errors["base"] = "invalid_auth"
            except httpx.HTTPError:
                errors["base"] = "cannot_connect"
            except Exception:  # pragma: no cover - defensive fallback
                _LOGGER.exception("Unexpected error while authenticating to MyFitnessPal")
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(session.domain_user_id)
                self._abort_if_unique_id_configured()

                refresh_token = session.user_token.refresh_token
                if not refresh_token:
                    errors["base"] = "no_refresh_token"
                else:
                    return self.async_create_entry(
                        title=username,
                        data={
                            CONF_USERNAME: username,
                            CONF_DOMAIN_USER_ID: session.domain_user_id,
                            CONF_REFRESH_TOKEN: refresh_token,
                        },
                    )

        schema = vol.Schema(
            {
                vol.Required(CONF_USERNAME): str,
                vol.Required(CONF_PASSWORD): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_reauth(self, entry_data):
        """Start reauthentication."""
        self._reauth_entry = self.hass.config_entries.async_get_entry(
            self.context["entry_id"]
        )
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None):
        """Confirm reauthentication credentials."""
        errors: dict[str, str] = {}
        entry = self._reauth_entry
        assert entry is not None

        username = entry.data.get(CONF_USERNAME, entry.title)

        if user_input is not None:
            username = user_input[CONF_USERNAME].strip()
            password = user_input[CONF_PASSWORD]
            try:
                session = await _async_login(self.hass, username, password)
            except MfpAuthError:
                errors["base"] = "invalid_auth"
            except httpx.HTTPError:
                errors["base"] = "cannot_connect"
            except Exception:  # pragma: no cover - defensive fallback
                _LOGGER.exception("Unexpected error while reauthenticating MyFitnessPal")
                errors["base"] = "unknown"
            else:
                if session.domain_user_id != entry.data[CONF_DOMAIN_USER_ID]:
                    errors["base"] = "wrong_account"
                elif not session.user_token.refresh_token:
                    errors["base"] = "no_refresh_token"
                else:
                    return self.async_update_reload_and_abort(
                        entry,
                        data_updates={
                            CONF_USERNAME: username,
                            CONF_REFRESH_TOKEN: session.user_token.refresh_token,
                        },
                    )

        schema = vol.Schema(
            {
                vol.Required(CONF_USERNAME, default=username): str,
                vol.Required(CONF_PASSWORD): str,
            }
        )
        return self.async_show_form(
            step_id="reauth_confirm", data_schema=schema, errors=errors
        )
