/* global Actors, ActorSheet, Items, ItemSheet, ChatMessage, CONFIG, game, Hooks, Macro, ui, loadTemplates, Handlebars, EntitySheetConfig */
/**
 * DCC
 */

// Import Modules
import DCCActor from './actor.js'
import DCCActorSheet from './actor-sheet.js'
import * as DCCSheets from './actor-sheets-dcc.js'
import DCCItem from './item.js'
import DCCItemSheet from './item-sheet.js'
import DCC from './config.js'
import * as chat from './chat.js'
import * as migrations from './migrations.js'
import DiceChain from './dice-chain.js'
import parser from './parser.js'
import TablePackManager from './tablePackManager.js'

import { registerSystemSettings } from './settings.js'

// Override the template for sheet configuration
class DCCSheetConfig extends EntitySheetConfig {
  /** @override */
  static get defaultOptions () {
    const options = super.defaultOptions
    options.template = 'systems/dcc/templates/sheet-config.html'
    options.tabs.unshift({ navSelector: '.config-tabs', contentSelector: '.config-body', initial: 'this-sheet' })
    return options
  }
}

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
Hooks.once('init', async function () {
  console.log(`DCC | Initializing Dungeon Crawl Classics System\n${DCC.ASCII}`)

  // Override sheet selection dialog
  EntitySheetConfig = DCCSheetConfig // eslint-disable-line no-global-assign

  CONFIG.DCC = DCC

  game.dcc = {
    DCCActor,
    DiceChain,
    rollDCCWeaponMacro, // This is called from macros, don't remove
    getMacroActor // This is called from macros, don't remove
  }

  // Define custom Entity classes
  CONFIG.Actor.entityClass = DCCActor
  CONFIG.Item.entityClass = DCCItem

  // Register sheet application classes
  Actors.unregisterSheet('core', ActorSheet)
  Actors.registerSheet('dcc', DCCActorSheet, { makeDefault: true })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetCleric, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetThief, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetHalfling, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetWarrior, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetWizard, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetDwarf, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetElf, { types: ['Player'] })
  Actors.registerSheet('dcc', DCCSheets.DCCActorSheetGeneric, { types: ['Player'] })
  Items.unregisterSheet('core', ItemSheet)
  Items.registerSheet('dcc', DCCItemSheet)

  // Register shared template for upper level characters
  const templatePaths = [
    'systems/dcc/templates/actor-partial-pc-header.html',
    'systems/dcc/templates/actor-partial-pc-common.html',
    'systems/dcc/templates/actor-partial-pc-equipment.html',
    'systems/dcc/templates/actor-partial-pc-notes.html',
    'systems/dcc/templates/actor-partial-skills.html',
    'systems/dcc/templates/actor-partial-wizard-spells.html',
    'systems/dcc/templates/actor-partial-cleric-spells.html',
    'systems/dcc/templates/item-partial-header.html'
  ]
  loadTemplates(templatePaths)

  // Handlebars helper to format attack bonus correctly
  Handlebars.registerHelper('formatAttackBonus', function (attackBonus) {
    if (!attackBonus) {
      return '+0'
    } else if (attackBonus[0] !== '+' && attackBonus[0] !== '-') {
      return '+' + attackBonus
    }
    return attackBonus
  })

  // Handlebars helper for simple addition
  Handlebars.registerHelper('add', function (object1, object2) {
    return parseInt(object1) + parseInt(object2)
  })

  // Handlebars helper to stringify JSON objects for debugging
  Handlebars.registerHelper('stringify', function (object) {
    return JSON.stringify(object)
  })

  // Handlebars helper for distances with an apostrophe
  Handlebars.registerHelper('distanceFormat', function (object) {
    const fields = String(object).match(/(\d+)'?/)
    if (fields) {
      return fields[1] + '\''
    } else {
      return ''
    }
  })
})

/* -------------------------------------------- */
/*  Post initialization hook                    */
/* -------------------------------------------- */
Hooks.once('ready', async function () {
  // Register system settings - needs to happen after packs are initialised
  await registerSystemSettings()

  // Determine whether a system migration is required and feasible
  const currentVersion = game.settings.get('dcc', 'systemMigrationVersion')
  const NEEDS_MIGRATION_VERSION = 0.21
  const needMigration = (currentVersion <= NEEDS_MIGRATION_VERSION) || (currentVersion === null)

  // Perform the migration
  if (needMigration && game.user.isGM) {
    migrations.migrateWorld()
  }

  // Create manager for disapproval tables and register the system setting
  CONFIG.DCC.disapprovalPacks = new TablePackManager({
    updateHook: async (manager) => {
      // Clear disapproval tables
      CONFIG.DCC.disapprovalTables = {}

      // For each valid pack, update the list of disapproval tables available to a cleric
      for (const packName of manager.packs) {
        const pack = game.packs.get(packName)
        if (pack) {
          await pack.getIndex()
          pack.index.forEach(function (value, key, map) {
            CONFIG.DCC.disapprovalTables[key] = {
              name: value.name,
              path: `${packName}.${value.name}`
            }
          })
        }
      }
    }
  })
  CONFIG.DCC.disapprovalPacks.addPack(game.settings.get('dcc', 'disapprovalCompendium'), true)

  // Create manager for critical hit table packs and register the system setting
  CONFIG.DCC.criticalHitPacks = new TablePackManager()
  CONFIG.DCC.criticalHitPacks.addPack(game.settings.get('dcc', 'critsCompendium'), true)

  // Set fumble table from the system setting
  const fumbleTable = game.settings.get('dcc', 'fumbleTable')
  if (fumbleTable) {
    CONFIG.DCC.fumbleTable = fumbleTable
  }

  // Set mercurial magic table from the system setting
  const mercurialMagicTable = game.settings.get('dcc', 'mercurialMagicTable')
  if (mercurialMagicTable) {
    CONFIG.DCC.mercurialMagicTable = mercurialMagicTable
  }

  // Let modules know the DCC system is ready
  Hooks.callAll('dcc.ready')
})

/* -------------------------------------------- */
/*  Other Hooks                                 */
/* -------------------------------------------- */
// Create a macro when a rollable is dropped on the hotbar
Hooks.on('hotbarDrop', (bar, data, slot) => createDCCMacro(data, slot))

// Highlight 1's and 20's for all regular rolls
Hooks.on('renderChatMessage', (message, html, data) => {
  if (game.user.isGM) {
    message.setFlag('core', 'canPopout', true)
  }
  chat.highlightCriticalSuccessFailure(message, html, data)
})

// Support context menu on chat cards
Hooks.on('getChatLogEntryContext', chat.addChatMessageContextOptions)

// Quick import for actors
Hooks.on('renderActorDirectory', (app, html) => {
  parser.onRenderActorDirectory(app, html)
})

// Disapproval table packs
Hooks.on('dcc.registerDisapprovalPack', (value, fromSystemSetting) => {
  const disapprovalPacks = CONFIG.DCC.disapprovalPacks

  if (disapprovalPacks) {
    disapprovalPacks.addPack(value, fromSystemSetting)
  }
})

// Critical hit table packs
Hooks.on('dcc.registerCriticalHitsPack', (value, fromSystemSetting) => {
  const criticalHitPacks = CONFIG.DCC.criticalHitPacks

  if (criticalHitPacks) {
    criticalHitPacks.addPack(value, fromSystemSetting)
  }
})

// Fumble table
Hooks.on('dcc.setFumbleTable', (value, fromSystemSetting = false) => {
  // Set fumble table if unset, or if applying the system setting (which takes precedence)
  if (fromSystemSetting || !CONFIG.DCC.fumbleTable) {
    CONFIG.DCC.fumbleTable = value
  }
})

// Mercurial Magic mable
Hooks.on('dcc.setMercurialMagicTable', (value, fromSystemSetting = false) => {
  // Set mercurial magic table if unset, or if applying the system setting (which takes precedence)
  if (fromSystemSetting || !CONFIG.DCC.mercurialMagicTable) {
    CONFIG.DCC.mercurialMagicTable = value
  }
})

// Entity creation hook
Hooks.on('createActor', async (entity, options, userId) => {
  if (!game.user.isGM) { return }

  // Assign default DCC actor image
  await entity.update({
    img: 'systems/dcc/styles/images/actor.webp'
  })
})

Hooks.on('createItem', async (entity, options, userId) => {
  if (!game.user.isGM) { return }

  let img = 'systems/dcc/styles/images/item.webp'

  if (entity.type === 'armor') {
    img = 'systems/dcc/styles/images/armor.webp'
  } else if (entity.type === 'treasure') {
    img = 'systems/dcc/styles/images/coins.webp'
  } else if (entity.type === 'weapon') {
    img = 'systems/dcc/styles/images/weapon.webp'
  }

  // Assign default DCC item image
  await entity.update({
    img
  })
})

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from a hotbar drop.
 * Dispatch to the appropriate function for the item type
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createDCCMacro (data, slot) {
  const handlers = {
    Ability: _createDCCAbilityMacro,
    Initiative: _createDCCInitiativeMacro,
    'Hit Dice': _createDCCHitDiceMacro,
    Save: _createDCCSaveMacro,
    Skill: _createDCCSkillMacro,
    'Luck Die': _createDCCLuckDieMacro,
    'Spell Check': _createDCCSpellCheckMacro,
    'Attack Bonus': _createDCCAttackBonusMacro,
    'Action Dice': _createDCCActionDiceMacro,
    Weapon: _createDCCWeaponMacro,
    'Apply Disapproval': _createDCCApplyDisapprovalMacro,
    'Roll Disapproval': _createDCCRollDisapprovalMacro
  }
  if (!handlers[data.type]) return
  if (!('data' in data)) return ui.notifications.warn('You can only create macro buttons for owned items')

  // Call the appropriate function to generate a macro
  const macroData = handlers[data.type](data, slot)
  if (macroData) {
    // Create or reuse existing macro
    let macro = game.macros.entities.find(
      m => (m.name === macroData.name) && (m.command === macroData.command)
    )
    if (!macro) {
      macro = await Macro.create({
        name: macroData.name,
        type: 'script',
        img: macroData.img,
        command: macroData.command,
        flags: { 'dcc.itemMacro': true }
      })
    }
    await game.user.assignHotbarMacro(macro, slot)
  }
  return false
}

/**
 * Create a macro from an ability check drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCAbilityMacro (data, slot) {
  if (data.type !== 'Ability') return

  // Create the macro command
  const abilityId = data.data.abilityId
  const rollUnder = data.data.rollUnder
  const macroData = {
    name: game.i18n.localize(CONFIG.DCC.abilities[abilityId]),
    command: `const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollAbilityCheck("${abilityId}", { rollUnder: ${rollUnder} } ) }`,
    img: 'icons/dice/d20black.svg'
  }

  // If this is a roll under check make it clear in the macro name
  if (rollUnder) {
    macroData.name = game.i18n.format('DCC.RollUnder', { name: macroData.name })
  }

  return macroData
}

/**
 * Create a macro from an initiative drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCInitiativeMacro (data, slot) {
  if (data.type !== 'Initiative') return

  // Create the macro command
  const macroData = {
    name: game.i18n.localize('DCC.Initiative'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollInitiative(token) }',
    img: 'icons/svg/up.svg'
  }

  return macroData
}

/**
 * Create a macro from a hit dice drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCHitDiceMacro (data, slot) {
  if (data.type !== 'Hit Dice') return

  // Create the macro command
  const macroData = {
    name: game.i18n.localize('DCC.HitDiceRoll'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollHitDice() }',
    img: 'icons/dice/d4black.svg'
  }

  return macroData
}

/**
 * Create a macro from a saving throw drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCSaveMacro (data, slot) {
  if (data.type !== 'Save') return

  // Create the macro command
  const saveId = data.data
  const macroData = {
    name: game.i18n.localize(CONFIG.DCC.saves[saveId]),
    command: `const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollSavingThrow("${saveId}") }`,
    img: 'icons/svg/shield.svg'
  }

  return macroData
}

/**
 * Create a macro from a skill roll drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCSkillMacro (data, slot) {
  if (data.type !== 'Skill') return

  // Create the macro command
  const skillId = data.data.skillId
  const skillName = game.i18n.localize(data.data.skillName)
  const macroData = {
    name: skillName,
    command: `const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollSkillCheck("${skillId}") }`,
    img: 'icons/dice/d20black.svg'
  }

  return macroData
}

/**
 * Create a macro from a luck die drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCLuckDieMacro (data, slot) {
  if (data.type !== 'Luck Die') return

  // Create the macro command
  const macroData = {
    name: game.i18n.localize('DCC.LuckDie'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollLuckDie() }',
    img: 'icons/dice/d4black.svg'
  }

  return macroData
}

/**
 * Create a macro from a spell check drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCSpellCheckMacro (data, slot) {
  if (data.type !== 'Spell Check') return

  // Create the macro command
  const spell = data.data.spell || null
  const img = data.data.img || null
  const macroData = {
    name: spell || game.i18n.localize('DCC.SpellCheck'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollSpellCheck() }',
    img: img || '/systems/dcc/styles/images/critical.png'
  }

  if (spell) {
    macroData.command = `const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollSpellCheck({ spell: "${spell}" }) }`
  }

  return macroData
}

/**
 * Create a macro from an attack bonus drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCAttackBonusMacro (data, slot) {
  if (data.type !== 'Attack Bonus') return

  // Create the macro command
  const macroData = {
    name: game.i18n.localize('DCC.AttackBonus'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollAttackBonus() }',
    img: 'icons/dice/d4black.svg'
  }

  return macroData
}

/**
 * Create a macro from an action die drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCActionDiceMacro (data, slot) {
  if (data.type !== 'Action Dice') return
  const die = data.data.die

  // Create the macro command
  const macroData = {
    name: game.i18n.format('DCC.ActionDiceMacroName', { die }),
    command: `const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.setActionDice('${die}') }`,
    img: 'icons/dice/d20black.svg'
  }

  return macroData
}

/**
 * Create a Macro from a weapon drop.
 * Get an existing macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function _createDCCWeaponMacro (data, slot) {
  if (data.type !== 'Weapon') return
  const item = data.data.weapon
  const weaponSlot = data.data.slot
  const backstab = data.data.backstab
  const options = {
    backstab: backstab
  }

  const macroData = {
    name: item.name,
    command: `game.dcc.rollDCCWeaponMacro("${weaponSlot}", ${JSON.stringify(options)});`,
    img: '/systems/dcc/styles/images/axe-square.png'
  }

  if (weaponSlot[0] === 'r') {
    macroData.img = '/systems/dcc/styles/images/bow-square.png'
  }

  if (backstab) {
    macroData.img = '/systems/dcc/styles/images/backstab.png'
  }

  return macroData
}

/**
 * Apply disapproval to an actor
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Object}
 */
function _createDCCApplyDisapprovalMacro (data, slot) {
  if (data.type !== 'Apply Disapproval') return

  // Create the macro command
  const macroData = {
    name: game.i18n.format('DCC.ApplyDisapprovalMacroName'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.applyDisapproval() }',
    img: 'icons/svg/clockwork.svg'
  }

  return macroData
}

/**
 * Roll disapproval for an actor
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Object}
 */
function _createDCCRollDisapprovalMacro (data, slot) {
  if (data.type !== 'Roll Disapproval') return

  // Create the macro command
  const macroData = {
    name: game.i18n.format('DCC.RollDisapprovalMacroName'),
    command: 'const _actor = game.dcc.getMacroActor(); if (_actor) { _actor.rollDisapproval() }',
    img: 'icons/svg/explosion.svg'
  }

  return macroData
}

/**
 * Roll a weapon attack from a macro.
 * @param {string} itemId
 * @return {Promise}
 */
function rollDCCWeaponMacro (itemId, options = {}) {
  const speaker = ChatMessage.getSpeaker()
  let actor
  if (speaker.token) actor = game.actors.tokens[speaker.token]
  if (!actor) actor = game.actors.get(speaker.actor)
  if (!actor) return ui.notifications.warn('You must select a token to run this macro.')

  // Trigger the weapon roll
  return actor.rollWeaponAttack(itemId, options)
}

/**
 * Get the current actor - for use in macros
 * @return {Promise}
 */
function getMacroActor () {
  const speaker = ChatMessage.getSpeaker()
  let actor
  if (speaker.token) actor = game.actors.tokens[speaker.token]
  if (!actor) actor = game.actors.get(speaker.actor)
  if (!actor) return ui.notifications.warn('You must select a token to run this macro.')

  // Return the actor if found
  return actor
}
