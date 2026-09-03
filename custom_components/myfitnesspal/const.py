"""Constants for the MyFitnessPal integration."""

from datetime import timedelta

DOMAIN = "myfitnesspal"

CONF_DOMAIN_USER_ID = "domain_user_id"
CONF_REFRESH_TOKEN = "refresh_token"

DEFAULT_UPDATE_INTERVAL = timedelta(minutes=15)
