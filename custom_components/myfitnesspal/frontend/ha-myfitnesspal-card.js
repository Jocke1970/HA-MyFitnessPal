const HA_MFP_CARD_VERSION = "0.4.0-beta.2";

const I18N = {
  sv: {
    diary: "Dagbok",
    training: "Träning",
    showAll: "Se alla",
    hideAll: "Dölj alla",
    noFood: "Ingen mat loggad ännu.",
    noTraining: "Ingen träning loggad ännu.",
    unknownFood: "Okänd mat",
    other: "Övrigt",
    breakfast: "Frukost",
    lunch: "Lunch",
    snacks: "Mellanmål",
    dinner: "Middag",
    eveningSnacks: "Eveningsnacks",
    supplements: "Kosttillskott",
    workout: "Träning",
    strength: "Styrketräning",
    sets: "Set",
    repsPerSet: "Reps/set",
    totalReps: "Totalt reps",
    weightPerSet: "Vikt/set",
    duration: "Tid",
    calories: "Kalorier",
    start: "Start",
    avgHeartRate: "Medelpuls",
    maxHeartRate: "Maxpuls",
    details: "Detaljer",
    pass: "pass",
    configurationError: "HA-MyFitnessPal-kortet saknar en giltig näringsdagbokssensor.",
  },
  en: {
    diary: "Diary",
    training: "Exercise",
    showAll: "See all",
    hideAll: "Hide all",
    noFood: "No food logged yet.",
    noTraining: "No exercise logged yet.",
    unknownFood: "Unknown food",
    other: "Other",
    breakfast: "Breakfast",
    lunch: "Lunch",
    snacks: "Snacks",
    dinner: "Dinner",
    eveningSnacks: "Evening snacks",
    supplements: "Supplements",
    workout: "Exercise",
    strength: "Strength training",
    sets: "Sets",
    repsPerSet: "Reps/set",
    totalReps: "Total reps",
    weightPerSet: "Weight/set",
    duration: "Duration",
    calories: "Calories",
    start: "Start",
    avgHeartRate: "Average HR",
    maxHeartRate: "Max HR",
    details: "Details",
    pass: "workouts",
    configurationError: "The HA-MyFitnessPal card needs a valid nutrition diary entity.",
  },
};

class HAMyFitnessPalCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._expandedMeals = new Set();
    this._expandedWorkouts = new Set();
    this._boundClick = this._handleClick.bind(this);
    this.shadowRoot.addEventListener("click", this._boundClick);
  }

  setConfig(config) {
    if (!config || !config.nutrition_entity) {
      throw new Error("nutrition_entity is required");
    }

    this._config = {
      show_training: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    const previousNutrition = this._entity(this._config?.nutrition_entity);
    const previousExercise = this._entity(this._config?.exercise_entity);

    this._hass = hass;

    const nextNutrition = this._entity(this._config?.nutrition_entity);
    const nextExercise = this._entity(this._config?.exercise_entity);

    if (
      !this.shadowRoot.innerHTML ||
      previousNutrition !== nextNutrition ||
      previousExercise !== nextExercise
    ) {
      this._render();
    }
  }

  getCardSize() {
    return this._config?.show_training === false ? 3 : 6;
  }

  static getStubConfig() {
    return {
      nutrition_entity: "sensor.myfitnesspal_naringsdagbok",
      exercise_entity: "sensor.myfitnesspal_traningsdagbok",
      language: "sv",
    };
  }

  _entity(entityId) {
    if (!entityId || !this._hass?.states) return undefined;
    return this._hass.states[entityId];
  }

  _language() {
    const configured = String(this._config?.language || "").toLowerCase();
    if (configured.startsWith("sv")) return "sv";
    if (configured.startsWith("en")) return "en";

    const hassLanguage = String(this._hass?.locale?.language || "").toLowerCase();
    return hassLanguage.startsWith("sv") ? "sv" : "en";
  }

  _t() {
    return I18N[this._language()];
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  _normalizeMeal(value) {
    return String(value || "Other")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  _mealInfo(raw) {
    const t = this._t();
    const normalized = this._normalizeMeal(raw);
    const defs = [
      { id: "breakfast", rank: 0, label: t.breakfast, aliases: ["breakfast", "frukost"] },
      { id: "lunch", rank: 1, label: t.lunch, aliases: ["lunch"] },
      { id: "snacks", rank: 2, label: t.snacks, aliases: ["snacks", "snack", "mellanmal"] },
      { id: "dinner", rank: 3, label: t.dinner, aliases: ["dinner", "middag"] },
      {
        id: "evening_snacks",
        rank: 4,
        label: t.eveningSnacks,
        aliases: [
          "eveningsnacks",
          "evening snacks",
          "evening snack",
          "kvallssnacks",
          "kvalls snacks",
          "kvallssnack",
        ],
      },
      {
        id: "supplements",
        rank: 5,
        label: t.supplements,
        aliases: ["kosttillskott", "supplements", "supplement"],
      },
    ];

    const match = defs.find((item) => item.aliases.includes(normalized));
    return match
      ? { key: match.id, rank: match.rank, label: match.label }
      : { key: `other:${normalized}`, rank: 100, label: raw || t.other };
  }

  _groupMeals(entries) {
    const grouped = new Map();

    for (const item of entries) {
      const info = this._mealInfo(item?.meal);
      if (!grouped.has(info.key)) grouped.set(info.key, { info, items: [] });
      grouped.get(info.key).items.push(item);
    }

    return [...grouped.values()].sort(
      (a, b) => a.info.rank - b.info.rank || a.info.label.localeCompare(b.info.label)
    );
  }

  _portion(item) {
    const servings = Number(item?.servings);
    const size = item?.serving_size || {};
    const value = Number(size.value);
    const unit = String(size.unit || "");

    if (!Number.isFinite(servings) || !Number.isFinite(value)) return "";

    const amount = servings * value;
    const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10;
    const lang = this._language();
    const unitMap = lang === "sv"
      ? { piece: "st", gram: "g", grams: "g", milliliter: "mL", milliliters: "mL" }
      : { piece: "pc", gram: "g", grams: "g", milliliter: "mL", milliliters: "mL" };
    const translatedUnit = unitMap[unit.toLowerCase()] || unit;

    return translatedUnit ? `${rounded} ${translatedUnit}` : `${rounded}`;
  }

  _weight(valueKg) {
    const value = Number(valueKg);
    if (!Number.isFinite(value)) return null;

    const massUnit = String(this._hass?.config?.unit_system?.mass || "kg").toLowerCase();
    if (massUnit.startsWith("lb")) {
      const pounds = Math.round(value * 2.2046226218 * 10) / 10;
      return `${pounds} lb`;
    }

    const kilograms = Math.round(value * 10) / 10;
    return `${kilograms} kg`;
  }

  _time(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleTimeString(this._language() === "sv" ? "sv-SE" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  _renderDiary(nutritionEntity) {
    const t = this._t();
    const entries = Array.isArray(nutritionEntity?.attributes?.entries)
      ? nutritionEntity.attributes.entries
      : [];
    const groups = this._groupMeals(entries);
    const allExpanded = groups.length > 0 && groups.every((group) => this._expandedMeals.has(group.info.key));

    const rows = groups.map((group) => {
      const key = group.info.key;
      const expanded = this._expandedMeals.has(key);
      const mealKcal = group.items.reduce((sum, item) => {
        const value = Number(item?.nutrients?.energy);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      const foods = group.items.map((item) => {
        const kcal = Number(item?.nutrients?.energy);
        const foodName = this._escape(item?.food || t.unknownFood);
        const brand = item?.brand ? this._escape(item.brand) : "";
        const portion = this._escape(this._portion(item));
        const meta = [brand, portion].filter(Boolean).join(" · ");
        const kcalText = Number.isFinite(kcal) ? `${Math.round(kcal)} kcal` : "–";

        return `
          <div class="food-item">
            <div class="food-copy">
              <div class="food-name">${foodName}</div>
              ${meta ? `<div class="food-meta">${meta}</div>` : ""}
            </div>
            <div class="food-kcal">${kcalText}</div>
          </div>`;
      }).join("");

      return `
        <div class="expand-row ${expanded ? "expanded" : ""}">
          <button class="expand-head meal-toggle" type="button" data-meal-key="${this._escape(key)}">
            <span>${this._escape(group.info.label)}</span>
            <span class="summary-right">${Math.round(mealKcal)} kcal <span class="chevron">⌄</span></span>
          </button>
          ${expanded ? `<div class="expand-body">${foods}</div>` : ""}
        </div>`;
    }).join("");

    return `
      <ha-card class="mfp-card">
        <div class="section-header">
          <span>${t.diary}</span>
          ${groups.length ? `<button class="header-action" type="button" data-action="toggle-all-meals">${allExpanded ? t.hideAll : t.showAll}</button>` : ""}
        </div>
        <div class="section-body">
          ${groups.length ? rows : `<div class="empty">${t.noFood}</div>`}
        </div>
      </ha-card>`;
  }

  _workoutSummary(item) {
    const t = this._t();
    const type = String(item?.type || "").toLowerCase();
    const strength = type === "strength";
    const parts = [];

    if (strength) {
      const sets = Number(item?.sets);
      const reps = Number(item?.reps_per_set);
      const weight = this._weight(item?.weight_kg);
      if (Number.isFinite(sets) && Number.isFinite(reps)) parts.push(`${sets} × ${reps}`);
      if (weight) parts.push(weight);
    } else {
      const minutes = Number(item?.duration_minutes);
      const calories = Number(item?.calories);
      if (Number.isFinite(minutes) && minutes > 0) parts.push(`${Math.round(minutes)} min`);
      if (Number.isFinite(calories)) parts.push(`${Math.round(calories)} kcal`);
    }

    return parts.join(" · ") || t.details;
  }

  _workoutDetails(item) {
    const t = this._t();
    const type = String(item?.type || "").toLowerCase();
    const strength = type === "strength";
    const rows = [];

    if (strength) {
      const sets = Number(item?.sets);
      const reps = Number(item?.reps_per_set);
      const totalReps = Number(item?.total_reps);
      const weight = this._weight(item?.weight_kg);
      if (Number.isFinite(sets)) rows.push([t.sets, sets]);
      if (Number.isFinite(reps)) rows.push([t.repsPerSet, reps]);
      if (Number.isFinite(totalReps)) rows.push([t.totalReps, totalReps]);
      if (weight) rows.push([t.weightPerSet, weight]);
    } else {
      const minutes = Number(item?.duration_minutes);
      const calories = Number(item?.calories);
      const mets = Number(item?.mets);
      const start = this._time(item?.start_time);
      const avgHr = Number(item?.avg_heart_rate);
      const maxHr = Number(item?.max_heart_rate);
      if (Number.isFinite(minutes) && minutes > 0) rows.push([t.duration, `${Math.round(minutes)} min`]);
      if (Number.isFinite(calories)) rows.push([t.calories, `${Math.round(calories)} kcal`]);
      if (Number.isFinite(mets) && mets > 0) rows.push(["METS", Math.round(mets * 100) / 100]);
      if (start) rows.push([t.start, start]);
      if (Number.isFinite(avgHr)) rows.push([t.avgHeartRate, `${Math.round(avgHr)} bpm`]);
      if (Number.isFinite(maxHr)) rows.push([t.maxHeartRate, `${Math.round(maxHr)} bpm`]);
    }

    return rows
      .map(([label, value]) => `<div class="detail-row"><span>${this._escape(label)}</span><b>${this._escape(value)}</b></div>`)
      .join("");
  }

  _renderTraining(exerciseEntity) {
    const t = this._t();
    const attrs = exerciseEntity?.attributes || {};
    const entries = Array.isArray(attrs.entries) ? attrs.entries : [];
    const kcal = Number(attrs.exercise_calories);
    const minutes = Number(attrs.exercise_duration_minutes);
    const summary = [`${entries.length} ${t.pass}`];
    if (Number.isFinite(kcal)) summary.push(`${Math.round(kcal)} kcal`);
    if (Number.isFinite(minutes) && minutes > 0) summary.push(`${Math.round(minutes)} min`);

    const allExpanded = entries.length > 0 && entries.every((item, index) => {
      const key = String(item?.id || index);
      return this._expandedWorkouts.has(key);
    });

    const rows = entries.map((item, index) => {
      const key = String(item?.id || index);
      const expanded = this._expandedWorkouts.has(key);
      const type = String(item?.type || "").toLowerCase();
      const fallbackName = type === "strength" ? t.strength : t.workout;
      const name = this._escape(item?.name || fallbackName);

      return `
        <div class="expand-row ${expanded ? "expanded" : ""}">
          <button class="expand-head workout-toggle" type="button" data-workout-key="${this._escape(key)}">
            <span class="workout-name">${name}</span>
            <span class="summary-right">${this._escape(this._workoutSummary(item))} <span class="chevron">⌄</span></span>
          </button>
          ${expanded ? `<div class="training-body">${this._workoutDetails(item)}</div>` : ""}
        </div>`;
    }).join("");

    return `
      <ha-card class="mfp-card">
        <div class="section-header training-header">
          <span>${t.training}</span>
          <div class="training-header-right">
            <span class="training-summary">${this._escape(summary.join(" · "))}</span>
            ${entries.length ? `<button class="header-action" type="button" data-action="toggle-all-workouts">${allExpanded ? t.hideAll : t.showAll}</button>` : ""}
          </div>
        </div>
        <div class="section-body">
          ${entries.length ? rows : `<div class="empty">${t.noTraining}</div>`}
        </div>
      </ha-card>`;
  }

  _styles() {
    return `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
        }

        .stack {
          display: grid;
          gap: 10px;
        }

        .mfp-card {
          padding: 20px 22px 22px;
          border-radius: var(--ha-card-border-radius, 22px);
          background: var(--ha-card-background, var(--card-background-color));
          box-shadow: var(--ha-card-box-shadow, none);
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
          font-size: 20px;
          font-weight: 600;
        }

        .header-action {
          appearance: none;
          border: 0;
          background: transparent;
          color: var(--primary-color);
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          padding: 5px 2px;
          cursor: pointer;
        }

        .training-header-right {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }

        .training-summary {
          font-size: 13px;
          font-weight: 400;
          opacity: .55;
          white-space: nowrap;
        }

        .expand-row {
          border-radius: 15px;
          background: color-mix(in srgb, var(--primary-text-color) 4.5%, transparent);
          overflow: hidden;
        }

        .expand-row + .expand-row {
          margin-top: 10px;
        }

        .expand-head {
          appearance: none;
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 15px 16px;
          cursor: pointer;
          text-align: left;
          font: inherit;
          font-size: 16px;
          font-weight: 600;
        }

        .expanded .expand-head {
          border-bottom: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, transparent);
        }

        .summary-right {
          flex: 0 0 auto;
          font-size: 14px;
          font-weight: 500;
          opacity: .72;
          white-space: nowrap;
        }

        .chevron {
          display: inline-block;
          margin-left: 7px;
          opacity: .45;
          transition: transform .16s ease;
        }

        .expanded .chevron {
          transform: rotate(180deg);
        }

        .workout-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .expand-body {
          padding: 2px 16px 10px;
        }

        .food-item {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 11px 0;
        }

        .food-item + .food-item,
        .detail-row + .detail-row {
          border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent);
        }

        .food-copy {
          min-width: 0;
          text-align: left;
        }

        .food-name {
          font-size: 15px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .food-meta {
          margin-top: 3px;
          font-size: 13px;
          opacity: .55;
        }

        .food-kcal {
          font-size: 14px;
          opacity: .72;
          white-space: nowrap;
        }

        .training-body {
          padding: 5px 16px 10px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 7px 0;
          font-size: 14px;
        }

        .detail-row span {
          opacity: .6;
        }

        .detail-row b {
          font-weight: 600;
          white-space: nowrap;
        }

        .empty {
          opacity: .6;
          padding: 8px 0;
        }

        .config-error {
          padding: 20px 22px;
          color: var(--error-color);
        }

        @media (max-width: 430px) {
          .mfp-card {
            padding: 18px 16px 20px;
          }

          .section-header {
            gap: 10px;
          }

          .training-header-right {
            gap: 8px;
          }

          .training-summary {
            display: none;
          }

          .expand-head {
            padding: 14px 13px;
          }

          .summary-right {
            font-size: 13px;
          }
        }
      </style>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const t = this._t();
    const nutritionEntity = this._entity(this._config.nutrition_entity);
    const exerciseEntity = this._entity(this._config.exercise_entity);

    if (this._hass && !nutritionEntity) {
      this.shadowRoot.innerHTML = `${this._styles()}<ha-card class="config-error">${t.configurationError}</ha-card>`;
      return;
    }

    const diary = this._renderDiary(nutritionEntity);
    const training =
      this._config.show_training !== false && this._config.exercise_entity
        ? this._renderTraining(exerciseEntity)
        : "";

    this.shadowRoot.innerHTML = `${this._styles()}<div class="stack">${diary}${training}</div>`;
  }

  _handleClick(event) {
    const path = event.composedPath();
    const target = path.find((node) => node instanceof HTMLElement);
    if (!target) return;

    const actionButton = target.closest?.("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "toggle-all-meals") {
        this._toggleAllMeals();
        return;
      }
      if (action === "toggle-all-workouts") {
        this._toggleAllWorkouts();
        return;
      }
    }

    const mealButton = target.closest?.("[data-meal-key]");
    if (mealButton) {
      const key = mealButton.dataset.mealKey;
      if (this._expandedMeals.has(key)) this._expandedMeals.delete(key);
      else this._expandedMeals.add(key);
      this._render();
      return;
    }

    const workoutButton = target.closest?.("[data-workout-key]");
    if (workoutButton) {
      const key = workoutButton.dataset.workoutKey;
      if (this._expandedWorkouts.has(key)) this._expandedWorkouts.delete(key);
      else this._expandedWorkouts.add(key);
      this._render();
    }
  }

  _toggleAllMeals() {
    const nutritionEntity = this._entity(this._config?.nutrition_entity);
    const entries = Array.isArray(nutritionEntity?.attributes?.entries)
      ? nutritionEntity.attributes.entries
      : [];
    const groups = this._groupMeals(entries);
    const allExpanded = groups.length > 0 && groups.every((group) => this._expandedMeals.has(group.info.key));

    if (allExpanded) this._expandedMeals.clear();
    else this._expandedMeals = new Set(groups.map((group) => group.info.key));

    this._render();
  }

  _toggleAllWorkouts() {
    const exerciseEntity = this._entity(this._config?.exercise_entity);
    const entries = Array.isArray(exerciseEntity?.attributes?.entries)
      ? exerciseEntity.attributes.entries
      : [];
    const keys = entries.map((item, index) => String(item?.id || index));
    const allExpanded = keys.length > 0 && keys.every((key) => this._expandedWorkouts.has(key));

    if (allExpanded) this._expandedWorkouts.clear();
    else this._expandedWorkouts = new Set(keys);

    this._render();
  }
}

if (!customElements.get("ha-myfitnesspal-card")) {
  customElements.define("ha-myfitnesspal-card", HAMyFitnessPalCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-myfitnesspal-card")) {
  window.customCards.push({
    type: "ha-myfitnesspal-card",
    name: "HA-MyFitnessPal Card",
    description: "Read-only MyFitnessPal diary and exercise card for Home Assistant.",
    preview: true,
  });
}

console.info(`%c HA-MyFitnessPal Card ${HA_MFP_CARD_VERSION} `, "color: #18bdf2; font-weight: 700;");
