/**
 * Data model for weapons and special rules in Firelock 198X.
 */

const { TypeDataModel } = foundry.abstract;
const {
  StringField, NumberField, BooleanField, SchemaField, ArrayField, HTMLField
} = foundry.data.fields;

// ─── Valid weapon target strings ─────────────────────────────────────────────
export const WEAPON_TARGETS = {
  "all":     "All",
  "inf":     "Infantry",
  "vec":     "Vehicles",
  "air":     "Aircraft",
  "inf/vec": "Inf/Vec",
  "gnd":     "Ground (Radius)"
};

// ─── Shot Type sub-schema ─────────────────────────────────────────────────────
// A weapon may have multiple shot types (e.g. Sabot / HEAT).
// Each shot type overrides some fields of the parent weapon.
function shotTypeSchema() {
  return new SchemaField({
    name: new StringField({ required: true, initial: "Shot Type" }),
    target: new StringField({ required: false, initial: "" }),
    accuracyStationary: new NumberField({ required: false, integer: true, min: 1, max: 7, initial: 4 }),
    accuracyMoving:     new NumberField({ required: false, integer: true, min: 1, max: 7, initial: 5 }),
    strengthNormal:     new NumberField({ required: false, integer: false, min: 0, initial: 0 }),
    strengthHalf:       new NumberField({ required: false, integer: false, min: 0, initial: 0 }),
    specialRules: new ArrayField(new StringField())
  });
}

// ─── Weapon DataModel ─────────────────────────────────────────────────────────
export class WeaponData extends TypeDataModel {
  static defineSchema() {
    return {
      // Weapon identity / placement
      mountNote: new StringField({ required: false, initial: "" }), // e.g. "Turret"

      // Targeting
      target: new StringField({
        required: true,
        initial: "all",
        choices: Object.keys(WEAPON_TARGETS)
      }),

      // Range
      range: new NumberField({ required: true, integer: true, min: 0, initial: 24 }),

      // Accuracy: stored as integer 2-7 (2+ to 7+). 1 = auto-success (1+), 8 = auto-fail (impossible).
      // We represent ++ (auto-hit) as 1 with a flag.
      accuracyStationary: new NumberField({ required: true, integer: true, min: 1, max: 8, initial: 4 }),
      accuracyMoving:     new NumberField({ required: true, integer: true, min: 1, max: 8, initial: 5 }),
      autoHit: new BooleanField({ initial: false }), // true = A++ (always hits)

      // Strength — supports decimal to handle 1+ (stored as 1.1) and 1- (stored as 0.9)
      // Typical integer values 1–20+
      strengthNormal: new NumberField({ required: true, min: 0, initial: 3 }),
      strengthHalf:   new NumberField({ required: true, min: 0, initial: 4 }),

      // Dice (number of attack dice)
      dice: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),

      // Ammo (0 = unlimited)
      ammoMax:       new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      ammoRemaining: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      // Shot types (optional — most weapons won't have these)
      shotTypes: new ArrayField(shotTypeSchema()),

      // Special rules (array of rule name strings, resolved via lookup in module)
      specialRules: new ArrayField(new StringField()),

      // Optional description
      description: new HTMLField({ required: false, initial: "" })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.halfRange = Math.floor(this.range / 2);
    this.hasAmmo = this.ammoMax > 0;
    this.isOutOfAmmo = this.hasAmmo && this.ammoRemaining <= 0;
  }

  /** Return the accuracy target number for a given firing mode, with modifiers.
   * @param {boolean} stationary - whether the firer is stationary
   * @param {boolean} atHalfRange - whether target is within half range
   * @param {number} pinPenalty - accumulated pin accuracy penalty
   * @param {number} smokePenalty - -1 if firing through smoke at spotted target
   * @param {boolean} blindFire - whether forced to blind-fire (6+)
   * @returns {number} final target number (2–8, where 8 = auto-fail)
   */
  getToHitTarget({ stationary = true, atHalfRange = false, pinPenalty = 0, smokePenalty = 0, blindFire = false } = {}) {
    if (this.autoHit) return 1; // A++ always hits

    let base;
    if (blindFire) {
      base = 6; // blind-fire is always 6+, no positive modifiers
      base += pinPenalty;
      base += smokePenalty;
      return Math.min(base, 8); // cap at 8 (impossible)
    }

    base = stationary ? this.accuracyStationary : this.accuracyMoving;
    if (atHalfRange) base -= 1; // +1 bonus = lower number needed
    base += pinPenalty;
    base += smokePenalty;
    return Math.max(1, Math.min(base, 8));
  }
}

// ─── Special Rule DataModel ───────────────────────────────────────────────────
export class SpecialRuleData extends TypeDataModel {
  static defineSchema() {
    return {
      ruleType: new StringField({
        required: true,
        initial: "unit",
        choices: ["unit", "weapon"]
      }),
      description: new HTMLField({ required: false, initial: "" }),
      // For rules with numeric parameters (e.g. "PC (2, Rear)", "APS (4+, 3)")
      param1: new StringField({ required: false, initial: "" }),
      param2: new StringField({ required: false, initial: "" })
    };
  }
}
