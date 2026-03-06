/**
 * firelock198x/module/sheets/unit-sheet.mjs
 *
 * Actor sheet for all unit types (unit + tacom).
 * Uses ApplicationV2 / ActorSheetV2 with HandlebarsApplicationMixin.
 */

import { resolveAttack } from "../dice/rolls.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class FirelockUnitSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["firelock198x", "sheet", "actor", "unit"],
    position: { width: 680, height: 620 },
    window: { resizable: true },
    actions: {
      // Weapon actions
      rollAttack:   FirelockUnitSheet.#onRollAttack,
      editWeapon:   FirelockUnitSheet.#onEditWeapon,
      deleteWeapon: FirelockUnitSheet.#onDeleteWeapon,
      spendAmmo:    FirelockUnitSheet.#onSpendAmmo,
      reloadAmmo:   FirelockUnitSheet.#onReloadAmmo,
      // Token actions
      addPin:       FirelockUnitSheet.#onAddPin,
      removePin:    FirelockUnitSheet.#onRemovePin,
      clearPin:     FirelockUnitSheet.#onClearPin,
      toggleDepleted:     FirelockUnitSheet.#onToggleDepleted,
      toggleAirborne:     FirelockUnitSheet.#onToggleAirborne,
      toggleGoneToGround: FirelockUnitSheet.#onToggleGoneToGround,
      toggleIdentified:   FirelockUnitSheet.#onToggleIdentified,
      toggleStationary:   FirelockUnitSheet.#onToggleStationary,
      // Upkeep
      upkeepRemovePin: FirelockUnitSheet.#onUpkeepRemovePin
    }
  };

  /** @inheritDoc */
  static PARTS = {
    form: {
      template: "systems/firelock198x/templates/actor/unit-shell.hbs",
      scrollable: [""]
    }
  };

  /** Tab configuration — V13 format */
  tabGroups = {
    primary: "stats"
  };

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    const { UNIT_CLASSES } = await import("../data/unit.mjs");
    const { WEAPON_TARGETS } = await import("../data/weapon.mjs");

    // ── Tabs ───────────────────────────────────────────────────────────────
    const tabs = {
      stats:   { id: "stats",   label: "Stats",   icon: "fa-solid fa-chart-bar",  active: this.tabGroups.primary === "stats",   cssClass: "" },
      weapons: { id: "weapons", label: "Weapons", icon: "fa-solid fa-crosshairs", active: this.tabGroups.primary === "weapons", cssClass: "" },
      tokens:  { id: "tokens",  label: "Status",  icon: "fa-solid fa-circle-dot", active: this.tabGroups.primary === "tokens",  cssClass: "" },
      notes:   { id: "notes",   label: "Notes",   icon: "fa-solid fa-scroll",     active: this.tabGroups.primary === "notes",   cssClass: "" }
    };
    // Set active tab cssClass
    for (const [key, tab] of Object.entries(tabs)) {
      tab.cssClass = tab.active ? "active" : "";
    }

    // ── Unit class select options ──────────────────────────────────────────
    const unitClassOptions = Object.entries(UNIT_CLASSES).map(([value, label]) => ({
      value, label, selected: value === system.unitClass
    }));

    // ── Weapons ────────────────────────────────────────────────────────────
    const weapons = actor.items.filter(i => i.type === "weapon").map(w => {
      const ws = w.system;
      return {
        id: w.id,
        name: w.name,
        system: ws,
        hasAmmo: ws.ammoMax > 0,
        isOutOfAmmo: ws.ammoMax > 0 && ws.ammoRemaining <= 0,
        hasShotTypes: (ws.shotTypes?.length ?? 0) > 0,
        accuracyLabel: ws.autoHit ? "A++" : `${ws.accuracyStationary}+/${ws.accuracyMoving}+`,
        strengthLabel: `${ws.strengthNormal}/${ws.strengthHalf}`,
        targetLabel: WEAPON_TARGETS[ws.target] ?? ws.target
      };
    });

    // ── Special rules ──────────────────────────────────────────────────────
    const specialRules = actor.items.filter(i => i.type === "special-rule");

    // ── Pin indicators ─────────────────────────────────────────────────────
    const pinArray = Array.from({ length: 6 }, (_, i) => ({
      index: i + 1,
      filled: i < (system.pin ?? 0)
    }));

    // ── Toughness display ──────────────────────────────────────────────────
    const t = system.toughness ?? {};
    const isPlane = system.isPlane ?? false;
    const toughnessDisplay = isPlane ? `${t.front}` : `${t.front}/${t.side}/${t.rear}`;

    return {
      ...context,
      actor,
      system,
      tabs,
      activeTab: this.tabGroups.primary,
      isTacom: actor.type === "tacom",
      unitClassLabel: UNIT_CLASSES[system.unitClass] ?? system.unitClass,
      unitClassOptions,
      toughnessDisplay,
      weapons,
      specialRules,
      pinArray,
      effectiveMove: system.effectiveMove ?? system.move,
      pinAccuracyPenalty: system.pinAccuracyPenalty ?? 0,
      isInfantry: system.isInfantry,
      isVehicle: system.isVehicle,
      isAircraft: system.isAircraft,
      isSquad: system.isSquad,
      isPlane: system.isPlane,
      isHelicopter: system.isHelicopter,
      enrichedNotes: await TextEditor.enrichHTML(system.notes ?? "", { relativeTo: actor })
    };
  }

  // ── Action Handlers (static, bound via DEFAULT_OPTIONS.actions) ────────────

  static async #onRollAttack(event, target) {
    const weaponId = target.dataset.weaponId;
    const weapon = this.document.items.get(weaponId);
    if (!weapon) return ui.notifications.warn(game.i18n.localize("FIRELOCK198X.Errors.NoWeapon"));

    // Build a dialog to select target token, arc, and modifiers
    await FirelockUnitSheet.#showAttackDialog(this.document, weapon);
  }

  static async #onEditWeapon(event, target) {
    const weaponId = target.dataset.weaponId;
    const weapon = this.document.items.get(weaponId);
    weapon?.sheet?.render(true);
  }

  static async #onDeleteWeapon(event, target) {
    const weaponId = target.dataset.weaponId;
    const weapon = this.document.items.get(weaponId);
    if (!weapon) return;
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Weapon" },
      content: `<p>Delete <strong>${weapon.name}</strong>? This cannot be undone.</p>`
    });
    if (confirm) await weapon.delete();
  }

  static async #onSpendAmmo(event, target) {
    const weaponId = target.dataset.weaponId;
    const weapon = this.document.items.get(weaponId);
    if (!weapon) return;
    const current = weapon.system.ammoRemaining;
    if (current <= 0) return ui.notifications.warn(game.i18n.localize("FIRELOCK198X.Errors.OutOfAmmo"));
    await weapon.update({ "system.ammoRemaining": current - 1 });
  }

  static async #onReloadAmmo(event, target) {
    const weaponId = target.dataset.weaponId;
    const weapon = this.document.items.get(weaponId);
    if (!weapon) return;
    await weapon.update({ "system.ammoRemaining": weapon.system.ammoMax });
  }

  static async #onAddPin(event, target) {
    const actor = this.document;
    const current = actor.system.pin ?? 0;
    await actor.update({ "system.pin": Math.min(6, current + 1) });
  }

  static async #onRemovePin(event, target) {
    const actor = this.document;
    const current = actor.system.pin ?? 0;
    await actor.update({ "system.pin": Math.max(0, current - 1) });
  }

  static async #onClearPin(event, target) {
    await this.document.update({ "system.pin": 0 });
  }

  static async #onToggleDepleted(event, target) {
    const actor = this.document;
    await actor.update({ "system.depleted": !actor.system.depleted });
  }

  static async #onToggleAirborne(event, target) {
    const actor = this.document;
    await actor.update({ "system.airborne": !actor.system.airborne });
  }

  static async #onToggleGoneToGround(event, target) {
    const actor = this.document;
    await actor.update({ "system.goneToGround": !actor.system.goneToGround });
  }

  static async #onToggleIdentified(event, target) {
    const actor = this.document;
    await actor.update({ "system.identified": !actor.system.identified });
  }

  static async #onToggleStationary(event, target) {
    const actor = this.document;
    await actor.update({ "system.stationaryFireToken": !actor.system.stationaryFireToken });
  }

  static async #onUpkeepRemovePin(event, target) {
    const { resolveUpkeepPinRemoval } = await import("../dice/rolls.mjs");
    await resolveUpkeepPinRemoval(this.document);
  }

  // ── Attack Dialog ──────────────────────────────────────────────────────────
  static async #showAttackDialog(attacker, weapon) {
    // Gather candidate targets from selected/targeted tokens
    const targetTokens = [...game.user.targets];
    const targetOptions = targetTokens.map(t =>
      `<option value="${t.actor?.id}">${t.name}</option>`
    ).join("") || "<option value=''>No targets selected</option>";

    const ws = weapon.system;
    const hasShotTypes = ws.shotTypes?.length > 0;
    const shotTypeOptions = hasShotTypes
      ? ws.shotTypes.map(st => `<option value="${st.name}">${st.name}</option>`).join("")
      : "";

    const content = `
      <div class="fl-attack-dialog">
        <div class="form-group">
          <label>Target</label>
          <select name="targetId">${targetOptions}</select>
        </div>
        <div class="form-group">
          <label>Target Arc</label>
          <select name="arc">
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="rear">Rear</option>
          </select>
        </div>
        ${hasShotTypes ? `
        <div class="form-group">
          <label>Shot Type</label>
          <select name="shotType">${shotTypeOptions}</select>
        </div>` : ""}
        <div class="form-group">
          <label>Firing Mode</label>
          <select name="stationary">
            <option value="1">Stationary</option>
            <option value="0">Moving</option>
          </select>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="atHalfRange"> Within Half Range</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="blindFire"> Blind Fire</label>
        </div>
        <div class="form-group">
          <label>Cover Modifier (0, -1, -2)</label>
          <select name="coverModifier">
            <option value="0">None (0)</option>
            <option value="-1">-1 (Forest / Building)</option>
            <option value="-2">-2 (Dense / Entrenchment)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Smoke Penalty</label>
          <select name="smokePenalty">
            <option value="0">None</option>
            <option value="-1">-1 (Firing through Smoke)</option>
          </select>
        </div>
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${attacker.name}: ${weapon.name}` },
      content,
      ok: {
        label: "Roll Attack",
        callback: (event, button, dialog) => {
          const form = button.form ?? dialog.querySelector("form") ?? button.closest("form");
          const fd = new FormDataExtended(form ?? button.parentElement);
          return fd.object;
        }
      }
    });

    if (!result) return;

    const targetActor = game.actors.get(result.targetId);
    if (!targetActor) return ui.notifications.warn(game.i18n.localize("FIRELOCK198X.Errors.NoTarget"));

    await resolveAttack({
      weapon,
      shotTypeName: result.shotType ?? null,
      attacker,
      target: targetActor,
      targetArc: result.arc ?? "front",
      stationary: result.stationary === "1",
      atHalfRange: !!result.atHalfRange,
      blindFire: !!result.blindFire,
      coverModifier: parseInt(result.coverModifier) || 0,
      smokePenalty: parseInt(result.smokePenalty) || 0
    });
  }

  /** @inheritDoc — allow dropping weapons and special rules onto the sheet */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type === "Item") {
      const item = await fromUuid(data.uuid);
      if (item && ["weapon", "special-rule"].includes(item.type)) {
        await this.document.createEmbeddedDocuments("Item", [item.toObject()]);
        return;
      }
    }
    return super._onDrop(event);
  }
}
