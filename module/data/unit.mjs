/**
 * Data model for all unit types in Firelock 198X.
 * Handles infantry, vehicles, aircraft, and TACOMs.
 */

const { TypeDataModel } = foundry.abstract;
const {
  StringField, NumberField, BooleanField, SchemaField, ArrayField, HTMLField
} = foundry.data.fields;

// ─── Unit Classes ────────────────────────────────────────────────────────────
export const UNIT_CLASSES = {
  "inf":         "Infantry (Team)",
  "inf-squad":   "Infantry (Squad)",
  "vec":         "Vehicle (Tracked)",
  "vec-wheeled": "Vehicle (Wheeled)",
  "vec-carriage":"Vehicle (Carriage)",
  "air":         "Helicopter",
  "air-cap":     "Plane (CAP)",
  "air-cas":     "Plane (CAS)"
};

// ─── Shared base schema used by all units ────────────────────────────────────
function baseUnitSchema() {
  return {
    // Identity
    unitClass: new StringField({
      required: true,
      initial: "inf",
      choices: Object.keys(UNIT_CLASSES)
    }),
    role: new StringField({ required: false, initial: "" }),
    points: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

    // Core statline
    height: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
    spottingDistance: new NumberField({ required: true, integer: true, min: 0, initial: 24 }),
    move: new NumberField({ required: true, integer: true, min: 0, initial: 6 }),
    quality: new NumberField({ required: true, integer: true, min: 1, max: 6, initial: 3 }),

    // Toughness (front/side/rear — planes use front only)
    toughness: new SchemaField({
      front: new NumberField({ required: true, integer: true, min: 1, initial: 6 }),
      side:  new NumberField({ required: true, integer: true, min: 1, initial: 4 }),
      rear:  new NumberField({ required: true, integer: true, min: 1, initial: 4 })
    }),

    // Evasion (aircraft only, ignored for others)
    evasion: new NumberField({ required: false, integer: true, min: 0, initial: 0 }),

    // Game state tokens
    pin: new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 0 }),
    depleted: new BooleanField({ initial: false }),      // squads only
    airborne: new BooleanField({ initial: false }),      // helicopters only
    goneToGround: new BooleanField({ initial: false }),  // infantry only
    stationaryFireToken: new BooleanField({ initial: false }),
    identified: new BooleanField({ initial: true }),     // false = still a blind

    // Notes / description
    notes: new HTMLField({ required: false, initial: "" }),

    // Faction-specific special rules (free text list)
    factionRules: new ArrayField(new StringField())
  };
}

// ─── Standard Unit ───────────────────────────────────────────────────────────
export class UnitData extends TypeDataModel {
  static defineSchema() {
    return {
      ...baseUnitSchema()
    };
  }

  /**
   * Derived data: movement after pin penalty (infantry only)
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    const isInfantry = this.unitClass.startsWith("inf");
    this.effectiveMove = isInfantry
      ? Math.max(0, this.move - this.pin)
      : this.move;

    // Accuracy penalty: -1 per 2 pin tokens
    this.pinAccuracyPenalty = Math.floor(this.pin / 2);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  get isInfantry()  { return this.unitClass.startsWith("inf"); }
  get isVehicle()   { return this.unitClass.startsWith("vec"); }
  get isAircraft()  { return this.unitClass.startsWith("air"); }
  get isSquad()     { return this.unitClass === "inf-squad"; }
  get isWheeled()   { return this.unitClass === "vec-wheeled"; }
  get isCarriage()  { return this.unitClass === "vec-carriage"; }
  get isPlane()     { return this.unitClass === "air-cap" || this.unitClass === "air-cas"; }
  get isHelicopter(){ return this.unitClass === "air"; }
  get atMaxPin()    { return this.pin >= 6; }

  /** Toughness value for a given arc string ('front'|'side'|'rear') */
  getToughnessForArc(arc) {
    return this.toughness[arc] ?? this.toughness.front;
  }
}

// ─── TACOM (extends unit with Command stat) ───────────────────────────────────
export class TacomData extends TypeDataModel {
  static defineSchema() {
    return {
      ...baseUnitSchema(),
      command: new NumberField({ required: true, integer: true, min: 1, initial: 3 }),
      brigadeRadius: new NumberField({ required: true, integer: true, min: 0, initial: 12 }),
      brigadeUnits:  new NumberField({ required: true, integer: true, min: 0, initial: 3 })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const isInfantry = this.unitClass.startsWith("inf");
    this.effectiveMove = isInfantry
      ? Math.max(0, this.move - this.pin)
      : this.move;
    this.pinAccuracyPenalty = Math.floor(this.pin / 2);
  }

  get isInfantry()  { return this.unitClass.startsWith("inf"); }
  get isVehicle()   { return this.unitClass.startsWith("vec"); }
  get isAircraft()  { return this.unitClass.startsWith("air"); }
  get atMaxPin()    { return this.pin >= 6; }
  getToughnessForArc(arc) {
    return this.toughness[arc] ?? this.toughness.front;
  }
}
