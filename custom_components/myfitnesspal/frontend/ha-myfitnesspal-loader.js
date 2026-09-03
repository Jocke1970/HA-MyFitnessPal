const HA_MFP_LOADER_VERSION = "0.4.0-beta.5";

const cardUrl = new URL(
  `./ha-myfitnesspal-card.js?v=${HA_MFP_LOADER_VERSION}`,
  import.meta.url,
);

console.info(
  `%c HA-MyFitnessPal Loader ${HA_MFP_LOADER_VERSION} `,
  "color: #18bdf2; font-weight: 700;",
);

import(cardUrl.href)
  .then(() => {
    if (!customElements.get("ha-myfitnesspal-card")) {
      console.error(
        "HA-MyFitnessPal: card module loaded, but ha-myfitnesspal-card was not registered.",
      );
      return;
    }

    console.info(
      `%c HA-MyFitnessPal Card registered (${HA_MFP_LOADER_VERSION}) `,
      "color: #18bdf2; font-weight: 700;",
    );
  })
  .catch((error) => {
    console.error("HA-MyFitnessPal: failed to load card module", error);
  });
