/**
 * Ascandir - DnD5e Mounting
 *
 * Reiter sitzt auf ein Reittier auf:
 *  - Der Reiter-Token bekommt das Reiter-Bild und die Größe des Reittiers.
 *  - Der Reittier-Token bleibt auf der Karte, wird aber unsichtbar und läuft mit.
 *  - Der Reiter bekommt die Bewegung des Reittiers.
 *  - Beim Anvisieren des kombinierten Tokens wählt man Reiter oder Reittier.
 *
 * Änderungen an Tokens, die dem Spieler nicht gehören, führt der Spielleiter-Client aus (Socket).
 */

const ID = "ascandir-mounting";
const SOCKET = `module.${ID}`;
const ACTOR_TYPES = ["character", "npc"];

const t = (key, data) => (data ? game.i18n.format(`AMT.${key}`, data) : game.i18n.localize(`AMT.${key}`));

/* -------------------------------------------- */
/*  Hilfsfunktionen: Paare finden               */
/* -------------------------------------------- */

/** Reittier eines Reiters (nur wenn beide Seiten zueinander passen). */
function getMountDoc(riderDoc) {
  const f = riderDoc?.flags?.[ID]?.mounted;
  if (!f?.mountId) return null;
  const mount = riderDoc.parent?.tokens.get(f.mountId);
  if (!mount || mount.flags?.[ID]?.riddenBy !== riderDoc.id) return null;
  return mount;
}

/** Reiter eines Reittiers (nur wenn beide Seiten zueinander passen). */
function getRiderDoc(mountDoc) {
  const id = mountDoc?.flags?.[ID]?.riddenBy;
  if (!id) return null;
  const rider = mountDoc.parent?.tokens.get(id);
  if (!rider || rider.flags?.[ID]?.mounted?.mountId !== mountDoc.id) return null;
  return rider;
}

function isActiveGM() {
  return !!game.users.activeGM?.isSelf;
}

function sizeIndex(doc) {
  const keys = Object.keys(CONFIG.DND5E?.actorSizes ?? {});
  const idx = keys.indexOf(doc.actor?.system?.traits?.size);
  if (idx >= 0) return idx;
  return Math.max(doc.width ?? 1, doc.height ?? 1);
}

function isCreatureToken(doc) {
  return !!doc?.actor && ACTOR_TYPES.includes(doc.actor.type);
}

function isFree(doc) {
  return !getMountDoc(doc) && !getRiderDoc(doc);
}

function canRide(riderDoc, user) {
  return isCreatureToken(riderDoc) && isFree(riderDoc)
    && (user.isGM || riderDoc.testUserPermission(user, "OWNER"));
}

function canBeMountFor(mountDoc, riderDoc, user) {
  if (!mountDoc || mountDoc === riderDoc || mountDoc.id === riderDoc.id) return false;
  if (!isCreatureToken(mountDoc) || !isFree(mountDoc)) return false;
  if (!user.isGM && mountDoc.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
  if (game.settings.get(ID, "sizeRule") && sizeIndex(mountDoc) <= sizeIndex(riderDoc)) return false;
  return true;
}

/** Abstand zwischen zwei Tokens in Feldern (Rand zu Rand, 0 = direkt daneben). */
function gapInCells(a, b) {
  const gs = a.parent?.grid?.size ?? canvas.grid?.size ?? 100;
  const ra = { x: a.x, y: a.y, w: a.width * gs, h: a.height * gs };
  const rb = { x: b.x, y: b.y, w: b.width * gs, h: b.height * gs };
  const dx = Math.max(0, rb.x - (ra.x + ra.w), ra.x - (rb.x + rb.w));
  const dy = Math.max(0, rb.y - (ra.y + ra.h), ra.y - (rb.y + rb.h));
  return Math.max(dx, dy) / gs;
}

function inRange(a, b) {
  const range = Number(game.settings.get(ID, "range")) || 0;
  return gapInCells(a, b) <= range + 0.01;
}

/** Alle möglichen Paare (Reiter → Reittier) rund um den angeklickten Token. */
function findPairs(clicked, user = game.user) {
  const pairs = [];
  const tokens = clicked.parent?.tokens ?? [];
  if (canRide(clicked, user)) {
    for (const m of tokens) {
      if (canBeMountFor(m, clicked, user) && inRange(clicked, m)) pairs.push({ rider: clicked, mount: m });
    }
  }
  for (const r of tokens) {
    if (r === clicked) continue;
    if (canRide(r, user) && canBeMountFor(clicked, r, user) && inRange(r, clicked)) {
      pairs.push({ rider: r, mount: clicked });
    }
  }
  return pairs;
}

function mountKey(mountDoc) {
  return mountDoc.actor?.id ?? mountDoc.actorId ?? mountDoc.id;
}

function storedImage(riderDoc, mountDoc) {
  return riderDoc.actor?.getFlag(ID, "images")?.[mountKey(mountDoc)] ?? "";
}

/* -------------------------------------------- */
/*  Socket: Ausführung beim Spielleiter         */
/* -------------------------------------------- */

function request(action, payload) {
  if (game.user.isGM) return GM[action]({ ...payload, userId: game.user.id });
  if (!game.users.activeGM) {
    ui.notifications.warn(t("Notify.NoGM"));
    return;
  }
  game.socket.emit(SOCKET, { action, payload: { ...payload, userId: game.user.id } });
}

function onSocket(data) {
  if (!isActiveGM()) return;
  const fn = GM[data?.action];
  if (typeof fn === "function") fn(data.payload ?? {}).catch((err) => console.error(`${ID} |`, err));
}

const GM = {
  async mount({ sceneId, riderId, mountId, img, userId }) {
    const scene = game.scenes.get(sceneId);
    const user = game.users.get(userId);
    const rider = scene?.tokens.get(riderId);
    const mount = scene?.tokens.get(mountId);
    if (!scene || !user || !rider || !mount) return;
    if (!canRide(rider, user) || !canBeMountFor(mount, rider, user)) return;
    if (!user.isGM && !inRange(rider, mount)) return;

    const ownWalk = Number(rider.actor?.system?.attributes?.movement?.speeds?.walk) || 0;
    const units = rider.actor?.system?.attributes?.movement?.units ?? "ft";

    const orig = {
      texture: {
        src: rider.texture.src,
        scaleX: rider.texture.scaleX,
        scaleY: rider.texture.scaleY
      },
      width: rider.width,
      height: rider.height,
      ringEnabled: !!rider.ring?.enabled,
      sort: rider.sort
    };

    await rider.update({
      [`flags.${ID}.mounted`]: { mountId: mount.id, orig },
      "texture.src": img || mount.texture.src,
      "texture.scaleX": 1,
      "texture.scaleY": 1,
      width: mount.width,
      height: mount.height,
      x: mount.x,
      y: mount.y,
      elevation: mount.elevation,
      "ring.enabled": false,
      sort: Math.max(rider.sort, mount.sort + 1)
    }, { animate: false, [ID]: { internal: true } });

    await mount.update({ [`flags.${ID}.riddenBy`]: rider.id }, { [ID]: { internal: true } });

    await createMarker(rider, mount);

    if (game.settings.get(ID, "chatMessage")) {
      const cost = Math.floor(ownWalk / 2);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ token: rider }),
        content: `<p>${t("Chat.Mounted", { rider: rider.name, mount: mount.name })}</p>`
          + (cost ? `<p><em>${t("Chat.Cost", { cost, units })}</em></p>` : "")
      });
    }
  },

  async dismount({ sceneId, riderId, userId }) {
    const scene = game.scenes.get(sceneId);
    const user = game.users.get(userId);
    const rider = scene?.tokens.get(riderId);
    if (!scene || !user || !rider) return;
    if (!user.isGM && !rider.testUserPermission(user, "OWNER")) return;
    const mount = getMountDoc(rider);
    await restoreRider(rider, mount);
    if (mount) await mount.unsetFlag(ID, "riddenBy");
    await removeMarker(rider.actor);

    if (game.settings.get(ID, "chatMessage")) {
      const ownWalk = Number(rider.actor?.system?.attributes?.movement?.speeds?.walk) || 0;
      const units = rider.actor?.system?.attributes?.movement?.units ?? "ft";
      const cost = Math.floor(ownWalk / 2);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ token: rider }),
        content: `<p>${t("Chat.Dismounted", { rider: rider.name, mount: mount?.name ?? "?" })}</p>`
          + (cost ? `<p><em>${t("Chat.Cost", { cost, units })}</em></p>` : "")
      });
    }
  }
};

/** Reiter-Token auf Originalbild/-größe zurücksetzen und neben das Reittier stellen. */
async function restoreRider(rider, mount) {
  const orig = rider.flags?.[ID]?.mounted?.orig;
  const update = {};
  if (orig) {
    Object.assign(update, {
      "texture.src": orig.texture?.src ?? rider.texture.src,
      "texture.scaleX": orig.texture?.scaleX ?? 1,
      "texture.scaleY": orig.texture?.scaleY ?? 1,
      width: orig.width ?? 1,
      height: orig.height ?? 1,
      "ring.enabled": !!orig.ringEnabled
    });
    if (mount) {
      const spot = findFreeSpot(mount, orig.width ?? 1, orig.height ?? 1, rider);
      update.x = spot.x;
      update.y = spot.y;
    }
  }
  if (Object.keys(update).length) await rider.update(update, { animate: false, [ID]: { internal: true } });
  if (rider.flags?.[ID]?.mounted) await rider.unsetFlag(ID, "mounted");
}

/** Freies Feld rund um das Reittier suchen (Wände und andere Tokens beachten, wenn die Szene geladen ist). */
function findFreeSpot(mount, w, h, rider) {
  const scene = mount.parent;
  const gs = scene.grid.size;
  const mw = mount.width * gs;
  const mh = mount.height * gs;
  const fallback = { x: mount.x + mw, y: mount.y };
  const center = { x: mount.x + mw / 2, y: mount.y + mh / 2 };
  const candidates = [];
  for (let gx = mount.x - w * gs; gx <= mount.x + mw; gx += gs) {
    for (let gy = mount.y - h * gs; gy <= mount.y + mh; gy += gs) {
      const overlaps = gx < mount.x + mw && gx + w * gs > mount.x && gy < mount.y + mh && gy + h * gs > mount.y;
      if (overlaps) continue;
      const c = { x: gx + (w * gs) / 2, y: gy + (h * gs) / 2 };
      candidates.push({ x: gx, y: gy, c, d: Math.hypot(c.x - center.x, c.y - center.y) });
    }
  }
  candidates.sort((a, b) => a.d - b.d);

  const loaded = canvas.ready && canvas.scene?.id === scene.id;
  const rect = scene.dimensions?.sceneRect;
  for (const cand of candidates) {
    if (rect && (cand.x < rect.x || cand.y < rect.y || cand.x + w * gs > rect.x + rect.width
      || cand.y + h * gs > rect.y + rect.height)) continue;
    if (!loaded) return cand;
    const blocked = scene.tokens.some((o) => {
      if (o.id === mount.id || o.id === rider.id || o.hidden) return false;
      const ow = o.width * gs;
      const oh = o.height * gs;
      return cand.x < o.x + ow && cand.x + w * gs > o.x && cand.y < o.y + oh && cand.y + h * gs > o.y;
    });
    if (blocked) continue;
    let wall = false;
    try {
      wall = CONFIG.Canvas.polygonBackends.move.testCollision(center, cand.c, { type: "move", mode: "any" });
    } catch (err) {
      wall = false;
    }
    if (wall) continue;
    return cand;
  }
  return fallback;
}

/* -------------------------------------------- */
/*  Effekt "Beritten" am Reiter                 */
/* -------------------------------------------- */

async function createMarker(rider, mount) {
  const actor = rider.actor;
  if (!actor) return;
  await removeMarker(actor);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: t("Effect.Name", { mount: mount.name }),
    img: mount.texture.src || mount.actor?.img || "icons/svg/pawprint.svg",
    description: t("Effect.Description", { mount: mount.name }),
    flags: { [ID]: { marker: true, mountUuid: mount.uuid } }
  }]);
}

async function removeMarker(actor) {
  if (!actor) return;
  const ids = actor.effects.filter((e) => e.flags?.[ID]?.marker).map((e) => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { [ID]: { internal: true } });
}

/** Nach der normalen Berechnung: Bewegung des Reittiers übernehmen. */
function applyMountMovement(actor) {
  const effect = actor.effects?.find?.((e) => e.flags?.[ID]?.marker && !e.disabled);
  if (!effect) return;
  const mountDoc = fromUuidSync(effect.flags[ID].mountUuid);
  const mountActor = mountDoc?.actor;
  if (!mountActor || mountActor === actor) return;
  const src = mountActor.system?.attributes?.movement;
  const dst = actor.system?.attributes?.movement;
  if (!src?.speeds || !dst?.speeds) return;
  let max = 0;
  for (const type of Object.keys(CONFIG.DND5E.movementTypes ?? src.speeds)) {
    if (type === "jump") continue;
    const v = Number(src.speeds[type]) || 0;
    dst.speeds[type] = v;
    max = Math.max(max, v);
  }
  dst.max = max;
  dst.speed = dst.speeds.walk ?? 0;
  if ("hover" in src) dst.hover = src.hover;
  if (src.units) dst.units = src.units;
}

function refreshRidersOf(mountActor) {
  for (const scene of [canvas.scene].filter(Boolean)) {
    for (const tok of scene.tokens) {
      const m = getMountDoc(tok);
      if (!m || m.actor !== mountActor) continue;
      tok.actor?.reset?.();
      if (tok.actor?.sheet?.rendered) tok.actor.sheet.render();
    }
  }
}

/* -------------------------------------------- */
/*  Reittier unsichtbar machen (alle Clients)   */
/* -------------------------------------------- */

function hideMountVisuals(token) {
  const ridden = !!getRiderDoc(token.document);
  if (!ridden) {
    if (token._amtHidden) {
      token._amtHidden = false;
      token.eventMode = "static";
    }
    return;
  }
  token._amtHidden = true;
  token.eventMode = "none";
  for (const key of ["mesh", "bars", "nameplate", "tooltip", "effects", "border", "turnMarker", "voidMesh", "detectionFilterMesh"]) {
    const obj = token[key];
    if (obj && "visible" in obj) obj.visible = false;
  }
  if (token.controlled) token.release();
}

function refreshPair(doc) {
  const docs = new Set([doc]);
  const m = doc.parent?.tokens.get(doc.flags?.[ID]?.mounted?.mountId);
  if (m) docs.add(m);
  const r = doc.parent?.tokens.get(doc.flags?.[ID]?.riddenBy);
  if (r) docs.add(r);
  for (const d of docs) d.object?.renderFlags?.set({ refresh: true });
}

/* -------------------------------------------- */
/*  Anvisieren: Reiter oder Reittier wählen     */
/* -------------------------------------------- */

const Target = {
  bypass: 0,
  original: null,
  el: null,

  run(fn) {
    this.bypass++;
    try {
      return fn();
    } finally {
      this.bypass--;
    }
  },

  set(token, targeted, options = {}) {
    return this.run(() => this.original.call(token, targeted, options));
  },

  isMine(token) {
    return token?.targeted?.has?.(game.user) ?? false;
  },

  patch() {
    let proto = CONFIG.Token.objectClass?.prototype;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, "setTarget")) proto = Object.getPrototypeOf(proto);
    if (!proto) return;
    const original = proto.setTarget;
    this.original = original;
    proto.setTarget = function (targeted = true, options = {}) {
      if (!Target.bypass && targeted && (!options.user || options.user === game.user)) {
        const mount = getMountDoc(this.document)?.object;
        if (mount) {
          Target.request(this, mount, options.releaseOthers ?? true);
          return;
        }
      }
      return original.call(this, targeted, options);
    };
  },

  /** Fallback, falls ein anderer Weg als setTarget den Reiter anvisiert. */
  onTargetHook(user, token, targeted) {
    if (Target.bypass || !targeted || user !== game.user || !Target.original) return;
    const mount = getMountDoc(token.document)?.object;
    if (!mount) return;
    Target.set(token, false, { releaseOthers: false });
    Target.request(token, mount, false);
  },

  request(rider, mount, releaseOthers) {
    // Erneutes Anvisieren hebt eine bestehende Auswahl auf.
    if (this.isMine(mount) || this.isMine(rider)) {
      if (this.isMine(mount)) this.set(mount, false, { releaseOthers: false });
      if (this.isMine(rider)) this.set(rider, false, { releaseOthers: false });
      this.close();
      return;
    }
    this.open(rider, mount, releaseOthers);
  },

  open(rider, mount, releaseOthers) {
    this.close();
    const orig = rider.document.flags?.[ID]?.mounted?.orig;
    const riderImg = rider.actor?.img || orig?.texture?.src || "icons/svg/mystery-man.svg";
    const mountImg = mount.actor?.img || mount.document.texture.src || "icons/svg/pawprint.svg";

    const el = document.createElement("div");
    el.className = "amt-target-chooser";
    el.innerHTML = `
      <div class="amt-title">${t("Target.Title")}</div>
      <div class="amt-options">
        <button type="button" data-choice="rider" data-tooltip="${foundry.utils.escapeHTML(rider.name)}">
          <img src="${riderImg}" alt=""><span>${foundry.utils.escapeHTML(rider.name)}</span>
        </button>
        <button type="button" data-choice="mount" data-tooltip="${foundry.utils.escapeHTML(mount.name)}">
          <img src="${mountImg}" alt=""><span>${foundry.utils.escapeHTML(mount.name)}</span>
        </button>
      </div>`;
    document.body.append(el);
    this.el = el;
    this.anchor = rider;
    this.position();

    el.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-choice]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const chosen = btn.dataset.choice === "mount" ? mount : rider;
      this.close();
      this.set(chosen, true, { releaseOthers });
    });

    this._outside = (event) => {
      if (this.el && !this.el.contains(event.target)) this.close();
    };
    this._key = (event) => {
      if (event.key === "Escape") this.close();
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", this._outside, true);
      document.addEventListener("keydown", this._key, true);
    }, 0);
  },

  position() {
    if (!this.el || !this.anchor) return;
    const tok = this.anchor;
    let pt;
    try {
      pt = canvas.clientCoordinatesFromCanvas({ x: tok.x + tok.w, y: tok.y + tok.h / 2 });
    } catch (err) {
      pt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const box = this.el.getBoundingClientRect();
    const x = Math.min(window.innerWidth - box.width - 8, pt.x + 8);
    const y = Math.min(window.innerHeight - box.height - 8, Math.max(8, pt.y - box.height / 2));
    this.el.style.left = `${Math.max(8, x)}px`;
    this.el.style.top = `${y}px`;
  },

  close() {
    this.el?.remove();
    this.el = null;
    this.anchor = null;
    if (this._outside) document.removeEventListener("pointerdown", this._outside, true);
    if (this._key) document.removeEventListener("keydown", this._key, true);
    this._outside = this._key = null;
  }
};

/* -------------------------------------------- */
/*  Aufsitzen-Dialog                            */
/* -------------------------------------------- */

async function openMountDialog(clickedDoc) {
  const pairs = findPairs(clickedDoc);
  if (!pairs.length) {
    ui.notifications.info(t("Notify.NoPairs"));
    return;
  }
  const esc = foundry.utils.escapeHTML;
  const first = pairs[0];
  const options = pairs.map((p, i) => `
    <label class="amt-pair">
      <input type="radio" name="pair" value="${i}" ${i === 0 ? "checked" : ""}>
      <img src="${p.rider.texture.src}" alt="">
      <span>${esc(p.rider.name)}</span>
      <i class="fa-solid fa-arrow-right"></i>
      <img src="${p.mount.texture.src}" alt="">
      <span>${esc(p.mount.name)}</span>
    </label>`).join("");

  const content = `
    <div class="amt-dialog">
      ${pairs.length > 1 ? `<p>${t("Dialog.ChoosePair")}</p>` : ""}
      <div class="amt-pairs ${pairs.length > 1 ? "" : "single"}">${options}</div>
      <div class="form-group">
        <label>${t("Dialog.Image")}</label>
        <div class="form-fields">
          <input type="text" name="img" value="${esc(storedImage(first.rider, first.mount))}" placeholder="${esc(t("Dialog.ImagePlaceholder"))}">
          <button type="button" class="amt-browse" data-tooltip="${esc(t("Dialog.Browse"))}"><i class="fa-solid fa-file-import"></i></button>
        </div>
        <p class="hint">${t("Dialog.ImageHint")}</p>
      </div>
      <div class="amt-preview"><img src="" alt=""></div>
    </div>`;

  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: t("Dialog.Title"), icon: "fa-solid fa-horse" },
    position: { width: 420 },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "mount",
        label: t("Dialog.Confirm"),
        icon: "fa-solid fa-horse",
        default: true,
        callback: (event, button) => {
          const form = button.form;
          return { index: Number(form.elements.pair?.value ?? 0), img: form.elements.img.value.trim() };
        }
      },
      { action: "cancel", label: t("Dialog.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    render: (event, dialog) => {
      const root = (dialog ?? event?.target)?.element;
      if (!root) return;
      const input = root.querySelector("input[name=img]");
      const preview = root.querySelector(".amt-preview img");
      const current = () => pairs[Number(root.querySelector("input[name=pair]:checked")?.value ?? 0)] ?? first;
      const update = () => {
        const p = current();
        preview.src = input.value.trim() || p.mount.texture.src;
      };
      for (const radio of root.querySelectorAll("input[name=pair]")) {
        radio.addEventListener("change", () => {
          const p = current();
          input.value = storedImage(p.rider, p.mount);
          update();
        });
      }
      input.addEventListener("change", update);
      input.addEventListener("input", update);
      root.querySelector(".amt-browse")?.addEventListener("click", () => {
        const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        const fp = new FP({
          type: "image",
          current: input.value,
          callback: (path) => {
            input.value = path;
            update();
          }
        });
        fp.render(true);
      });
      update();
    }
  });

  if (!result || typeof result !== "object") return;
  const pair = pairs[result.index] ?? first;
  if (pair.rider.actor?.isOwner) {
    const key = mountKey(pair.mount);
    if (storedImage(pair.rider, pair.mount) !== result.img) {
      await pair.rider.actor.setFlag(ID, "images", { [key]: result.img });
    }
  }
  request("mount", {
    sceneId: pair.rider.parent.id,
    riderId: pair.rider.id,
    mountId: pair.mount.id,
    img: result.img
  });
}

function dismount(riderDoc) {
  request("dismount", { sceneId: riderDoc.parent.id, riderId: riderDoc.id });
}

/* -------------------------------------------- */
/*  Buttons im Token-HUD                        */
/* -------------------------------------------- */

function onRenderTokenHUD(hud, html) {
  const root = hud?.element ?? (html instanceof HTMLElement ? html : html?.[0]);
  const doc = hud?.object?.document ?? hud?.document;
  if (!root || !doc) return;
  const col = root.querySelector(".col.left");
  if (!col || root.querySelector("[data-amt-action]")) return;

  let action = null;
  if (getMountDoc(doc)) {
    if (game.user.isGM || doc.isOwner) action = "dismount";
  } else if (isFree(doc) && findPairs(doc).length) {
    action = "mount";
  }
  if (!action) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon amt-hud-button";
  btn.dataset.amtAction = action;
  btn.dataset.tooltip = t(action === "mount" ? "HUD.Mount" : "HUD.Dismount");
  btn.innerHTML = action === "mount"
    ? `<i class="fa-solid fa-horse"></i>`
    : `<i class="fa-solid fa-person-walking-arrow-right"></i>`;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hud.close?.();
    if (action === "mount") openMountDialog(doc);
    else dismount(doc);
  });
  col.append(btn);
}

/* -------------------------------------------- */
/*  Einstellungen & Hooks                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(ID, "range", {
    name: "AMT.Settings.Range.Name",
    hint: "AMT.Settings.Range.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 1
  });
  game.settings.register(ID, "sizeRule", {
    name: "AMT.Settings.SizeRule.Name",
    hint: "AMT.Settings.SizeRule.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(ID, "chatMessage", {
    name: "AMT.Settings.ChatMessage.Name",
    hint: "AMT.Settings.ChatMessage.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Bewegung des Reittiers nach der normalen Berechnung übernehmen.
  const proto = CONFIG.Actor.documentClass.prototype;
  const prepareDerivedData = proto.prepareDerivedData;
  proto.prepareDerivedData = function (...args) {
    const result = prepareDerivedData.apply(this, args);
    try {
      applyMountMovement(this);
    } catch (err) {
      console.error(`${ID} | Bewegung konnte nicht übernommen werden`, err);
    }
    return result;
  };
});

Hooks.once("ready", () => {
  Target.patch();
  game.socket.on(SOCKET, onSocket);
  for (const actor of game.actors) {
    if (actor.effects.some((e) => e.flags?.[ID]?.marker)) actor.reset?.();
  }
  const mod = game.modules.get(ID);
  if (mod) {
    mod.api = {
      mount: (rider, mount, img = "") => {
        const r = rider?.document ?? rider;
        const m = mount?.document ?? mount;
        request("mount", { sceneId: r.parent.id, riderId: r.id, mountId: m.id, img });
      },
      dismount: (rider) => dismount(rider?.document ?? rider),
      getMount: (rider) => getMountDoc(rider?.document ?? rider),
      getRider: (mount) => getRiderDoc(mount?.document ?? mount)
    };
  }
});

Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("refreshToken", hideMountVisuals);
Hooks.on("targetToken", Target.onTargetHook);
Hooks.on("canvasPan", () => Target.position());
Hooks.on("canvasTearDown", () => Target.close());

Hooks.on("controlToken", (token, controlled) => {
  if (controlled && getRiderDoc(token.document)) token.release();
});

// Kopierte Tokens sollen keine alten Reit-Daten mitnehmen.
Hooks.on("preCreateToken", (doc) => {
  if (doc.flags?.[ID]?.mounted || doc.flags?.[ID]?.riddenBy) {
    doc.updateSource({ [`flags.${ID}`]: { mounted: null, riddenBy: null } });
  }
});

Hooks.on("updateToken", (doc, change, options) => {
  if (change.flags?.[ID] !== undefined) refreshPair(doc);

  // Reittier folgt dem Reiter.
  if (isActiveGM() && ("x" in change || "y" in change || "elevation" in change)) {
    const mount = getMountDoc(doc);
    if (mount && !options?.[ID]?.follow) {
      mount.update(
        { x: doc.x, y: doc.y, elevation: doc.elevation },
        { animate: false, [ID]: { follow: true } }
      );
    }
  }

  // Werte am (unverknüpften) Reittier geändert → Bewegung des Reiters neu berechnen.
  if (getRiderDoc(doc) && (change.delta || change.actorData)) refreshRidersOf(doc.actor);
});

Hooks.on("updateActor", (actor) => refreshRidersOf(actor));
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, (effect) => {
    const actor = effect.parent instanceof Actor ? effect.parent : effect.parent?.parent;
    if (actor instanceof Actor) refreshRidersOf(actor);
  });
}

// "Beritten"-Effekt vom Reiter gelöscht → absitzen.
Hooks.on("deleteActiveEffect", (effect, options) => {
  if (!isActiveGM() || options?.[ID]?.internal || !effect.flags?.[ID]?.marker) return;
  const actor = effect.parent;
  const scene = canvas.scene;
  const rider = scene?.tokens.find((tok) => tok.actor === actor && getMountDoc(tok));
  if (rider) GM.dismount({ sceneId: scene.id, riderId: rider.id, userId: game.user.id });
});

// Ein Token des Paares wurde gelöscht → den anderen aufräumen.
Hooks.on("deleteToken", async (doc) => {
  if (!isActiveGM()) return;
  const scene = doc.parent;
  const mountId = doc.flags?.[ID]?.mounted?.mountId;
  if (mountId) {
    const mount = scene?.tokens.get(mountId);
    if (mount?.flags?.[ID]?.riddenBy === doc.id) await mount.unsetFlag(ID, "riddenBy");
    if (doc.actorLink) await removeMarker(doc.actor);
  }
  const riderId = doc.flags?.[ID]?.riddenBy;
  if (riderId) {
    const rider = scene?.tokens.get(riderId);
    if (rider?.flags?.[ID]?.mounted?.mountId === doc.id) {
      await restoreRider(rider, null);
      await removeMarker(rider.actor);
    }
  }
});
