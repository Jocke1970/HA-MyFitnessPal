const HA_MFP_CARD_VERSION = "0.4.0-beta.7";
const HA_MFP_ICON_URL = new URL(`./icon.png?v=${HA_MFP_CARD_VERSION}`, import.meta.url).href;

const I18N = {
  sv: {
    caloriesTitle: "Kalorier",
    remaining: "kvar",
    over: "över",
    carbohydrates: "Kolhydrater",
    fat: "Fett",
    protein: "Protein",
    water: "Vatten",
    fiber: "Fiber",
    sugar: "Socker",
    nutritionDetails: "Näringsdetaljer",
    nutrientValues: "värden",
    saturatedFat: "Mättat fett",
    polyunsaturatedFat: "Fleromättat fett",
    monounsaturatedFat: "Enkelomättat fett",
    transFat: "Transfett",
    cholesterol: "Kolesterol",
    sodium: "Natrium",
    potassium: "Kalium",
    addedSugars: "Tillsatt socker",
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
    caloriesTitle: "Calories",
    remaining: "remaining",
    over: "over",
    carbohydrates: "Carbs",
    fat: "Fat",
    protein: "Protein",
    water: "Water",
    fiber: "Fiber",
    sugar: "Sugar",
    nutritionDetails: "Nutrition details",
    nutrientValues: "values",
    saturatedFat: "Saturated fat",
    polyunsaturatedFat: "Polyunsaturated fat",
    monounsaturatedFat: "Monounsaturated fat",
    transFat: "Trans fat",
    cholesterol: "Cholesterol",
    sodium: "Sodium",
    potassium: "Potassium",
    addedSugars: "Added sugars",
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
    this._nutritionDetailsExpanded = false;
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
      show_nutrition_details: true,
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
    return this._config?.show_training === false ? 8 : 12;
  }

  static getStubConfig() {
    return {
      nutrition_entity: "sensor.myfitnesspal_naringsdagbok",
      exercise_entity: "sensor.ovrigt_myfitnesspal_traningsdagbok",
      language: "sv",
      show_training: true,
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

  _locale() {
    return this._language() === "sv" ? "sv-SE" : "en-US";
  }

  _t() {
    return I18N[this._language()];
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  _number(value) {
    if (value === null || value === undefined || value === "") return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  _formatNumber(value, decimals = 0) {
    const number = this._number(value);
    if (!Number.isFinite(number)) return "–";
    return new Intl.NumberFormat(this._locale(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(number);
  }

  _progress(value, goal) {
    const current = this._number(value);
    const target = this._number(goal);
    if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
      return { primary: 0, overflow: 0, over: false };
    }

    const safeCurrent = Math.max(0, current);
    if (safeCurrent <= target) {
      return {
        primary: Math.min(100, (safeCurrent / target) * 100),
        overflow: 0,
        over: false,
      };
    }

    return {
      primary: (target / safeCurrent) * 100,
      overflow: ((safeCurrent - target) / safeCurrent) * 100,
      over: true,
    };
  }

  _progressBar(value, goal, className, large = false) {
    const progress = this._progress(value, goal);
    const classes = ["track", large ? "large-track" : "", progress.over ? "over-goal" : ""]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="${classes}">
        <div class="fill ${className}-fill" style="width:${progress.primary}%"></div>
        ${progress.over ? `<div class="overflow-fill ${className}-overflow" style="width:${progress.overflow}%"></div>` : ""}
      </div>`;
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
      (a, b) => a.info.rank - b.info.rank || a.info.label.localeCompare(b.info.label, this._locale())
    );
  }

  _portion(item) {
    const servings = this._number(item?.servings);
    const size = item?.serving_size || {};
    const value = this._number(size.value);
    const unit = String(size.unit || "");

    if (!Number.isFinite(servings) || !Number.isFinite(value)) return "";

    const amount = servings * value;
    const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10;
    const lang = this._language();
    const unitMap = lang === "sv"
      ? { piece: "st", pieces: "st", gram: "g", grams: "g", milliliter: "mL", milliliters: "mL" }
      : { piece: "pc", pieces: "pcs", gram: "g", grams: "g", milliliter: "mL", milliliters: "mL" };
    const translatedUnit = unitMap[unit.toLowerCase()] || unit;

    return translatedUnit ? `${this._formatNumber(rounded, 1)} ${translatedUnit}` : this._formatNumber(rounded, 1);
  }

  _weight(valueKg) {
    const value = this._number(valueKg);
    if (!Number.isFinite(value)) return null;

    const massUnit = String(this._hass?.config?.unit_system?.mass || "kg").toLowerCase();
    if (massUnit.startsWith("lb")) {
      return `${this._formatNumber(value * 2.2046226218, 1)} lb`;
    }

    return `${this._formatNumber(value, 1)} kg`;
  }

  _time(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleTimeString(this._locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  _renderCalories(nutritionEntity) {
    const t = this._t();
    const attrs = nutritionEntity?.attributes || {};
    const totals = attrs.totals || {};
    const goals = attrs.goals || {};
    const remaining = attrs.remaining || {};
    const value = this._number(totals.energy);
    const goal = this._number(goals.energy);
    let left = this._number(remaining.energy);

    if (!Number.isFinite(left) && Number.isFinite(value) && Number.isFinite(goal)) {
      left = goal - value;
    }

    const valueText = Number.isFinite(value) ? `${this._formatNumber(value)} kcal` : "–";
    const goalText = Number.isFinite(goal) ? this._formatNumber(goal) : "–";
    const remainingText = Number.isFinite(left) ? this._formatNumber(Math.abs(left)) : "–";
    const remainingLabel = Number.isFinite(left) && left < 0 ? t.over : t.remaining;

    return `
      <ha-card class="mfp-card calories-card">
        <div class="calories-title-row">
          <img class="brand-icon" src="${HA_MFP_ICON_URL}" alt="MyFitnessPal">
          <div class="calories-title">${t.caloriesTitle}</div>
        </div>
        <div class="calories-line">
          <div><span class="main-value">${valueText}</span><span class="muted"> / ${goalText}</span></div>
          <div><span class="remaining-value">${remainingText}</span><span class="muted"> ${remainingLabel}</span></div>
        </div>
        ${this._progressBar(value, goal, "calories", true)}
      </ha-card>`;
  }

  _macroBlock(label, value, goal, className) {
    const valueNumber = this._number(value);
    const goalNumber = this._number(goal);
    const valueText = Number.isFinite(valueNumber) ? `${this._formatNumber(valueNumber)} g` : "–";
    const goalText = Number.isFinite(goalNumber) ? this._formatNumber(goalNumber) : "–";

    return `
      <div class="macro-item">
        <div class="macro-title">${label}</div>
        <div class="macro-value">${valueText} <span>/ ${goalText}</span></div>
        ${this._progressBar(valueNumber, goalNumber, className)}
      </div>`;
  }

  _renderMacros(nutritionEntity) {
    const t = this._t();
    const attrs = nutritionEntity?.attributes || {};
    const totals = attrs.totals || {};
    const goals = attrs.goals || {};

    return `
      <ha-card class="mfp-card macros-card">
        <div class="macro-grid">
          ${this._macroBlock(t.carbohydrates, totals.carbohydrates, goals.carbohydrates, "carbs")}
          ${this._macroBlock(t.fat, totals.fat, goals.fat, "fat")}
          ${this._macroBlock(t.protein, totals.protein, goals.protein, "protein")}
        </div>
      </ha-card>`;
  }

  _smallValue(label, valueText, goalText = "") {
    return `
      <div class="small-item">
        <div class="small-title">${label}</div>
        <div class="small-value">${valueText}${goalText ? `<span>${goalText}</span>` : ""}</div>
      </div>`;
  }

  _renderSmallNutrients(nutritionEntity) {
    const t = this._t();
    const attrs = nutritionEntity?.attributes || {};
    const totals = attrs.totals || {};
    const goals = attrs.goals || {};

    const water = this._number(attrs.water_ml);
    const fiber = this._number(totals.fiber);
    const fiberGoal = this._number(goals.fiber);
    const sugar = this._number(totals.sugar);
    const sugarGoal = this._number(goals.sugar);

    const waterText = Number.isFinite(water) ? `${this._formatNumber(water)} mL` : "–";
    const fiberText = Number.isFinite(fiber) ? `${this._formatNumber(fiber, 1)} g` : "–";
    const fiberGoalText = Number.isFinite(fiberGoal) ? ` / ${this._formatNumber(fiberGoal)} g` : "";
    const sugarText = Number.isFinite(sugar) ? `${this._formatNumber(sugar, 1)} g` : "–";
    const sugarGoalText = Number.isFinite(sugarGoal) ? ` / ${this._formatNumber(sugarGoal)} g` : "";

    return `
      <ha-card class="mfp-card small-card">
        <div class="small-grid">
          ${this._smallValue(t.water, waterText)}
          ${this._smallValue(t.fiber, fiberText, fiberGoalText)}
          ${this._smallValue(t.sugar, sugarText, sugarGoalText)}
        </div>
      </ha-card>`;
  }

  _renderNutritionDetails(nutritionEntity) {
    if (this._config?.show_nutrition_details === false) return "";

    const t = this._t();
    const totals = nutritionEntity?.attributes?.totals || {};
    const defs = [
      ["saturated_fat", t.saturatedFat, "g", 1],
      ["polyunsaturated_fat", t.polyunsaturatedFat, "g", 1],
      ["monounsaturated_fat", t.monounsaturatedFat, "g", 1],
      ["trans_fat", t.transFat, "g", 1],
      ["cholesterol", t.cholesterol, "mg", 0],
      ["sodium", t.sodium, "mg", 0],
      ["potassium", t.potassium, "mg", 0],
      ["added_sugars", t.addedSugars, "g", 1],
    ];

    const rows = defs.flatMap(([key, label, unit, decimals]) => {
      const value = this._number(totals[key]);
      if (!Number.isFinite(value)) return [];
      return [
        `<div class="nutrition-detail-row"><span>${label}</span><b>${this._formatNumber(value, decimals)} ${unit}</b></div>`,
      ];
    });

    if (!rows.length) return "";

    const expanded = this._nutritionDetailsExpanded;
    return `
      <ha-card class="mfp-card nutrition-details-card ${expanded ? "expanded" : ""}">
        <button class="nutrition-details-toggle" type="button" data-action="toggle-nutrition-details">
          <span>${t.nutritionDetails}</span>
          <span class="nutrition-details-summary">${rows.length} ${t.nutrientValues}<span class="chevron">⌄</span></span>
        </button>
        ${expanded ? `<div class="nutrition-details-body">${rows.join("")}</div>` : ""}
      </ha-card>`;
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
        const value = this._number(item?.nutrients?.energy);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      const foods = group.items.map((item) => {
        const kcal = this._number(item?.nutrients?.energy);
        const foodName = this._escape(item?.food || t.unknownFood);
        const brand = item?.brand ? this._escape(item.brand) : "";
        const portion = this._escape(this._portion(item));
        const meta = [brand, portion].filter(Boolean).join(" · ");
        const kcalText = Number.isFinite(kcal) ? `${this._formatNumber(kcal)} kcal` : "–";

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
            <span class="summary-right">${this._formatNumber(mealKcal)} kcal <span class="chevron">⌄</span></span>
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
      const sets = this._number(item?.sets);
      const reps = this._number(item?.reps_per_set);
      const weight = this._weight(item?.weight_kg);
      if (Number.isFinite(sets) && Number.isFinite(reps)) parts.push(`${this._formatNumber(sets)} × ${this._formatNumber(reps)}`);
      if (weight) parts.push(weight);
    } else {
      const minutes = this._number(item?.duration_minutes);
      const calories = this._number(item?.calories);
      if (Number.isFinite(minutes) && minutes > 0) parts.push(`${this._formatNumber(minutes)} min`);
      if (Number.isFinite(calories)) parts.push(`${this._formatNumber(calories)} kcal`);
    }

    return parts.join(" · ") || t.details;
  }

  _workoutDetails(item) {
    const t = this._t();
    const type = String(item?.type || "").toLowerCase();
    const strength = type === "strength";
    const rows = [];

    if (strength) {
      const sets = this._number(item?.sets);
      const reps = this._number(item?.reps_per_set);
      const totalReps = this._number(item?.total_reps);
      const weight = this._weight(item?.weight_kg);
      if (Number.isFinite(sets)) rows.push([t.sets, this._formatNumber(sets)]);
      if (Number.isFinite(reps)) rows.push([t.repsPerSet, this._formatNumber(reps)]);
      if (Number.isFinite(totalReps)) rows.push([t.totalReps, this._formatNumber(totalReps)]);
      if (weight) rows.push([t.weightPerSet, weight]);
    } else {
      const minutes = this._number(item?.duration_minutes);
      const calories = this._number(item?.calories);
      const mets = this._number(item?.mets);
      const start = this._time(item?.start_time);
      const avgHr = this._number(item?.avg_heart_rate);
      const maxHr = this._number(item?.max_heart_rate);
      if (Number.isFinite(minutes) && minutes > 0) rows.push([t.duration, `${this._formatNumber(minutes)} min`]);
      if (Number.isFinite(calories)) rows.push([t.calories, `${this._formatNumber(calories)} kcal`]);
      if (Number.isFinite(mets) && mets > 0) rows.push(["METS", this._formatNumber(mets, 2)]);
      if (start) rows.push([t.start, start]);
      if (Number.isFinite(avgHr)) rows.push([t.avgHeartRate, `${this._formatNumber(avgHr)} bpm`]);
      if (Number.isFinite(maxHr)) rows.push([t.maxHeartRate, `${this._formatNumber(maxHr)} bpm`]);
    }

    return rows
      .map(([label, value]) => `<div class="detail-row"><span>${this._escape(label)}</span><b>${this._escape(value)}</b></div>`)
      .join("");
  }

  _renderTraining(exerciseEntity) {
    const t = this._t();
    const attrs = exerciseEntity?.attributes || {};
    const entries = Array.isArray(attrs.entries) ? attrs.entries : [];
    const kcal = this._number(attrs.exercise_calories);
    const minutes = this._number(attrs.exercise_duration_minutes);
    const summary = [`${entries.length} ${t.pass}`];
    if (Number.isFinite(kcal)) summary.push(`${this._formatNumber(kcal)} kcal`);
    if (Number.isFinite(minutes) && minutes > 0) summary.push(`${this._formatNumber(minutes)} min`);

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

        .calories-card {
          padding: 26px 28px 24px;
          border-radius: var(--ha-card-border-radius, 28px);
        }

        .calories-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }

        .brand-icon {
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          object-fit: contain;
          border-radius: 7px;
        }

        .calories-title {
          font-size: 22px;
          font-weight: 500;
          margin: 0;
        }

        .calories-line {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .main-value {
          font-size: 30px;
          font-weight: 700;
        }

        .remaining-value {
          font-size: 28px;
          font-weight: 700;
        }

        .muted {
          font-size: 22px;
          opacity: .42;
        }

        .track {
          position: relative;
          width: 100%;
          height: 14px;
          border-radius: 999px;
          overflow: hidden;
          background: color-mix(in srgb, var(--primary-text-color) 18%, transparent);
        }

        .fill,
        .overflow-fill {
          position: absolute;
          top: 0;
          bottom: 0;
          transition: width .35s ease;
        }

        .fill {
          left: 0;
          border-radius: inherit;
        }

        .overflow-fill {
          right: 0;
          box-sizing: border-box;
          border-radius: 0 999px 999px 0;
          box-shadow: -4px 0 0 var(--ha-card-background, var(--card-background-color));
        }

        .over-goal .fill {
          border-radius: 999px 0 0 999px;
        }

        .calories-fill { background: #18bdf2; }
        .carbs-fill { background: #00c9bd; }
        .fat-fill { background: #cc62df; }
        .protein-fill { background: #ffac18; }

        .calories-overflow {
          background: repeating-linear-gradient(
            135deg,
            #18bdf2 0 6px,
            color-mix(in srgb, #18bdf2 22%, var(--ha-card-background, var(--card-background-color))) 6px 12px
          );
        }

        .carbs-overflow {
          background: repeating-linear-gradient(
            135deg,
            #00c9bd 0 6px,
            color-mix(in srgb, #00c9bd 22%, var(--ha-card-background, var(--card-background-color))) 6px 12px
          );
        }

        .fat-overflow {
          background: repeating-linear-gradient(
            135deg,
            #cc62df 0 6px,
            color-mix(in srgb, #cc62df 22%, var(--ha-card-background, var(--card-background-color))) 6px 12px
          );
        }

        .protein-overflow {
          background: repeating-linear-gradient(
            135deg,
            #ffac18 0 6px,
            color-mix(in srgb, #ffac18 22%, var(--ha-card-background, var(--card-background-color))) 6px 12px
          );
        }

        .macros-card {
          padding: 24px 26px 26px;
          border-radius: var(--ha-card-border-radius, 28px);
        }

        .macro-grid,
        .small-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }

        .macro-title,
        .small-title {
          font-size: 16px;
          opacity: .72;
          margin-bottom: 7px;
        }

        .macro-value,
        .small-value {
          font-size: 20px;
          font-weight: 700;
          white-space: nowrap;
        }

        .macro-value {
          margin-bottom: 16px;
        }

        .macro-value span,
        .small-value span {
          font-weight: 400;
          opacity: .5;
        }

        .small-card {
          padding: 20px 26px;
        }

        .nutrition-details-card {
          padding: 0;
          overflow: hidden;
        }

        .nutrition-details-toggle {
          appearance: none;
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 24px;
          cursor: pointer;
          text-align: left;
          font: inherit;
          font-size: 18px;
          font-weight: 600;
        }

        .nutrition-details-card.expanded .nutrition-details-toggle {
          border-bottom: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, transparent);
        }

        .nutrition-details-summary {
          flex: 0 0 auto;
          font-size: 13px;
          font-weight: 500;
          opacity: .58;
          white-space: nowrap;
        }

        .nutrition-details-body {
          padding: 4px 24px 16px;
        }

        .nutrition-detail-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 7px 0;
          font-size: 15px;
        }

        .nutrition-detail-row + .nutrition-detail-row {
          border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, transparent);
        }

        .nutrition-detail-row span {
          opacity: .72;
        }

        .nutrition-detail-row b {
          font-weight: 600;
          white-space: nowrap;
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

        @media (max-width: 520px) {
          .calories-card {
            padding: 24px 22px 22px;
          }

          .main-value {
            font-size: 27px;
          }

          .remaining-value {
            font-size: 25px;
          }

          .muted {
            font-size: 18px;
          }

          .macro-grid,
          .small-grid {
            gap: 12px;
          }

          .macro-title,
          .small-title {
            font-size: 14px;
          }

          .macro-value,
          .small-value {
            font-size: 18px;
          }
        }

        @media (max-width: 430px) {
          .mfp-card {
            padding: 18px 16px 20px;
          }

          .calories-card {
            padding: 22px 18px 20px;
          }

          .brand-icon {
            width: 28px;
            height: 28px;
            flex-basis: 28px;
          }

          .calories-title {
            font-size: 20px;
          }

          .calories-line {
            gap: 10px;
          }

          .main-value {
            font-size: 24px;
          }

          .remaining-value {
            font-size: 22px;
          }

          .muted {
            font-size: 16px;
          }

          .macros-card {
            padding: 20px 16px 22px;
          }

          .macro-grid,
          .small-grid {
            gap: 10px;
          }

          .macro-title,
          .small-title {
            font-size: 13px;
          }

          .macro-value,
          .small-value {
            font-size: 16px;
          }

          .track {
            height: 11px;
          }

          .small-card {
            padding: 18px 16px;
          }

          .nutrition-details-toggle {
            padding: 16px;
            gap: 10px;
            font-size: 17px;
          }

          .nutrition-details-body {
            padding: 4px 16px 14px;
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

    const calories = this._renderCalories(nutritionEntity);
    const macros = this._renderMacros(nutritionEntity);
    const smallNutrients = this._renderSmallNutrients(nutritionEntity);
    const nutritionDetails = this._renderNutritionDetails(nutritionEntity);
    const diary = this._renderDiary(nutritionEntity);
    const training =
      this._config.show_training !== false && this._config.exercise_entity
        ? this._renderTraining(exerciseEntity)
        : "";

    this.shadowRoot.innerHTML = `${this._styles()}<div class="stack">${calories}${macros}${smallNutrients}${nutritionDetails}${diary}${training}</div>`;
  }

  _handleClick(event) {
    const path = event.composedPath();
    const target = path.find((node) => node instanceof HTMLElement);
    if (!target) return;

    const actionButton = target.closest?.("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "toggle-nutrition-details") {
        this._nutritionDetailsExpanded = !this._nutritionDetailsExpanded;
        this._render();
        return;
      }
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
    description: "Read-only MyFitnessPal nutrition diary and exercise dashboard for Home Assistant.",
    preview: true,
  });
}

console.info(`%c HA-MyFitnessPal Card ${HA_MFP_CARD_VERSION} `, "color: #18bdf2; font-weight: 700;");
