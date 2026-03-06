/**
 * firelock198x/module/firelock198x.mjs
 *
 * Main entry point for the Firelock 198X Foundry VTT system.
 * Registers data models, sheets, and hooks.
 */

import { UnitData, TacomData }           from "./data/unit.mjs";
import { WeaponData, SpecialRuleData }   from "./data/weapon.mjs";
import { FirelockUnitSheet }             from "./sheets/unit-sheet.mjs";
import { FirelockWeaponSheet, FirelockSpecialRuleSheet } from "./sheets/weapon-sheet.mjs";

// ─── Init Hook ────────────────────────────────────────────────────────────────
Hooks.once("init", () => {
  console.log("Firelock 198X | Initialising system...");

  // ── Register Actor data models ──────────────────────────────────────────
  Object.assign(CONFIG.Actor.dataModels, {
    unit:  UnitData,
    tacom: TacomData
  });

  // ── Register Item data models ───────────────────────────────────────────
  Object.assign(CONFIG.Item.dataModels, {
    "weapon":       WeaponData,
    "special-rule": SpecialRuleData
  });

  // ── Register Actor sheets ───────────────────────────────────────────────
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Actors.registerSheet("firelock198x", FirelockUnitSheet, {
    types: ["unit", "tacom"],
    makeDefault: true,
    label: "Firelock 198X Unit Sheet"
  });

  // ── Register Item sheets ────────────────────────────────────────────────
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Items.registerSheet("firelock198x", FirelockWeaponSheet, {
    types: ["weapon"],
    makeDefault: true,
    label: "Firelock 198X Weapon Sheet"
  });
  Items.registerSheet("firelock198x", FirelockSpecialRuleSheet, {
    types: ["special-rule"],
    makeDefault: true,
    label: "Firelock 198X Special Rule Sheet"
  });

  // ── Configure token bar tracking ────────────────────────────────────────
  CONFIG.Actor.trackableAttributes = {
    unit: {
      bar: [],           // no HP bar — toughness is fixed
      value: ["pin"]     // show pin as a token value
    },
    tacom: {
      bar: [],
      value: ["pin", "system.command"]
    }
  };

  // ── Register game settings ───────────────────────────────────────────────
  _registerSettings();

  console.log("Firelock 198X | System initialised.");
});

// ─── Ready Hook ───────────────────────────────────────────────────────────────
Hooks.once("ready", () => {
  console.log("Firelock 198X | Ready.");
});

// ─── Combat Tracker Hook ──────────────────────────────────────────────────────
// Firelock 198X doesn't use standard initiative / combat tracker in the
// traditional sense — initiative is rolled per phase. We configure the tracker
// to at minimum support round counting.
Hooks.once("init", () => {
  CONFIG.Combat.initiative = {
    formula: "1d6",
    decimals: 0
  };
});

// ─── Chat Message Hooks ───────────────────────────────────────────────────────
// Clicking "Roll Upkeep Pin" button in chat (if we render one)
Hooks.on("renderChatMessage", (message, html) => {
  // Future: add interactable buttons in chat cards
});

// ─── Settings ─────────────────────────────────────────────────────────────────
function _registerSettings() {
  game.settings.register("firelock198x", "currentPhase", {
    name: "Current Phase",
    hint: "Tracks the active phase of the current round.",
    scope: "world",
    config: false,
    type: Number,
    default: 1  // 1 = Support, 2 = Fire, 3 = Maneuver, 4 = Identification, 5 = CC, 6 = Objective
  });

  game.settings.register("firelock198x", "currentRound", {
    name: "Current Round",
    scope: "world",
    config: false,
    type: Number,
    default: 1
  });

  game.settings.register("firelock198x", "showPhaseReminders", {
    name: "Show Phase Reminder Messages",
    hint: "Post a chat message when the phase advances.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

// ─── Handlebars Helpers ───────────────────────────────────────────────────────
Hooks.once("init", () => {
  // {{times n}} block helper for looping N times
  Handlebars.registerHelper("times", (n, block) => {
    let result = "";
    for (let i = 0; i < n; i++) result += block.fn(i);
    return result;
  });

  // {{ifEq a b}} conditional equality
  Handlebars.registerHelper("ifEq", (a, b, options) =>
    a === b ? options.fn(this) : options.inverse(this)
  );

  // {{add a b}} numeric addition
  Handlebars.registerHelper("add", (a, b) => a + b);

  // {{pinClass index currentPin}} → "pin-filled" or "pin-empty"
  Handlebars.registerHelper("pinClass", (index, pin) =>
    index <= pin ? "pin-filled" : "pin-empty"
  );

  // {{accuracyLabel acc}} → "4+" or "A++" etc.
  Handlebars.registerHelper("accuracyLabel", (acc, isAuto) => {
    if (isAuto) return "A++";
    if (acc <= 1) return "1+";
    if (acc >= 8) return "—";
    return `${acc}+`;
  });

  // {{toKillLabel target}} → "4+" | "++" | "7+"
  Handlebars.registerHelper("toKillLabel", (target) => {
    if (target === 0) return "++";
    if (target >= 8) return "—";
    return `${target}+`;
  });
});
