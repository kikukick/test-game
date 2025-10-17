/* script.js
   JSON自動読み込み + assets short-key + expressions + ex行スキップ
   + 好感度(affection) の初期化 / delta / set を JSON で指定可能
   - 必要なDOM: #pixi-container, #choices, #save-btn, #load-btn, #restart-btn, #save-status, #meta-info
   - デフォルト読み込み: ./scenario.json (or ?scenario=xxx.json)
*/

/* ---------- 定数 / DOM ---------- */
const SAVE_KEY = "vn_json_autosave_v2";
const choicesBox = document.getElementById("choices");
const saveBtn = document.getElementById("save-btn");
const loadBtn = document.getElementById("load-btn");
const restartBtn = document.getElementById("restart-btn");
const saveStatus = document.getElementById("save-status");
const metaInfo = document.getElementById("meta-info");

/* ---------- Pixi / globals ---------- */
let app, stageWidth = window.innerWidth, stageHeight = window.innerHeight;
let bgSpriteA, bgSpriteB, activeBg, standbyBg, darkOverlay;
let textContainer, dialogText, panel;
let characterSlots = []; // [{ sprite, visible, charId }]
let slotCount = 2;

/* ---------- scenario / state ---------- */
let scenario = null;
let currentSceneId = null;
let currentLineIndex = 0;
let awaitingInput = false;
let showingChoices = false;
let typingTween = null;
let autosaveEnabled = true;

/* ---------- affection state ---------- */
let affection = {}; // { charId: number }

/* ---------- helper: resolve asset key -> url ---------- */
function resolveAsset(key) {
  if (!key) return null;
  if (typeof key !== "string") return null;
  if (key.startsWith("http://") || key.startsWith("https://") || key.indexOf("/") !== -1) return key;
  if (!scenario) return null;
  // try scenario.assets.characters / backgrounds
  if (scenario.assets) {
    if (scenario.assets.characters) {
      // may be nested map charId -> { "A1": url, ... } or single flat map
      // If key like "A1" we cannot know char; but in some cases key might be "kiku.A1"
      if (key.indexOf(".") !== -1) {
        const [cid, expr] = key.split(".", 2);
        if (scenario.assets.characters[cid] && scenario.assets.characters[cid][expr]) return scenario.assets.characters[cid][expr];
      }
      // search for key in any char's expressions
      for (const cid in scenario.assets.characters) {
        const obj = scenario.assets.characters[cid];
        if (obj && obj[key]) return obj[key];
      }
    }
    if (scenario.assets.backgrounds && scenario.assets.backgrounds[key]) return scenario.assets.backgrounds[key];
    if (scenario.assets[key]) return scenario.assets[key];
  }
  // legacy: scenario.characters mapping with expressions
  if (scenario.characters && scenario.characters[key]) return scenario.characters[key]; // maybe url
  return null;
}

/* ---------- PIXI init & dialog panel ---------- */
function initPixi() {
  if (typeof PIXI === "undefined") { console.error("PIXI not loaded"); return; }
  if (app) return;
  app = new PIXI.Application({ width: stageWidth, height: stageHeight, resolution: devicePixelRatio || 1, autoDensity: true, backgroundAlpha: 0 });
  document.getElementById("pixi-container").innerHTML = "";
  document.getElementById("pixi-container").appendChild(app.view);

  // backgrounds
  bgSpriteA = new PIXI.Sprite(PIXI.Texture.WHITE);
  bgSpriteB = new PIXI.Sprite(PIXI.Texture.WHITE);
  [bgSpriteA, bgSpriteB].forEach(s => {
    s.width = stageWidth; s.height = stageHeight; s.anchor.set(0.5); s.x = stageWidth/2; s.y = stageHeight/2; s.alpha = 0;
    app.stage.addChild(s);
  });
  activeBg = bgSpriteA; standbyBg = bgSpriteB;

  // dark overlay
  darkOverlay = new PIXI.Graphics();
  darkOverlay.beginFill(0x000000); darkOverlay.drawRect(0,0,stageWidth,stageHeight); darkOverlay.endFill();
  darkOverlay.alpha = 0;
  app.stage.addChild(darkOverlay);

  // text container
  textContainer = new PIXI.Container();
  textContainer.x = stageWidth * 0.06;
  textContainer.y = stageHeight * 0.68;
  app.stage.addChild(textContainer);

  // panel + text
  panel = new PIXI.Graphics();
  redrawDialogPanel();
  textContainer.addChild(panel);

  const panelW = Math.max(360, stageWidth * 0.88);
  const style = new PIXI.TextStyle({
    fontFamily: "Yu Gothic, Noto Sans JP, sans-serif",
    fontSize: Math.max(18, Math.round(stageWidth*0.018)),
    fill: "#ffffff",
    wordWrap: true,
    wordWrapWidth: Math.max(200, panelW - 40),
    lineHeight: Math.max(26, Math.round(stageWidth*0.024)),
    stroke: "#000000",
    strokeThickness: 6,
    dropShadow: true,
    dropShadowColor: "#000000",
    dropShadowBlur: 6,
    dropShadowAlpha: 0.5,
    dropShadowDistance: 2
  });
  dialogText = new PIXI.Text("", style);
  dialogText.x = 20; dialogText.y = 18; dialogText.alpha = 1;
  textContainer.addChild(dialogText);

  app.view.style.cursor = "pointer";
  app.view.addEventListener("pointerdown", onCanvasClick);
  window.addEventListener("resize", onResize);
}

/* ---------- redraw panel ---------- */
function redrawDialogPanel() {
  if (!panel) panel = new PIXI.Graphics();
  panel.clear();
  const panelW = Math.max(360, stageWidth * 0.88);
  const panelH = Math.max(120, stageHeight * 0.22);
  const radius = Math.max(8, Math.round(Math.min(panelW, panelH) * 0.02));
  panel.beginFill(0x000000, 0.65);
  panel.lineStyle(2, 0x222233, 0.6);
  panel.drawRoundedRect(0,0,panelW,panelH,radius);
  panel.endFill();
  panel.beginFill(0x000000,0);
  panel.lineStyle(1, 0xffffff, 0.03);
  panel.drawRoundedRect(2,2,panelW-4,panelH-4, Math.max(4, radius-2));
  panel.endFill();
  if (dialogText && dialogText.style) {
    dialogText.style.wordWrapWidth = Math.max(200, panelW - 40);
    dialogText.style.fontSize = Math.max(16, Math.round(stageWidth*0.018));
    dialogText.style.lineHeight = Math.max(24, Math.round(stageWidth*0.024));
  }
}

/* ---------- resize ---------- */
function onResize() {
  stageWidth = window.innerWidth; stageHeight = window.innerHeight;
  if (!app) return;
  app.renderer.resize(stageWidth, stageHeight);
  [bgSpriteA, bgSpriteB].forEach(s => { if(s){ s.width = stageWidth; s.height = stageHeight; s.x = stageWidth/2; s.y = stageHeight/2; }});
  darkOverlay.clear(); darkOverlay.beginFill(0x000000); darkOverlay.drawRect(0,0,stageWidth,stageHeight); darkOverlay.endFill();
  if (textContainer) textContainer.y = stageHeight * 0.68;
  redrawDialogPanel();
  if (scenario && scenario.meta) applySlotPositions();
}

/* ---------- canvas click ---------- */
function onCanvasClick() {
  if (awaitingInput && !showingChoices) advanceLine();
}

/* ---------- change background (key or url) ---------- */
function changeBackground(keyOrUrl, duration = 0.8, useDark = false) {
  if (!activeBg || !standbyBg) return;
  const url = resolveAsset(keyOrUrl) || keyOrUrl;
  if (!url) return;
  try {
    standbyBg.texture = PIXI.Texture.from(url);
    standbyBg.alpha = 0;
    app.stage.setChildIndex(standbyBg, 0);
    if (useDark) {
      gsap.to(darkOverlay, {alpha:1, duration: duration/2, ease:"power1.inOut", onComplete: ()=> {
        gsap.to(standbyBg, {alpha:1, duration: duration/2, ease:"power1.inOut", onComplete: swap});
        gsap.to(activeBg, {alpha:0, duration: duration/2, ease:"power1.inOut"});
      }});
    } else {
      gsap.to(standbyBg, {alpha:1, duration:duration, ease:"power1.inOut", onComplete:swap});
      gsap.to(activeBg, {alpha:0, duration:duration, ease:"power1.inOut"});
    }
  } catch(e) { console.error("bg change err", e); }
  function swap(){ let t=activeBg; activeBg=standbyBg; standbyBg=t; gsap.to(darkOverlay,{alpha:0,duration:0.3}); }
}

/* ---------- typewriter ---------- */
function showTextWithTypewriter(fullText, speedPerChar = 0.03, onComplete) {
  if (!dialogText) return;
  if (typingTween) { typingTween.kill(); typingTween = null; }
  dialogText.text = "";
  awaitingInput = false;
  const proxy = { i:0 };
  const total = Math.max(1, fullText.length);
  const totalDuration = Math.max(0.3, total * speedPerChar);
  typingTween = gsap.to(proxy, {
    i: total, duration: totalDuration, ease: "none",
    onUpdate: ()=> { dialogText.text = fullText.slice(0, Math.floor(proxy.i)); },
    onComplete: ()=> { dialogText.text = fullText; typingTween = null; awaitingInput = true; if (onComplete) onComplete(); updateMetaInfo(); }
  });
}

/* ---------- slots setup & positions ---------- */
function setupCharacterSlots(count, positions) {
  characterSlots.forEach(slot => { if(slot.sprite && app) app.stage.removeChild(slot.sprite); });
  characterSlots = [];
  slotCount = Math.max(1, Math.min(6, count|0));
  for (let i=0;i<slotCount;i++){
    const s = new PIXI.Sprite(PIXI.Texture.EMPTY);
    s.anchor.set(0.5, 1.0);
    s.alpha = 0;
    app.stage.addChild(s);
    characterSlots.push({ sprite: s, visible:false, charId:null });
  }
  applySlotPositions(positions);
}

function applySlotPositions(positions) {
  let pos = positions || (scenario && scenario.meta && scenario.meta.positions) || null;
  if (!pos || pos.length < slotCount) {
    pos = [];
    const margin = 0.12;
    if (slotCount === 1) pos.push({x:0.5, y:0.95});
    else {
      for (let i=0;i<slotCount;i++){
        const t = i/(slotCount-1);
        const x = margin + (1 - margin*2) * t;
        pos.push({x:x, y:0.95});
      }
    }
  }
  characterSlots.forEach((slot, i) => {
    const p = pos[i] || pos[pos.length-1];
    slot.sprite.x = p.x * stageWidth;
    slot.sprite.y = p.y * stageHeight;
  });
}

/* ---------- show characters (supports asset keys) ---------- */
function applyShowCharacters(showList) {
  if (!Array.isArray(showList)) return;
  showList.forEach(item => {
    const idx = Math.max(0, Math.min(slotCount-1, (item.slot|0) ));
    const slotObj = characterSlots[idx];
    if (!slotObj) return;
    const charId = item.charId || null;
    let imageKey = item.image || item.imageKey || item.expr || item.expression || null;
    let url = resolveAsset(imageKey) || imageKey || null;
    if (charId && scenario && scenario.characters && scenario.characters[charId] && scenario.characters[charId].expressions) {
      const exmap = scenario.characters[charId].expressions;
      if (imageKey && exmap[imageKey]) url = exmap[imageKey];
    }
    if (!url && typeof item.image === "string") url = resolveAsset(item.image) || item.image;
    if (url) {
      slotObj.sprite.texture = PIXI.Texture.from(url);
      slotObj.sprite.visible = true;
      slotObj.charId = charId || slotObj.charId || null;
      if (typeof item.scale === "number") slotObj.sprite.scale.set(item.scale);
      if (typeof item.anchorY === "number") slotObj.sprite.anchor.y = item.anchorY;
      slotObj.sprite.scale.x = (item.flip ? -Math.abs(slotObj.sprite.scale.x) : Math.abs(slotObj.sprite.scale.x));
      gsap.to(slotObj.sprite, {alpha:1, duration:0.45, ease:"power2.out"});
    } else {
      console.warn("applyShowCharacters: image not resolved", item);
    }
  });
}

/* ---------- apply expressions shorthand ---------- */
function applyExpressions(exprSpec) {
  if (!exprSpec) return;
  if (Array.isArray(exprSpec)) {
    exprSpec.forEach(it => {
      const slot = (typeof it.slot === "number") ? it.slot : null;
      const charId = it.charId || null;
      const exprKey = it.expr || it.expression || null;
      if (slot !== null) setExpressionBySlot(slot, exprKey);
      else if (charId) setExpressionByCharId(charId, exprKey);
    });
  } else if (typeof exprSpec === "object") {
    // object mapping charId -> key OR simple {kiku:1} style => treat values as delta? but here used for expressions mapping
    for (const k in exprSpec) {
      if (!exprSpec.hasOwnProperty(k)) continue;
      setExpressionByCharId(k, exprSpec[k]);
    }
  }
}

function setExpressionBySlot(slotIndex, exprKey) {
  const idx = Math.max(0, Math.min(slotCount-1, slotIndex|0));
  const slot = characterSlots[idx];
  if (!slot) return;
  const url = resolveAsset(exprKey) || exprKey || null;
  if (slot.charId && scenario && scenario.characters && scenario.characters[slot.charId] && scenario.characters[slot.charId].expressions) {
    const ch = scenario.characters[slot.charId];
    if (ch.expressions && ch.expressions[exprKey]) {
      slot.sprite.texture = PIXI.Texture.from(ch.expressions[exprKey]);
      gsap.to(slot.sprite, {alpha:1, duration:0.28});
      return;
    }
  }
  if (url) {
    slot.sprite.texture = PIXI.Texture.from(url);
    gsap.to(slot.sprite, {alpha:1, duration:0.28});
  } else {
    console.warn("setExpressionBySlot: expr not found", exprKey);
  }
}

function setExpressionByCharId(charId, exprKey) {
  for (let i=0;i<characterSlots.length;i++){
    const s = characterSlots[i];
    if (s && s.charId === charId) {
      setExpressionBySlot(i, exprKey);
      return;
    }
  }
  // if not shown, show into first empty slot
  for (let i=0;i<characterSlots.length;i++){
    const s = characterSlots[i];
    if (s && !s.charId) {
      applyShowCharacters([{ slot: i, charId: charId, image: exprKey }]);
      return;
    }
  }
  console.warn("setExpressionByCharId: charId not shown", charId);
}

/* ---------- hide ---------- */
function applyHideCharacters(hideList) {
  if (!hideList) {
    characterSlots.forEach(slot => { gsap.to(slot.sprite, {alpha:0, duration:0.3}); slot.visible=false; slot.charId=null; });
    return;
  }
  hideList.forEach(i => {
    const idx = Math.max(0, Math.min(slotCount-1, i|0));
    const slot = characterSlots[idx];
    if (slot) { gsap.to(slot.sprite, {alpha:0, duration:0.3}); slot.visible=false; slot.charId=null; }
  });
}

/* ---------- AFFECTION: apply spec ---------- */
function initAffectionFromScenario() {
  affection = {};
  // priority: scenario.meta.affection -> scenario.affection -> scenario.characters[].affection
  if (scenario && scenario.meta && scenario.meta.affection) {
    Object.assign(affection, scenario.meta.affection);
  } else if (scenario && scenario.affection) {
    Object.assign(affection, scenario.affection);
  } else if (scenario && scenario.characters) {
    // if characters is object with keys
    if (typeof scenario.characters === "object" && !Array.isArray(scenario.characters)) {
      for (const k in scenario.characters) {
        if (!scenario.characters.hasOwnProperty(k)) continue;
        affection[k] = (scenario.characters[k].affection != null) ? scenario.characters[k].affection : 0;
      }
    }
  }
  // ensure defaults 0 for assets.characters keys
  if (scenario && scenario.assets && scenario.assets.characters) {
    for (const k in scenario.assets.characters) {
      if (!affection.hasOwnProperty(k)) affection[k] = 0;
    }
  }
  updateMetaInfo();
}

function applyAffectionSpec(spec) {
  if (!spec) return;
  // spec can be { set:{k: v}, delta:{k: +n} } or simple mapping -> delta
  if (spec.set && typeof spec.set === "object") {
    for (const k in spec.set) {
      if (!spec.set.hasOwnProperty(k)) continue;
      affection[k] = Number(spec.set[k]) || 0;
    }
  }
  if (spec.delta && typeof spec.delta === "object") {
    for (const k in spec.delta) {
      if (!spec.delta.hasOwnProperty(k)) continue;
      const d = Number(spec.delta[k]) || 0;
      affection[k] = (affection[k] || 0) + d;
    }
  }
  // shorthand: {kiku: 1, taiyo: -1} treat as delta
  for (const k in spec) {
    if (!spec.hasOwnProperty(k)) continue;
    if (k === "set" || k === "delta") continue;
    const v = spec[k];
    if (typeof v === "number" || !isNaN(Number(v))) {
      affection[k] = (affection[k] || 0) + Number(v);
    }
  }
  updateMetaInfo();
}

/* ---------- updateMetaInfo (shows affection) ---------- */
function updateMetaInfo() {
  if (!metaInfo) return;
  let text = "";
  if (scenario && scenario.meta && scenario.meta.title) {
    text += scenario.meta.title + "  ";
  }
  // show affection values
  if (affection && Object.keys(affection).length > 0) {
    const parts = [];
    for (const k in affection) {
      if (!affection.hasOwnProperty(k)) continue;
      const name = (scenario.characters && scenario.characters[k] && scenario.characters[k].name) ? scenario.characters[k].name : k;
      parts.push(`${name}:${affection[k]}`);
    }
    text += " | 好感度 " + parts.join("  ");
  }
  metaInfo.textContent = text;
}

/* ---------- load scenario object ---------- */
function loadScenarioFromObject(obj) {
  if (!obj || !obj.meta || !obj.scenes) {
    alert("Invalid scenario JSON: meta or scenes missing");
    return;
  }
  scenario = obj;

  // normalize scenes: support array of {id, lines} or object mapping
  if (Array.isArray(scenario.scenes)) {
    // ok
  } else if (typeof scenario.scenes === "object") {
    // convert mapping to array
    const arr = [];
    for (const key in scenario.scenes) {
      if (!scenario.scenes.hasOwnProperty(key)) continue;
      const content = scenario.scenes[key];
      // if it's already array of lines, make {id:key, lines: content}
      if (Array.isArray(content)) arr.push({ id: key, lines: content });
      else if (typeof content === "object" && content.lines) arr.push(Object.assign({ id: key }, content));
      else arr.push({ id: key, lines: Array.isArray(content) ? content : [] });
    }
    scenario.scenes = arr;
  }

  // initialize PIXI
  if (!app) initPixi();

  // slots from meta
  const slots = (scenario.meta && scenario.meta.slots) ? (scenario.meta.slots|0) : 2;
  setupCharacterSlots(slots, scenario.meta && scenario.meta.positions);

  // build scenario.characters mapping if provided in assets.characters
  if (!scenario.characters) {
    scenario.characters = {};
    if (scenario.assets && scenario.assets.characters) {
      for (const cid in scenario.assets.characters) {
        scenario.characters[cid] = scenario.characters[cid] || { name: cid, expressions: scenario.assets.characters[cid] };
      }
    }
  } else {
    // if characters defined as array (older format), convert to object keyed by folder or id
    if (Array.isArray(scenario.characters)) {
      const map = {};
      scenario.characters.forEach(c => {
        const id = c.id || c.folder || (c.name && c.name.replace(/\s+/g, "_").toLowerCase()) || c.name;
        map[id] = { name: c.name || id, expressions: (c.expressions || {}) };
      });
      scenario.characters = map;
    }
  }

  // init affection
  initAffectionFromScenario();

  // set current scene
  currentSceneId = (scenario.meta && scenario.meta.start) ? scenario.meta.start : (scenario.scenes.length>0 ? scenario.scenes[0].id : null);
  currentLineIndex = 0;

  // initial background
  const firstScene = getScene(currentSceneId);
  if (firstScene && firstScene.bg) {
    const url = resolveAsset(firstScene.bg) || firstScene.bg;
    if (url) { activeBg.texture = PIXI.Texture.from(url); activeBg.alpha = 1; standbyBg.alpha = 0; }
  } else {
    activeBg.tint = 0x111122; activeBg.alpha = 1;
  }

  redrawDialogPanel();
  showLine();
}

/* ---------- scene helper ---------- */
function getScene(id) {
  if (!scenario) return null;
  if (Array.isArray(scenario.scenes)) {
    return scenario.scenes.find(s => s.id === id) || null;
  } else if (typeof scenario.scenes === "object") {
    return scenario.scenes[id] || null;
  }
  return null;
}

/* ---------- showLine (robust: skip ex lines etc) ---------- */
function showLine() {
  const scene = getScene(currentSceneId);
  if (!scene) { console.warn("scene not found:", currentSceneId); return; }
  const lines = scene.lines || [];
  if (currentLineIndex >= lines.length) { dialogFinished(); return; }
  let line = lines[currentLineIndex];
  if (!line) { currentLineIndex++; showLine(); return; }

  // skip ex (comment/border) lines
  if (line.ex) {
    currentLineIndex++;
    showLine();
    return;
  }

  // background per-line override
  if (line.bg) changeBackground(line.bg, line.bgDuration || 0.7, !!line.dark);

  // show/hide characters
  if (line.show) applyShowCharacters(line.show);
  if (line.hide) applyHideCharacters(line.hide);

  // affection modifications before text (if present)
  if (line.affection) applyAffectionSpec(line.affection);
  if (line.aff) applyAffectionSpec(line.aff); // alias

  // expressions mapping
  if (line.expression || line.expressions) {
    applyExpressions(line.expression || line.expressions);
  }

  // choices?
  if (line.choices) {
    renderChoices(line.choices);
    return;
  }

  // text line
  showingChoices = false;
  clearChoices();
  const speakerName = (line.name) ? line.name : (line.char ? ((scenario.characters && scenario.characters[line.char] && scenario.characters[line.char].name) || line.char) : null);
  const textToShow = (speakerName ? (speakerName + "：") : "") + (line.text || "");
  showTextWithTypewriter(textToShow, line.speed || 0.025, ()=>{ /* on complete */ });

  // autosave
  if (autosaveEnabled) autoSave();
}

/* ---------- advanceLine ---------- */
function advanceLine() {
  const scene = getScene(currentSceneId);
  if (!scene) return;
  const lines = scene.lines || [];
  const line = lines[currentLineIndex];
  if (!line) { currentLineIndex++; showLine(); return; }

  // if line has explicit next
  if (line.next) {
    if (typeof line.next === "string") {
      currentSceneId = line.next; currentLineIndex = 0; showLine(); return;
    } else if (typeof line.next === "object" && line.next.scene) {
      currentSceneId = line.next.scene; currentLineIndex = line.next.index || 0; showLine(); return;
    }
  }

  // else advance in same scene
  currentLineIndex++;
  if (currentLineIndex < lines.length) showLine();
  else dialogFinished();
}

/* ---------- dialogFinished ---------- */
function dialogFinished() {
  clearChoices();
  showingChoices = false; awaitingInput = false;
  showTextWithTypewriter("【END】クリックでリスタート", 0.01, ()=>{
    const onceHandler = ()=>{ restartGame(); app.view.removeEventListener("pointerdown", onceHandler); };
    app.view.addEventListener("pointerdown", onceHandler);
  });
}

/* ---------- renderChoices ---------- */
function renderChoices(options) {
  showingChoices = true; awaitingInput = false;
  choicesBox.innerHTML = "";
  const limited = options.slice(0,4);
  limited.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = opt.text || "選択肢";
    btn.style.pointerEvents = "auto";
    btn.addEventListener("click", ()=> {
      gsap.fromTo(btn, {scale:1},{scale:0.96,duration:0.06,yoyo:true,repeat:1});
      // apply affection if present on choice
      if (opt.affection) applyAffectionSpec(opt.affection);
      if (opt.aff) applyAffectionSpec(opt.aff);
      // show/hide/expression effects on choice
      if (opt.show) applyShowCharacters(opt.show);
      if (opt.hide) applyHideCharacters(opt.hide);
      if (opt.expression) applyExpressions(opt.expression);
      // navigate
      if (opt.next) {
        if (typeof opt.next === "string") { currentSceneId = opt.next; currentLineIndex = 0; showLine(); }
        else if (typeof opt.next === "object" && opt.next.scene) { currentSceneId = opt.next.scene; currentLineIndex = opt.next.index || 0; showLine(); }
      } else {
        // default: next line in current scene
        currentLineIndex++; showLine();
      }
    });
    choicesBox.appendChild(btn);
    gsap.from(btn, {y:20, opacity:0, duration:0.45, delay: idx*0.06, ease:"power2.out"});
  });
  if (autosaveEnabled) autoSave();
}
function clearChoices() { choicesBox.innerHTML = ""; }

/* ---------- SAVE / LOAD (include affection) ---------- */
function makeSaveData() {
  return { scene: currentSceneId, index: currentLineIndex, timestamp: Date.now(), affection: affection };
}
function autoSave() {
  try {
    const data = makeSaveData();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (saveStatus) { saveStatus.textContent = "Autosaved"; gsap.fromTo(saveStatus,{opacity:0.2},{opacity:1,duration:0.4}); gsap.to(saveStatus,{opacity:0.6,duration:2,delay:0.6}); }
  } catch (e) { console.error("Auto-save failed", e); }
}
function manualSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSaveData()));
    if (saveStatus) { saveStatus.textContent = "Saved ✔"; gsap.fromTo(saveStatus,{scale:0.9},{scale:1,duration:0.25,ease:"elastic.out(1,0.6)"}); }
  } catch (e) { console.error("Save failed", e); if (saveStatus) saveStatus.textContent = "Save failed"; }
}
function manualLoad() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { if (saveStatus) saveStatus.textContent = "セーブが見つかりません"; return; }
    const data = JSON.parse(raw);
    if (!data || !data.scene) { if (saveStatus) saveStatus.textContent = "セーブデータが壊れています"; return; }
    // if scenario not loaded yet, wait: set state and call showLine after loadScenarioFromObject is called
    currentSceneId = data.scene; currentLineIndex = data.index || 0;
    if (data.affection) affection = data.affection;
    if (saveStatus) saveStatus.textContent = "Loaded ✔";
    updateMetaInfo();
    showLine();
  } catch (e) { console.error("Load failed", e); if (saveStatus) saveStatus.textContent = "Load failed"; }
}

/* ---------- restart ---------- */
function restartGame() {
  currentSceneId = (scenario && scenario.meta && scenario.meta.start) ? scenario.meta.start : (scenario && scenario.scenes && scenario.scenes.length>0 ? scenario.scenes[0].id : null);
  currentLineIndex = 0;
  clearChoices();
  showLine();
}

/* ---------- try auto load from server ---------- */
async function tryAutoLoadFromServer() {
  const params = new URLSearchParams(location.search);
  const candidate = params.get("scenario") || "scenario.json";

  async function tryFetch(path) {
    try {
      const resp = await fetch(path, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const obj = await resp.json();
      console.log("Loaded scenario from", path);
      return obj;
    } catch (e) {
      console.warn("fetch failed", path, e);
      return null;
    }
  }

  let obj = await tryFetch(candidate);
  if (obj) { loadScenarioFromObject(obj); return; }

  const listObj = await tryFetch("scenarios.json");
  if (listObj) {
    let firstPath = null;
    if (Array.isArray(listObj) && listObj.length>0) firstPath = listObj[0];
    else if (listObj.default) firstPath = listObj.default;
    else if (listObj.list && Array.isArray(listObj.list) && listObj.list.length>0) firstPath = listObj.list[0];

    if (firstPath) {
      const obj2 = await tryFetch(firstPath);
      if (obj2) { loadScenarioFromObject(obj2); return; }
    }
  }

  console.warn("No remote scenario found. Using built-in default scenario (for dev).");
  if (typeof DEFAULT_SCENARIO !== "undefined" && DEFAULT_SCENARIO) {
    loadScenarioFromObject(DEFAULT_SCENARIO);
  } else {
    alert("No scenario.json found in same folder.");
  }
}

/* ---------- DEFAULT SCENARIO (fallback) ---------- */
const DEFAULT_SCENARIO = {
  meta: { title: "デフォルト学園サンプル", author: "system", slots: 2, start: "intro", affection: { kiku: 0, taiyo: 0 } },
  assets: {
    backgrounds: { classroom: "https://picsum.photos/id/1015/1280/720", casino: "https://picsum.photos/id/1003/1280/720" },
    characters: {
      kiku: { A1: "https://i.pravatar.cc/400?img=65", A2: "https://i.pravatar.cc/400?img=67", A3: "https://i.pravatar.cc/400?img=68" },
      taiyo: { A1: "https://i.pravatar.cc/400?img=66", A2: "https://i.pravatar.cc/400?img=69", A3: "https://i.pravatar.cc/400?img=70" }
    }
  },
  characters: {
    kiku: { name: "菊", expressions: { A1: "https://i.pravatar.cc/400?img=65", A2: "https://i.pravatar.cc/400?img=67", A3: "https://i.pravatar.cc/400?img=68" } },
    taiyo: { name: "太陽", expressions: { A1: "https://i.pravatar.cc/400?img=66", A2: "https://i.pravatar.cc/400?img=69", A3: "https://i.pravatar.cc/400?img=70" } }
  },
  scenes: [
    { id: "intro", bg: "classroom", lines: [
      { ex: "----- start -----" },
      { name: "太陽", char: "taiyo", face: "A1", text: "よお菊、昨日の麻雀勝負、覚えてるか？" },
      { name: "菊", char: "kiku", face: "A3", text: "ああ、あれは運が悪かっただけだ。今日もやる気か？" },
      { choices: [
        { text: "受けて立つ！", next: "game_start", affection: { kiku: 1 } },
        { text: "やめとこう…", next: "no_game", affection: { taiyo: 1 } }
      ] }
    ] },
    { id: "game_start", bg: "casino", lines: [
      { ex: "----- match -----" },
      { name: "太陽", char: "taiyo", face: "A1", text: "ようこそ地獄の卓へ。" },
      { name: "菊", char: "kiku", face: "A2", text: "ふっ、今度は手加減しない。" },
      { choices: [
        { text: "勝負だ！", next: "ending_win", affection: { delta: { kiku: 2, taiyo: -1 } } },
        { text: "逃げる！", next: "ending_lose", affection: { delta: { kiku: -1, taiyo: 1 } } }
      ] }
    ] },
    { id: "no_game", bg: "classroom", lines: [
      { name: "菊", char: "kiku", face: "A1", text: "今日はやめておこう。宿題もあるし。" },
      { name: "太陽", char: "taiyo", face: "A3", text: "ちぇっ、つまんねーの。" }
    ] },
    { id: "ending_win", bg: "casino", lines: [
      { name: "菊", char: "kiku", face: "A2", text: "ふふっ、どうだ。これが俺の実力だ。" },
      { name: "太陽", char: "taiyo", face: "A3", text: "ぐぬぬ…菊、お前強すぎだろ！" }
    ] },
    { id: "ending_lose", bg: "casino", lines: [
      { name: "太陽", char: "taiyo", face: "A2", text: "やっぱり俺の勝ち～！" },
      { name: "菊", char: "kiku", face: "A3", text: "くそっ、次は絶対勝つ。" }
    ] }
  ]
};

/* ---------- boot ---------- */
initPixi();
tryAutoLoadFromServer();

/* ---------- UI bindings ---------- */
saveBtn && saveBtn.addEventListener("click", manualSave);
loadBtn && loadBtn.addEventListener("click", manualLoad);
restartBtn && restartBtn.addEventListener("click", ()=>{ if (scenario) restartGame(); else alert("シナリオが読み込まれていません"); });

/* ---------- expose small API for external usage ---------- */
window.VN = {
  goToScene: function(id) { if (scenario) { currentSceneId = id; currentLineIndex = 0; showLine(); } },
  setLineIndex: function(i) { currentLineIndex = Math.max(0, i|0); showLine(); },
  changeBackground: changeBackground,
  save: manualSave,
  load: manualLoad,
  restart: restartGame,
  getAffection: function() { return Object.assign({}, affection); },
  setAffection: function(obj) { applyAffectionSpec({ set: obj }); },
  addAffection: function(obj) { applyAffectionSpec({ delta: obj }); }
};
