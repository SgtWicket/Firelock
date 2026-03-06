/**
 * firelock198x/module/dice/rolls.mjs
 *
 * Core attack resolution for Firelock 198X.
 * Handles the full attack sequence:
 *   1. Roll to Hit (Accuracy vs modifiers)
 *   2. Roll to Kill (Strength vs Toughness table)
 *   3. Apply Pin tokens
 *   4. Post result to chat
 */

// ─── Strength vs Toughness Kill Roll Table ────────────────────────────────────
// Returns the to-kill target number given a Strength and Toughness value.
// Per the rules:
//   S >= 8x T  → ++  (auto double-kill) — represented as 0
//   S >= 4x T  → 1+  (auto-kill)        — represented as 1
//   S >= 2x T  → 2+
//   S > T      → 3+
//   S == T     → 4+
//   S < T      → 5+
//   S <= T/2   → 6+
//   S <= T/4   → 7+  (near-impossible)
//
// Special 1+ / 1- encoding:
//   Strength 1+ is stored as 1.1; Strength 1- as 0.9
//   They only differ when directly opposed to each other.
//
export function getToKillTarget(strength, toughness) {
  // Normalise 1+/1- edge cases
  const s = strength;
  const t = toughness;

  if (s === 0) return 8; // no-strength weapons (e.g. Smoke) can't kill

  if (s >= t * 8) return 0;   // ++ (double auto-kill)
  if (s >= t * 4) return 1;   // 1+ (auto-kill)
  if (s >= t * 2) return 2;
  if (s >  t)     return 3;
  if (s === t)    return 4;   // handles 1+ vs 1 specially below
  if (s * 2 >= t) return 5;   // S less than T but >= T/2
  if (s * 4 >= t) return 6;
  return 7;
}

// Handle special 1+ vs 1 / 1- cases:
// 1+ vs 1 → 3+ (S > T)
// 1  vs 1 → 4+
// 1- vs 1 → 5+
// This is handled automatically by the floating point encoding:
//   1.1 > 1.0 → category S > T → 3+
//   0.9 < 1.0 → category S < T → 5+

// ─── Single Die Result Helpers ────────────────────────────────────────────────
/**
 * Roll a single d6 and return whether it meets a target number.
 * @param {number} result - the die face (1-6)
 * @param {number} target - the target number (2-8, 1=auto-success, 0=double-kill, 8=auto-fail)
 * @returns {"overkill"|"hit"|"miss"} — "overkill" is used for ++ results
 */
export function evaluateHit(result, target) {
  if (target <= 0) return "hit"; // A++
  if (target >= 8) return "miss"; // impossible
  return result >= target ? "hit" : "miss";
}

export function evaluateKill(result, target, coverModifier = 0) {
  if (target === 0) return "overkill"; // ++
  if (target >= 8) return "survive";  // 7+ but cover doesn't matter — handled below

  const modified = result + coverModifier; // coverModifier is negative (e.g. -1)

  // "A result of 6 always kills, regardless of cover. See APPENDIX F."
  // (Only applies when target number was NOT 7+)
  if (result === 6 && target < 7) return "kill";

  if (target >= 7) {
    // 7+ — cover can't make it harder than impossible; 6 doesn't auto-kill
    return modified >= 7 ? "kill" : "survive";
  }

  return modified >= target ? "kill" : "survive";
}

// ─── Full Attack Resolution ───────────────────────────────────────────────────
/**
 * Resolve a complete attack from one unit against another.
 *
 * @param {object} params
 * @param {Item}   params.weapon          - The weapon Item being fired
 * @param {string} params.shotTypeName    - Name of selected shot type (optional)
 * @param {Actor}  params.attacker        - The attacking Actor
 * @param {Actor}  params.target          - The defending Actor
 * @param {string} params.targetArc       - "front" | "side" | "rear"
 * @param {boolean} params.stationary     - Is the attacker stationary?
 * @param {boolean} params.atHalfRange    - Is target within half range?
 * @param {boolean} params.blindFire      - Forced to blind-fire?
 * @param {number}  params.coverModifier  - Negative number (e.g. -1 for forest)
 * @param {number}  params.smokePenalty   - -1 if firing through smoke at spotted
 */
export async function resolveAttack({
  weapon,
  shotTypeName = null,
  attacker,
  target,
  targetArc = "front",
  stationary = true,
  atHalfRange = false,
  blindFire = false,
  coverModifier = 0,
  smokePenalty = 0
} = {}) {
  const weaponData = weapon.system;
  const attackerData = attacker.system;
  const targetData = target.system;

  // ── Resolve shot type overrides ──────────────────────────────────────────
  let shotType = null;
  if (shotTypeName && weaponData.shotTypes.length > 0) {
    shotType = weaponData.shotTypes.find(st => st.name === shotTypeName) ?? null;
  }

  const effectiveAccStat = shotType?.accuracyStationary ?? weaponData.accuracyStationary;
  const effectiveAccMov  = shotType?.accuracyMoving     ?? weaponData.accuracyMoving;
  const effectiveStrNorm = shotType?.strengthNormal     ?? weaponData.strengthNormal;
  const effectiveStrHalf = shotType?.strengthHalf       ?? weaponData.strengthHalf;
  const isAutoHit        = weaponData.autoHit;

  // ── Determine Strength ────────────────────────────────────────────────────
  const strength = atHalfRange ? effectiveStrHalf : effectiveStrNorm;

  // ── Determine Toughness ───────────────────────────────────────────────────
  const toughness = targetData.getToughnessForArc?.(targetArc) ?? targetData.toughness?.front ?? 4;

  // ── Build to-hit target ───────────────────────────────────────────────────
  const pinPenalty = attackerData.pinAccuracyPenalty ?? Math.floor((attackerData.pin ?? 0) / 2);
  const toHitTarget = weaponData.getToHitTarget?.({
    stationary, atHalfRange, pinPenalty, smokePenalty, blindFire
  }) ?? 4;

  // ── To-kill target ────────────────────────────────────────────────────────
  const toKillTarget = getToKillTarget(strength, toughness);

  // ── Roll dice ─────────────────────────────────────────────────────────────
  const numDice = weaponData.dice ?? 1;
  const hitRolls = [];
  const killRolls = [];
  let kills = 0;
  let pinAccrued = 0;

  const hitDiceRoll = await new Roll(`${numDice}d6`).evaluate();
  const hitResults = hitDiceRoll.dice[0].results.map(r => r.result);

  for (const result of hitResults) {
    const hitOutcome = isAutoHit ? "hit" : evaluateHit(result, toHitTarget);
    hitRolls.push({ result, outcome: hitOutcome });

    if (hitOutcome === "hit") {
      // Roll to kill
      const killRoll = await new Roll("1d6").evaluate();
      const killResult = killRoll.dice[0].results[0].result;
      const killOutcome = evaluateKill(killResult, toKillTarget, coverModifier);
      killRolls.push({ result: killResult, outcome: killOutcome });

      if (killOutcome === "overkill") {
        kills += 2; // ++ = two automatic kills
        pinAccrued += 3;
      } else if (killOutcome === "kill") {
        kills += 1;
        pinAccrued += 3;
      } else {
        // Hit but survived
        pinAccrued += 3;
      }
    } else {
      // Miss
      pinAccrued += 1;
    }
  }

  // ── Pin cap ───────────────────────────────────────────────────────────────
  // Cannot exceed max pin of 6. Also, if to-kill was 7+, cannot push pin above 2.
  const currentPin = targetData.pin ?? 0;
  let newPin = currentPin + pinAccrued;
  if (toKillTarget >= 7) {
    newPin = Math.min(newPin, 2);
  }
  newPin = Math.min(newPin, 6);
  const actualPinAdded = Math.max(0, newPin - currentPin);

  // ── Apply effects ─────────────────────────────────────────────────────────
  const updates = { "system.pin": newPin };

  // Handle kills
  let killNarrative = null;
  if (kills > 0) {
    const isSquad = targetData.isSquad && !targetData.depleted;
    const isOverkill = killRolls.some(k => k.outcome === "overkill");

    if (isOverkill || !isSquad) {
      // Unit is destroyed
      updates["system.pin"] = 6; // max pin before death marker
      killNarrative = "DESTROYED";
    } else if (isSquad) {
      // Squad survives as depleted team
      updates["system.depleted"] = true;
      updates["system.pin"] = Math.min(6, newPin + 3); // depleting gives 3 pin
      killNarrative = "DEPLETED (now a team)";
    }
  }

  await target.update(updates);

  // ── Build chat message ────────────────────────────────────────────────────
  const chatData = await buildAttackChatMessage({
    attackerName: attacker.name,
    targetName: target.name,
    weaponName: weapon.name,
    shotTypeName,
    toHitTarget,
    toKillTarget,
    strength,
    toughness,
    targetArc,
    coverModifier,
    atHalfRange,
    blindFire,
    stationary,
    hitRolls,
    killRolls,
    kills,
    killNarrative,
    actualPinAdded,
    newPin
  });

  await ChatMessage.create(chatData);

  return { hitRolls, killRolls, kills, pinAdded: actualPinAdded };
}

// ─── Chat Message Builder ─────────────────────────────────────────────────────
async function buildAttackChatMessage(data) {
  const {
    attackerName, targetName, weaponName, shotTypeName,
    toHitTarget, toKillTarget, strength, toughness, targetArc,
    coverModifier, atHalfRange, blindFire, stationary,
    hitRolls, killRolls, kills, killNarrative, actualPinAdded, newPin
  } = data;

  const targetStr = toKillTarget === 0 ? "++"
    : toKillTarget >= 8 ? "impossible"
    : `${toKillTarget}+`;

  const hitStr = toHitTarget <= 1 ? "A++"
    : toHitTarget >= 8 ? "impossible"
    : `${toHitTarget}+`;

  let modifiers = [];
  if (atHalfRange)    modifiers.push("Half Range +1 to hit");
  if (blindFire)      modifiers.push("Blind Fire (6+ base)");
  if (!stationary)    modifiers.push("Moving accuracy");
  if (coverModifier)  modifiers.push(`Cover Modifier ${coverModifier}`);

  // Build hit/kill die rows
  let diceRows = "";
  for (let i = 0; i < hitRolls.length; i++) {
    const h = hitRolls[i];
    const k = killRolls[i];
    const hitClass = h.outcome === "hit" ? "fl-hit" : "fl-miss";
    const hitLabel = h.outcome === "hit" ? "HIT" : "MISS";

    let killText = "";
    if (k) {
      const killClass = k.outcome === "overkill" ? "fl-overkill"
        : k.outcome === "kill" ? "fl-kill"
        : "fl-survive";
      const killLabel = k.outcome === "overkill" ? "OVERKILL ✸✸"
        : k.outcome === "kill" ? "KILL ✸"
        : "Survives";
      killText = `<span class="fl-die-kill ${killClass}">→ [${k.result}] ${killLabel}</span>`;
    }

    diceRows += `<div class="fl-die-row">
      <span class="fl-die-hit ${hitClass}">[${h.result}] ${hitLabel}</span>
      ${killText}
    </div>`;
  }

  let summary = `<strong>${kills} kill${kills !== 1 ? "s" : ""}</strong>, <strong>${actualPinAdded} pin</strong> added (target now at ${newPin} pin)`;
  if (killNarrative) {
    summary += `<br><span class="fl-kill-result">${targetName} — ${killNarrative}</span>`;
  }

  const content = `
    <div class="firelock198x chat-attack">
      <div class="fl-attack-header">
        <span class="fl-attacker">${attackerName}</span>
        fires <span class="fl-weapon">${weaponName}${shotTypeName ? ` (${shotTypeName})` : ""}</span>
        at <span class="fl-target">${targetName}</span>
        <span class="fl-arc">[${targetArc} arc]</span>
      </div>
      <div class="fl-attack-stats">
        S${strength} vs T${toughness} → To Kill: <strong>${targetStr}</strong> |
        To Hit: <strong>${hitStr}</strong>
        ${modifiers.length ? `<br><em>${modifiers.join(", ")}</em>` : ""}
      </div>
      <div class="fl-dice-results">
        ${diceRows}
      </div>
      <div class="fl-attack-summary">${summary}</div>
    </div>
  `;

  return {
    content,
    speaker: ChatMessage.getSpeaker({ actor: game.actors?.getName(attackerName) }),
    rolls: [],
    flags: { "firelock198x": { type: "attack" } }
  };
}

// ─── Quick Support Chat Helpers ───────────────────────────────────────────────
/**
 * Post a pin-removal (upkeep) message to chat.
 */
export async function resolveUpkeepPinRemoval(actor) {
  const data = actor.system;
  const quality = data.quality ?? 3;
  const currentPin = data.pin ?? 0;
  const removed = Math.min(currentPin, quality);
  const newPin = currentPin - removed;

  await actor.update({ "system.pin": newPin });

  await ChatMessage.create({
    content: `<div class="firelock198x chat-upkeep">
      <strong>${actor.name}</strong> — Upkeep: removed ${removed} pin (${currentPin} → ${newPin})
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor })
  });
}
