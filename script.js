/* script.js
   JSONショートキー(assets)対応・表情差し替え・"ex"行無視版
   - デフォルトで ./scenario.json を fetch ( ?scenario=... も可 )
   - Pixi + GSAP ベース（前のパネル強化版を継承）
*/

/* ---------- 定数 / DOM ---------- */
const SAVE_KEY = "vn_json_autosave_v1";
const choicesBox = document.getElementById("choices");
const saveBtn = document.getElementById("save-btn");
const loadBtn = document.getElementById("load-btn");
const restartBtn = document.getElementById("restart-btn");
const saveStatus = document.getElementById("save-status");
const metaInfo = document.getElementById("meta-info");

/* ---------- Pixi / グローバル ---------- */
let app, stageWidth = window.innerWidth, stageHeight = window.innerHeight;
let bgSpriteA, bgSpriteB, activeBg, standbyBg, darkOverlay;
let textContainer, dialogText, panel;
let characterSlots = []; // { sprite, visible, charId }
let slotCount = 2;

/* ---------- シナリオ / 状態 ---------- */
let scenario = null;
let currentScene = null;
let lineIndex = 0;
let awaitingInput = false;
let showingChoices = false;
let typingTween = null;
let autosaveEnabled = true;

/* ---------- Helper: resolve asset key -> URL ---------- */
function resolveAsset(key) {
  if (!key) return null;
  // If looks like URL -> return as-is
  if (typeof key === "string" && (key.startsWith("http://") || key.startsWith("https://") || key.indexOf("/") !== -1)) {
    return key;
  }
  if (!scenario || !scenario.meta) return null;
  // first check scenario.meta.assets
  const a = scenario.meta.assets || {};
  if (a[key]) return a[key];
  // also check backgrounds map (legacy)
  const b = scenario.meta.backgrounds || {};
  if (b[key]) return b[key];
  console.warn("Asset key not found:", key);
  return null;
}

/* ---------- Pixi init (panel & text with stroke) ---------- */
function initPixi() {
  if (typeof PIXI === "undefined") {
    console.error("PIXI not loaded");
    return;
  }
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

  // panel & dialog text
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

  // canvas click
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
  // reposition slots if scenario meta has positions
  if (scenario && scenario.meta) applySlotPositions();
}

/* ---------- canvas click ---------- */
function onCanvasClick() {
  if (awaitingInput && !showingChoices) advanceLine();
}

/* ---------- background change (accept key or URL) ---------- */
function changeBackground(keyOrUrl, duration = 0.8, useDark = false) {
  if (!activeBg || !standbyBg) return;
  const url = resolveAsset(keyOrUrl) || keyOrUrl;
  if (!url) { console.warn("bg url not resolved:", keyOrUrl); return; }
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
  if (typingTween) { typingTween.kill(); typingTween=null; }
  dialogText.text = "";
  awaitingInput = false;
  const proxy = { i:0 };
  const total = Math.max(1, fullText.length);
  const totalDuration = Math.max(0.3, total * speedPerChar);
  typingTween = gsap.to(proxy, {
    i: total, duration: totalDuration, ease: "none",
    onUpdate: ()=> { dialogText.text = fullText.slice(0, Math.floor(proxy.i)); },
    onComplete: ()=> { dialogText.text = fullText; typingTween=null; awaitingInput=true; if (onComplete) onComplete(); }
  });
}

/* ---------- slots setup & positioning ---------- */
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

/* ---------- show characters (image key support) ---------- */
function applyShowCharacters(showList) {
  if (!Array.isArray(showList)) return;
  showList.forEach(item => {
    const idx = Math.max(0, Math.min(slotCount-1, (item.slot|0) ));
    const slotObj = characterSlots[idx];
    if (!slotObj) return;
    // image could be a key (A1) or URL
    let imageKey = item.image || item.imageKey || item.expr || item.expression;
    let url = resolveAsset(imageKey) || imageKey || null;
    // if charId + expressions mapping exists, try that first
    if (item.charId && scenario && scenario.characters && scenario.characters[item.charId]) {
      const ch = scenario.characters[item.charId];
      if (ch.expressions && imageKey && ch.expressions[imageKey]) url = ch.expressions[imageKey];
    }
    if (url) {
      slotObj.sprite.texture = PIXI.Texture.from(url);
      slotObj.sprite.visible = true;
      slotObj.charId = item.charId || slotObj.charId || null;
      if (typeof item.scale === "number") slotObj.sprite.scale.set(item.scale);
      if (typeof item.anchorY === "number") slotObj.sprite.anchor.y = item.anchorY;
      slotObj.sprite.scale.x = (item.flip ? -Math.abs(slotObj.sprite.scale.x) : Math.abs(slotObj.sprite.scale.x));
      gsap.to(slotObj.sprite, {alpha:1, duration:0.45, ease:"power2.out"});
    } else {
      console.warn("applyShowCharacters: image not resolved for", item);
    }
  });
}

/* ---------- change expressions by charId or slot ---------- */
function applyExpressions(exprSpec) {
  // exprSpec can be array [{slot:0, expr:"A2"}] or object {"haru":"A1"}
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
    // object mapping charId -> key
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
  // if charId defined and scenario.characters has expressions map, prefer that mapping
  if (slot.charId && scenario && scenario.characters && scenario.characters[slot.charId]) {
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
  // find slot showing this charId
  for (let i=0;i<characterSlots.length;i++){
    const s = characterSlots[i];
    if (s && s.charId === charId) {
      setExpressionBySlot(i, exprKey);
      return;
    }
  }
  // if not found, try to show into an empty slot (first free)
  for (let i=0;i<characterSlots.length;i++){
    const s = characterSlots[i];
    if (s && !s.charId) {
      applyShowCharacters([{slot:i, charId: charId, image: exprKey}]);
      return;
    }
  }
  console.warn("setExpressionByCharId: charId not shown in any slot", charId);
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

/* ---------- load scenario object (validate minimal) ---------- */
function loadScenarioFromObject(obj) {
  if (!obj || !obj.meta || !obj.scenes) { alert("Invalid scenario JSON: meta or scenes missing"); return; }
  scenario = obj;
  const slots = (scenario.meta.slots) ? (scenario.meta.slots|0) : 2;
  if (!app) initPixi();
  setupCharacterSlots(slots, scenario.meta.positions);
  metaInfo.textContent = `${scenario.meta.title || "無題"} — slots:${slotCount} — ${scenario.meta.author||""}`;
  currentScene = scenario.meta.start || Object.keys(scenario.scenes)[0];
  lineIndex = 0;
  // initial bg if any (resolve keys too)
  const firstLine = (scenario.scenes[currentScene] && scenario.scenes[currentScene][0]) || null;
  if (firstLine && firstLine.bg) {
    const url = resolveAsset(firstLine.bg) || firstLine.bg;
    if (url) {
      activeBg.texture = PIXI.Texture.from(url); activeBg.alpha = 1; standbyBg.alpha = 0;
    }
  } else {
    activeBg.tint = 0x111122; activeBg.alpha = 1;
  }
  // if scenario.characters has initial expressions mapping, we could preload expressions map - not necessary now
  redrawDialogPanel();
  showLine();
}

/* ---------- showLine (skip lines with ex key) ---------- */
function showLine() {
  if (!scenario || !scenario.scenes || !scenario.scenes[currentScene]) { console.warn("no scene", currentScene); return; }
  const lines = scenario.scenes[currentScene];
  if (!lines || lines.length === 0) { dialogFinished(); return; }
  if (lineIndex >= lines.length) { dialogFinished(); return; }
  const line = lines[lineIndex];

  // ignore comment/ex lines (for JSON readability)
  if (line.ex) {
    lineIndex++;
    showLine();
    return;
  }

  // bg change (key or URL)
  if (line.bg) changeBackground(line.bg, line.bgDuration||0.7, !!line.dark);

  // show/hide characters
  if (line.show) applyShowCharacters(line.show);
  if (line.hide) applyHideCharacters(line.hide);

  // expressions (either apply before text or after; we apply before text)
  if (line.expression) applyExpressions(line.expression);
  if (line.expressions) applyExpressions(line.expressions); // alt key

  // choices?
  if (line.choices) {
    renderChoices(line.choices);
    return;
  }

  // text line -> speaker prefix if any
  showingChoices = false;
  clearChoices();
  const speakerName = (line.speaker && scenario.characters && scenario.characters[line.speaker]) ? scenario.characters[line.speaker].name : null;
  const textToShow = (speakerName ? (speakerName + "：") : "") + (line.text || "");
  showTextWithTypewriter(textToShow, line.speed || 0.025, ()=>{});
  if (autosaveEnabled) autoSave();
}

/* ---------- advanceLine ---------- */
function advanceLine() {
  const lines = scenario.scenes[currentScene];
  if (!lines) return;
  const line = lines[lineIndex];
  if (!line) return;

  if (line.next) {
    if (typeof line.next === "string") { currentScene = line.next; lineIndex = 0; showLine(); return; }
    else if (typeof line.next === "object" && line.next.scene) { currentScene = line.next.scene; lineIndex = line.next.index||0; showLine(); return; }
  }

  // default -> next line in same scene
  lineIndex++;
  if (lineIndex < lines.length) showLine();
  else dialogFinished();
}

/* ---------- dialogFinished ---------- */
function dialogFinished() {
  clearChoices();
  showingChoices=false; awaitingInput=false;
  showTextWithTypewriter("【END】クリックでリスタート", 0.01, ()=>{
    const onceHandler = ()=>{ restartGame(); app.view.removeEventListener("pointerdown", onceHandler); };
    app.view.addEventListener("pointerdown", onceHandler);
  });
}

/* ---------- choices render ---------- */
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
      if (opt.show) applyShowCharacters(opt.show);
      if (opt.hide) applyHideCharacters(opt.hide);
      if (opt.expression) applyExpressions(opt.expression);
      if (opt.next) {
        if (typeof opt.next === "string") { currentScene = opt.next; lineIndex = 0; showLine(); }
        else if (typeof opt.next === "object" && opt.next.scene) { currentScene = opt.next.scene; lineIndex = opt.next.index||0; showLine(); }
      } else {
        lineIndex++; showLine();
      }
    });
    choicesBox.appendChild(btn);
    gsap.from(btn, {y:20, opacity:0, duration:0.45, delay: idx*0.06, ease:"power2.out"});
  });
  if (autosaveEnabled) autoSave();
}
function clearChoices() { choicesBox.innerHTML = ""; }

/* ---------- save/load ---------- */
function makeSaveData(){ return { scene: currentScene, index: lineIndex, timestamp: Date.now() }; }
function autoSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(makeSaveData())); if(saveStatus){ saveStatus.textContent="Autosaved"; gsap.fromTo(saveStatus,{opacity:0.2},{opacity:1,duration:0.4}); gsap.to(saveStatus,{opacity:0.6,duration:2,delay:0.6}); } }
  catch(e){ console.error("autosave fail", e); }
}
function manualSave(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(makeSaveData())); if(saveStatus){ saveStatus.textContent="Saved ✔"; gsap.fromTo(saveStatus,{scale:0.9},{scale:1,duration:0.25,ease:"elastic.out(1,0.6)"}); } } catch(e){ console.error("save fail", e); if(saveStatus) saveStatus.textContent="Save failed"; } }
function manualLoad(){ try{ const raw = localStorage.getItem(SAVE_KEY); if(!raw){ if(saveStatus) saveStatus.textContent = "セーブが見つかりません"; return; } const data = JSON.parse(raw); if(!data || !data.scene || !scenario.scenes[data.scene]){ if(saveStatus) saveStatus.textContent="セーブデータが壊れています"; return; } currentScene = data.scene; lineIndex = data.index||0; if(saveStatus) saveStatus.textContent="Loaded ✔"; showLine(); } catch(e){ console.error("load fail", e); if(saveStatus) saveStatus.textContent="Load failed"; } }

/* ---------- restart ---------- */
function restartGame(){ currentScene = scenario.meta.start || Object.keys(scenario.scenes)[0]; lineIndex = 0; clearChoices(); showLine(); }

/* ---------- auto load from server (scenario.json or ?scenario=) ---------- */
async function tryAutoLoadFromServer() {
  const params = new URLSearchParams(location.search);
  const candidate = params.get("scenario") || "scenario.json";

  async function tryFetch(path) {
    try {
      const resp = await fetch(path, {cache: "no-store"});
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
    alert("No scenario.json found. Please upload scenario.json in same folder.");
  }
}

/* ---------- default scenario (fallback) ---------- */
const DEFAULT_SCENARIO = {
  meta: {
    title: "デフォルト学園（assets例）",
    author: "system",
    slots: 2,
    positions: [{x:0.25,y:0.95},{x:0.75,y:0.95}],
    start: "start",
    assets: { // short keys -> actual URLs
      "A1": "https://i.pravatar.cc/400?img=65",
      "A2": "https://i.pravatar.cc/400?img=67",
      "B1": "https://i.pravatar.cc/400?img=66",
      "BG1": "https://picsum.photos/id/1015/1280/720",
      "BG2": "https://picsum.photos/id/1003/1280/720"
    }
  },
  characters: {
    haru: { name: "春川 はる",
      expressions: { "A1":"https://i.pravatar.cc/400?img=65", "A2":"https://i.pravatar.cc/400?img=67" }
    },
    miyu: { name: "水無月 みゆ",
      expressions: { "B1":"https://i.pravatar.cc/400?img=66" }
    }
  },
  scenes: {
    start: [
      { bg: "BG1", text: "朝の教室。窓から光が差し込む。", next: "enter" }
    ],
    enter: [
      { ex: "-------------" },
      { show: [ {slot:0, charId:"haru", image:"A1", scale:0.95}, {slot:1, charId:"miyu", image:"B1", scale:0.95} ] },
      { speaker: "haru", text: "おはよう！今日、頑張ろうね。", next: "choice_morning" }
    ],
    choice_morning: [
      { choices: [
          { text: "もちろん！", next: "study", expression: { "haru":"A2" } },
          { text: "ちょっと眠い...", next: "sleepy", expression: { "haru":"A1" } }
        ]
      }
    ],
    study: [ { speaker: "miyu", text: "よし、放課後に教え合おう！", next: "after_school" } ],
    sleepy: [ { speaker: "miyu", text: "今日はゆっくりしてもいいよ。", next: "after_school" } ],
    after_school: [ { bg: "BG2", dark: true, text: "放課後。教室には二人だけになった。", next: "finale" } ],
    finale: [ { text: "夕陽に照らされて、今日の出来事が少し特別に感じる。", next: null } ]
  }
};

/* ---------- boot ---------- */
initPixi();
tryAutoLoadFromServer();

/* ---------- UI bindings ---------- */
saveBtn && saveBtn.addEventListener("click", manualSave);
loadBtn && loadBtn.addEventListener("click", manualLoad);
restartBtn && restartBtn.addEventListener("click", ()=>{ if (scenario) restartGame(); else alert("シナリオが読み込まれていません"); });

/* END of script.js */
