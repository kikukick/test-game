/* script.js — JSON自動読み込み対応版（ダイアログ常時パネル強化済み） */

/* ---------- 定数 / DOM ---------- */
const SAVE_KEY = "vn_json_autosave_v1";

const choicesBox = document.getElementById("choices");
const saveBtn = document.getElementById("save-btn");
const loadBtn = document.getElementById("load-btn");
const restartBtn = document.getElementById("restart-btn");
const saveStatus = document.getElementById("save-status");
const metaInfo = document.getElementById("meta-info");

/* ---------- Pixi / グローバル変数 ---------- */
let app, stageWidth = window.innerWidth, stageHeight = window.innerHeight;
let bgSpriteA, bgSpriteB, activeBg, standbyBg, darkOverlay;
let textContainer, dialogText, panel; // panel をグローバルに
let characterSlots = []; // キャラスロット配列
let slotCount = 2;

/* シナリオ / 状態 */
let scenario = null;
let currentScene = null;
let lineIndex = 0;
let awaitingInput = false;
let showingChoices = false;
let typingTween = null;
let autosaveEnabled = true;

/* ---------- 初期化 / Pixi ---------- */
function initPixi() {
  if (typeof PIXI === "undefined") {
    console.error("PIXI is not loaded.");
    return;
  }
  if (app) return; // 既に初期化済みならスキップ

  app = new PIXI.Application({
    width: stageWidth, height: stageHeight, resolution: devicePixelRatio || 1,
    autoDensity: true, backgroundAlpha: 0
  });
  document.getElementById("pixi-container").innerHTML = "";
  document.getElementById("pixi-container").appendChild(app.view);

  // 背景スプライト x2（フェード切替用）
  bgSpriteA = new PIXI.Sprite(PIXI.Texture.WHITE);
  bgSpriteB = new PIXI.Sprite(PIXI.Texture.WHITE);
  [bgSpriteA, bgSpriteB].forEach(s=>{
    s.width = stageWidth; s.height = stageHeight;
    s.anchor.set(0.5); s.x = stageWidth/2; s.y = stageHeight/2; s.alpha = 0;
    app.stage.addChild(s);
  });
  activeBg = bgSpriteA; standbyBg = bgSpriteB;

  // 暗転オーバーレイ
  darkOverlay = new PIXI.Graphics();
  darkOverlay.beginFill(0x000000); darkOverlay.drawRect(0,0,stageWidth,stageHeight); darkOverlay.endFill();
  darkOverlay.alpha = 0;
  app.stage.addChild(darkOverlay);

  // テキストコンテナ（下部） — panel と dialogText をこの中に入れる
  textContainer = new PIXI.Container();
  textContainer.x = stageWidth * 0.06;
  textContainer.y = stageHeight * 0.68;
  app.stage.addChild(textContainer);

  // create panel (グローバル変数)
  panel = new PIXI.Graphics();
  redrawDialogPanel(); // 初回描画（関数は下で定義）
  textContainer.addChild(panel);

  // ダイアログ用 Pixi.Text（スタイル強化）
  const style = new PIXI.TextStyle({
    fontFamily: "Yu Gothic, Noto Sans JP, sans-serif",
    fontSize: Math.max(18, Math.round(stageWidth*0.018)),
    fill: "#ffffff",
    wordWrap: true,
    wordWrapWidth: Math.max(200, stageWidth * 0.88 - 40),
    lineHeight: Math.max(26, Math.round(stageWidth*0.024)),
    // 視認性向上
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

/* ---------- ダイアログパネルを描き直す関数 ---------- */
function redrawDialogPanel() {
  if (!panel) panel = new PIXI.Graphics();
  panel.clear();
  const panelW = Math.max(360, stageWidth * 0.88);
  const panelH = Math.max(120, stageHeight * 0.22);
  const radius = Math.max(8, Math.round(Math.min(panelW, panelH) * 0.02));

  // 背景 (黒・やや不透明)
  panel.beginFill(0x000000, 0.65);
  panel.lineStyle(2, 0x222233, 0.6); // 薄い枠線で文字と背景の区切りを明確化
  panel.drawRoundedRect(0, 0, panelW, panelH, radius);
  panel.endFill();

  // 少し内側に光の縁取り（薄く）
  panel.beginFill(0x000000, 0); // no fill, but line
  panel.lineStyle(1, 0xffffff, 0.03);
  panel.drawRoundedRect(2, 2, panelW-4, panelH-4, radius-2);
  panel.endFill();

  // サイズに合わせて dialogText の wrap を調整（dialogText が未定義でも安全）
  if (dialogText && dialogText.style) {
    dialogText.style.wordWrapWidth = Math.max(200, panelW - 40);
    // adjust fontSize and lineHeight mildly depending on width
    dialogText.style.fontSize = Math.max(16, Math.round(stageWidth*0.018));
    dialogText.style.lineHeight = Math.max(24, Math.round(stageWidth*0.024));
  }
}

/* ---------- リサイズ ---------- */
function onResize() {
  stageWidth = window.innerWidth; stageHeight = window.innerHeight;
  if (!app) return;
  app.renderer.resize(stageWidth, stageHeight);
  [bgSpriteA, bgSpriteB].forEach(s => { if(s){ s.width = stageWidth; s.height = stageHeight; s.x = stageWidth/2; s.y = stageHeight/2; }});
  darkOverlay.clear(); darkOverlay.beginFill(0x000000); darkOverlay.drawRect(0,0,stageWidth,stageHeight); darkOverlay.endFill();
  if (textContainer) textContainer.y = stageHeight * 0.68;

  // redraw panel and update dialogText wrap/font
  redrawDialogPanel();

  // adjust panel/ textContainer children ordering to keep panel below text
  if (textContainer && panel) {
    // ensure panel is below dialogText
    if (textContainer.getChildIndex(panel) > textContainer.getChildIndex(dialogText)) {
      textContainer.setChildIndex(panel, 0);
      textContainer.setChildIndex(dialogText, 1);
    }
  }

  // reposition character slots if scenario defines positions
  if (scenario && scenario.meta) applySlotPositions();
}

/* ---------- クリック処理 ---------- */
function onCanvasClick() {
  if (awaitingInput && !showingChoices) advanceLine();
}

/* ---------- 背景切替 ---------- */
function changeBackground(url, duration = 0.8, useDark = false) {
  if (!activeBg || !standbyBg) return;
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

/* ---------- タイプライター ---------- */
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
    onComplete: ()=> { dialogText.text = fullText; typingTween = null; awaitingInput = true; if (onComplete) onComplete(); }
  });
}

/* ---------- スロット設定 ---------- */
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

/* ---------- キャラ表示操作 ---------- */
function applyShowCharacters(showList) {
  if (!Array.isArray(showList)) return;
  showList.forEach(item => {
    const idx = Math.max(0, Math.min(slotCount-1, item.slot|0));
    const slotObj = characterSlots[idx];
    if (!slotObj) return;
    if (item.image) {
      slotObj.sprite.texture = PIXI.Texture.from(item.image);
      slotObj.sprite.visible = true;
      slotObj.charId = item.charId || null;
      if (item.scale) slotObj.sprite.scale.set(item.scale);
      if (item.anchorY) slotObj.sprite.anchor.y = item.anchorY;
      slotObj.sprite.scale.x = (item.flip ? -Math.abs(slotObj.sprite.scale.x) : Math.abs(slotObj.sprite.scale.x));
      gsap.to(slotObj.sprite, {alpha:1, duration:0.45, ease:"power2.out"});
    }
  });
}
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

/* ---------- シナリオ読み込み（オブジェクト） ---------- */
function loadScenarioFromObject(obj) {
  if (!obj || !obj.meta || !obj.scenes) {
    alert("Invalid scenario JSON: meta or scenes missing");
    return;
  }
  scenario = obj;
  const slots = (scenario.meta.slots) ? (scenario.meta.slots|0) : 2;
  if (!app) initPixi();
  setupCharacterSlots(slots, scenario.meta.positions);
  metaInfo.textContent = `${scenario.meta.title || "無題"} — slots:${slotCount} — ${scenario.meta.author||""}`;
  currentScene = scenario.meta.start || Object.keys(scenario.scenes)[0];
  lineIndex = 0;
  const firstLine = (scenario.scenes[currentScene] && scenario.scenes[currentScene][0]) || null;
  if (firstLine && firstLine.bg) {
    activeBg.texture = PIXI.Texture.from(firstLine.bg);
    activeBg.alpha = 1;
    standbyBg.alpha = 0;
  } else {
    activeBg.tint = 0x111122; activeBg.alpha = 1;
  }
  // ensure panel/redraw in case sizes changed
  redrawDialogPanel();
  showLine();
}

/* ---------- showLine / advanceLine / dialogFinished ---------- */
function showLine() {
  if (!scenario || !scenario.scenes || !scenario.scenes[currentScene]) { console.warn("no scene", currentScene); return; }
  const lines = scenario.scenes[currentScene];
  if (!lines || lines.length === 0) { dialogFinished(); return; }
  if (lineIndex >= lines.length) { dialogFinished(); return; }
  const line = lines[lineIndex];

  if (line.bg) changeBackground(line.bg, line.bgDuration||0.7, !!line.dark);
  if (line.show) applyShowCharacters(line.show);
  if (line.hide) applyHideCharacters(line.hide);

  if (line.choices) {
    renderChoices(line.choices);
    return;
  }

  showingChoices = false;
  clearChoices();
  const speakerName = (line.speaker && scenario.characters && scenario.characters[line.speaker]) ? scenario.characters[line.speaker].name : null;
  const textToShow = (speakerName ? (speakerName + "：") : "") + (line.text || "");
  // always keep the panel visible behind the text — panel is separate Pixi graphics
  showTextWithTypewriter(textToShow, line.speed || 0.025, ()=>{});
  if (autosaveEnabled) autoSave();
}

function advanceLine() {
  const lines = scenario.scenes[currentScene];
  if (!lines) return;
  const line = lines[lineIndex];
  if (!line) return;

  if (line.next) {
    if (typeof line.next === "string") { currentScene = line.next; lineIndex = 0; showLine(); return; }
    else if (typeof line.next === "object" && line.next.scene) { currentScene = line.next.scene; lineIndex = line.next.index||0; showLine(); return; }
  }

  lineIndex++;
  if (lineIndex < lines.length) showLine();
  else dialogFinished();
}

function dialogFinished() {
  clearChoices();
  showingChoices=false; awaitingInput=false;
  showTextWithTypewriter("【END】クリックでリスタート", 0.01, ()=>{
    const onceHandler = ()=>{ restartGame(); app.view.removeEventListener("pointerdown", onceHandler); };
    app.view.addEventListener("pointerdown", onceHandler);
  });
}

/* ---------- 選択肢 ---------- */
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

/* ---------- セーブ / ロード ---------- */
function makeSaveData(){ return { scene: currentScene, index: lineIndex, timestamp: Date.now() }; }
function autoSave(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(makeSaveData())); if(saveStatus){ saveStatus.textContent="Autosaved"; gsap.fromTo(saveStatus,{opacity:0.2},{opacity:1,duration:0.4}); gsap.to(saveStatus,{opacity:0.6,duration:2,delay:0.6}); } }
  catch(e){ console.error("autosave fail", e); }
}
function manualSave(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(makeSaveData())); if(saveStatus){ saveStatus.textContent="Saved ✔"; gsap.fromTo(saveStatus,{scale:0.9},{scale:1,duration:0.25,ease:"elastic.out(1,0.6)"}); } } catch(e){ console.error("save fail", e); if(saveStatus) saveStatus.textContent="Save failed"; } }
function manualLoad(){ try{ const raw = localStorage.getItem(SAVE_KEY); if(!raw){ if(saveStatus) saveStatus.textContent = "セーブが見つかりません"; return; } const data = JSON.parse(raw); if(!data || !data.scene || !scenario.scenes[data.scene]){ if(saveStatus) saveStatus.textContent="セーブデータが壊れています"; return; } currentScene = data.scene; lineIndex = data.index||0; if(saveStatus) saveStatus.textContent="Loaded ✔"; showLine(); } catch(e){ console.error("load fail", e); if(saveStatus) saveStatus.textContent="Load failed"; } }

/* ---------- リスタート ---------- */
function restartGame(){ currentScene = scenario.meta.start || Object.keys(scenario.scenes)[0]; lineIndex = 0; clearChoices(); showLine(); }

/* ---------- 自動読み込み（サーバ上のJSONを取得） ---------- */
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
    alert("シナリオファイル(scenario.json)が見つかりませんでした。\n同ディレクトリに scenario.json を配置するか、デバッグ用のシナリオを用意してください。");
  }
}

/* ---------- デフォルトシナリオ（フェールバック） ---------- */
const DEFAULT_SCENARIO = {
  meta: { title: "デフォルト学園サンプル", author: "system", slots: 2, start: "start" },
  characters: { alice: { name: "アリス" }, bob: { name: "ボブ" } },
  scenes: {
    start: [ { text: "朝の教室。太陽が差し込んでいる。", bg: "https://picsum.photos/id/1015/1280/720", next: "greeting" } ],
    greeting: [
      { show: [ {slot:0,charId:"alice",image:"https://i.pravatar.cc/300?img=5",scale:0.9}, {slot:1,charId:"bob",image:"https://i.pravatar.cc/300?img=6",scale:0.9} ] },
      { speaker: "alice", text: "おはよう！今日はテストだよね…", next: "choice1" }
    ],
    choice1: [ { choices: [ { text: "がんばろう！", next: "encourage" }, { text: "寝坊したい", next: "sleepIn" } ] } ],
    encourage: [ { speaker: "bob", text: "よし、放課後勉強会だ！", next: "end_good" } ],
    sleepIn: [ { speaker: "alice", text: "あはは、そっちもありだね。", next: "end_bad" } ],
    end_good: [ { text: "交友を深めて物語は続く…", next: null } ],
    end_bad: [ { text: "眠りに落ちる…それもまた青春。", next: null } ]
  }
};

/* ---------- 起動処理 ---------- */
initPixi();
tryAutoLoadFromServer();

/* ---------- UI ボタンイベント ---------- */
saveBtn && saveBtn.addEventListener("click", manualSave);
loadBtn && loadBtn.addEventListener("click", manualLoad);
restartBtn && restartBtn.addEventListener("click", ()=>{ if (scenario) restartGame(); else alert("シナリオが読み込まれていません"); });

/* ---------- 追加メモ ----------
- 文字とパネルの色は現在「白文字・黒半透明パネル」に固定しているため、
  どんな背景でも可読性が確保されます。必要ならシナリオ JSON 内でパネル色/不透明度を指定できるよう拡張できます。
- もし「パネルを透かして背景の一部が見えるブラー効果（ガラスモーフ）」を入れたい場合は Pixi フィルタ（GaussianBlur）を導入できますが、
  Netlify/GitHub Pages 向けに互換性良くするために今回の実装はフィルタを使わずに安全にしています。
------------------------------- */

