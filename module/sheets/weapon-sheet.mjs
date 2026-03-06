/**
 * firelock198x/module/sheets/weapon-sheet.mjs
 *
 * Item sheet for Weapons and Special Rules.
 */

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class FirelockWeaponSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["firelock198x", "sheet", "item", "weapon"],
    position: { width: 560, height: 520 },
    window: { resizable: true },
    actions: {
      addShotType:    FirelockWeaponSheet.#onAddShotType,
      deleteShotType: FirelockWeaponSheet.#onDeleteShotType
    }
  };

  static PARTS = {
    header: { template: "systems/firelock198x/templates/item/weapon-header.hbs" },
    form:   { template: "systems/firelock198x/templates/item/weapon-form.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;
    const { WEAPON_TARGETS } = await import("../data/weapon.mjs");

    return {
      ...context,
      item,
      system,
      isWeapon: item.type === "weapon",
      isSpecialRule: item.type === "special-rule",
      targetChoices: Object.entries(WEAPON_TARGETS).map(([k, v]) => ({ value: k, label: v })),
      hasShotTypes: (system.shotTypes?.length ?? 0) > 0,
      enrichedDescription: await TextEditor.enrichHTML(system.description ?? "", { relativeTo: item })
    };
  }

  static async #onAddShotType(event, target) {
    const item = this.document;
    const shotTypes = foundry.utils.deepClone(item.system.shotTypes ?? []);
    shotTypes.push({
      name: "New Shot Type",
      target: "",
      accuracyStationary: 4,
      accuracyMoving: 5,
      strengthNormal: 3,
      strengthHalf: 4,
      specialRules: []
    });
    await item.update({ "system.shotTypes": shotTypes });
  }

  static async #onDeleteShotType(event, target) {
    const idx = parseInt(target.dataset.index);
    const item = this.document;
    const shotTypes = foundry.utils.deepClone(item.system.shotTypes ?? []);
    shotTypes.splice(idx, 1);
    await item.update({ "system.shotTypes": shotTypes });
  }
}

// ─── Special Rule Sheet (minimal) ─────────────────────────────────────────────
export class FirelockSpecialRuleSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["firelock198x", "sheet", "item", "special-rule"],
    position: { width: 480, height: 380 },
    window: { resizable: true }
  };

  static PARTS = {
    form: { template: "systems/firelock198x/templates/item/special-rule-form.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    return {
      ...context,
      item,
      system: item.system,
      enrichedDescription: await TextEditor.enrichHTML(item.system.description ?? "", { relativeTo: item })
    };
  }
}
