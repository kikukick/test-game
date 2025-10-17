/* script.js - Pixi + GSAP Visual Novel (修正版・全文)
   前提: HTML に #pixi-container, #choices, #save-btn, #load-btn, #restart-btn, #save-status がある
   Pixi と GSAP は CDN で読み込まれているものとする。
*/

// ======= シーン定義（例） =======
const scenes = {
  start: [
    { text: "……目を覚ました。", bg: "https://picsum.photos/id/1015/1280/720", next: "intro" }
  ],
  intro: [
    { text: "ここはどこだろう？", bg: "https://picsum.photos/id/1016/1280/720", next: "choice_intro" }
  ],
  choice_intro: [
    { choices: [
        { text: "辺りを見回す", next: "look_around" },
        { text: "寝直す", next: "sleep" }
      ]
    }
  ],
  look_around: [
    { text: "薄暗い部屋の中だ。壁に扉がある。", bg: "https://picsum.photos/id/1025/1280/720", next: "door_choice" }
  ],
  door_choice: [
    { choices: [
        { text: "扉を開ける", next: "open_door" },
        { text: "もう少し調べる", next: "inspect_room" },
        { text: "叫ぶ", next: "shout" }
      ]
    }
  ],
  open_door: [
    { text: "扉を開くと、光が差し込んだ。", bg: "https://picsum.photos/id/1003/1280/720", next: "end_good", dark: false }
  ],
  inspect_room: [
    { text: "机の上に古い鍵があった。", bg: "https://picsum.photos/id/1040/1280/720", next: "find_key" }
  ],
  find_key: [
    { text: "……この鍵、どこかで使えるかも。", next: "end_good" }
  ],
  shout: [
    { text: "返事は無かった。ただ静寂だけが広がる。", next: "end_bad" }
  ],
  sleep: [
    { text: "……再び眠りについた。", next: "end_bad" }
  ],
  end_good: [
    { text: "外の世界へ出た。物語は始まったばかりだ。", next: null }
  ],
  end_bad: [
    { text: "永遠に目覚めることはなかった……。", next: null }
  ]
};

// ======= 保存キーなど =======
const SAVE_KEY = "vn_autosave_v1";

// ======= グローバル変数宣言（未初期化で宣言のみ） =======
let app;
let bgSpriteA, bgSpriteB;
let activeBg, standbyBg; // ← ここは initPixi() 内で代入する
let darkOverlay;
let dialogText;
let textContainer;
let typingTween = null;
let awaitingInput = false;
let showingChoices = false;

// ステージサイズ
let stageWidth = window.innerWidth;
let stageHeight = window.innerHeight;

// ======= DOM 要素 =======
const choicesBox = document.getElementById("choices");
const saveBtn = document.getElementById("save-btn");
const loadBtn = document.getElementById("load-btn");
const restartBtn = document.getElementById("restart-btn");
const saveStatus = document.getElementById("save-status");

// ======= ゲームステート初期値 =======
let currentScene = "start";
let lineIndex = 0;
let autosaveEnabled = true;

// ======= Pixi 初期化関数 =======
function initPixi() {
  if (typeof PIXI === "undefined") {
    console.error("PIXI is not loaded. Please include pixi.js via CDN.");
    return;
  }
  app = new PIXI.Application({
    width: stageWidth,
    height: stageHeight,
    resolution: devicePixelRatio || 1,
    autoDensity: true,
    backgroundAlpha: 0
  });
  const container = document.getElementById("pixi-container");
  container.innerHTML = ""; // 既存 canvas をクリア
  container.appendChild(app.view);

  // 背景用スプライトを2つ用意（フェード切替用）
  bgSpriteA = new PIXI.Sprite(PIXI.Texture.WHITE);
  bgSpriteB = new PIXI.Sprite(PIXI.Texture.WHITE);
  [bgSpriteA, bgSpriteB].forEach(s => {
    s.width = stageWidth;
    s.height = stageHeight;
    s.anchor = new PIXI.Point(0.5, 0.5);
    s.x = stageWidth / 2;
    s.y = stageHeight / 2;
    s.alpha = 0;
    app.stage.addChild(s);
  });

  // active/standby の参照をここで確実に設定
  activeBg = bgSpriteA;
  standbyBg = bgSpriteB;

  // 暗転用オーバーレイ
  darkOverlay = new PIXI.Graphics();
  darkOverlay.beginFill(0x000000);
  darkOverlay.drawRect(0, 0, stageWidth, stageHeight);
  darkOverlay.endFill();
  darkOverlay.alpha = 0;
  app.stage.addChild(darkOverlay);

  // テキスト用コンテナ（下部）
  textContainer = new PIXI.Container();
  textContainer.x = stageWidth * 0.06;
  textContainer.y = stageHeight * 0.68;
  app.stage.addChild(textContainer);

  // 下部パネル（半透明）
  const panel = new PIXI.Graphics();
  const panelW = stageWidth * 0.88;
  const panelH = stageHeight * 0.22;
  panel.beginFill(0x000000, 0.45);
  panel.drawRoundedRect(0, 0, panelW, panelH, 12);
  panel.endFill();
  panel.x = 0;
  panel.y = 0;
  textContainer.addChild(panel);

  // ダイアログ用 Pixi.Text
  const style = new PIXI.TextStyle({
    fontFamily: "Yu Gothic, Noto Sans JP, sans-serif",
    fontSize: Math.max(18, Math.round(stageWidth * 0.018)),
    fill: "#ffffff",
    wordWrap: true,
    wordWrapWidth: panelW - 40,
    lineHeight: Math.max(26, Math.round(stageWidth * 0.024))
  });
  dialogText = new PIXI.Text("", style);
  dialogText.x = 20;
  dialogText.y = 18;
  dialogText.alpha = 1;
  textContainer.addChild(dialogText);

  // クリックで進める（ポインタ）
  app.view.style.cursor = "pointer";
  // pointerdown の handler は常に一つだけ稼働するよう関数内で判定
  app.view.addEventListener("pointerdown", onCanvasPointerDown);

  // リサイズ対応
  window.addEventListener("resize", onResize);
}

// ======= リサイズ処理 =======
function onResize() {
  stageWidth = window.innerWidth;
  stageHeight = window.innerHeight;
  if (!app) return;
  app.renderer.resize(stageWidth, stageHeight);
  [bgSpriteA, bgSpriteB].forEach(s => {
    if (!s) return;
    s.width = stageWidth;
    s.height = stageHeight;
    s.x = stageWidth / 2;
    s.y = stageHeight / 2;
  });
  darkOverlay.clear();
  darkOverlay.beginFill(0x000000);
  darkOverlay.drawRect(0, 0, stageWidth, stageHeight);
  darkOverlay.endFill();
  // テキスト位置の調整
  if (textContainer) {
    textContainer.y = stageHeight * 0.68;
  }
}

// ======= Canvas のクリックハンドラ =======
function onCanvasPointerDown() {
  if (awaitingInput && !showingChoices) {
    advanceLine();
  }
}

// ======= 背景切替ユーティリティ =======
function changeBackground(url, duration = 0.8, useDark = false) {
  if (!app || !activeBg || !standbyBg) return;
  try {
    // テクスチャ読み込み
    const texture = PIXI.Texture.from(url);
    standbyBg.texture = texture;
    standbyBg.alpha = 0;
    // 優先順の調整（念のため）
    app.stage.setChildIndex(standbyBg, 0);

    if (useDark) {
      gsap.to(darkOverlay, {
        alpha: 1, duration: duration / 2, ease: "power1.inOut", onComplete: () => {
          gsap.to(standbyBg, { alpha: 1, duration: duration / 2, ease: "power1.inOut", onComplete: swapBg });
          gsap.to(activeBg, { alpha: 0, duration: duration / 2, ease: "power1.inOut" });
        }
      });
    } else {
      gsap.to(standbyBg, { alpha: 1, duration: duration, ease: "power1.inOut", onComplete: swapBg });
      gsap.to(activeBg, { alpha: 0, duration: duration, ease: "power1.inOut" });
    }
  } catch (e) {
    console.error("changeBackground failed:", e);
  }

  function swapBg() {
    const tmp = activeBg;
    activeBg = standbyBg;
    standbyBg = tmp;
    // 暗転解除を確実に行う
    gsap.to(darkOverlay, { alpha: 0, duration: 0.3, ease: "power1.inOut" });
  }
}

// ======= タイプライター（Pixi + GSAP） =======
function showTextWithTypewriter(fullText, speedPerChar = 0.03, onComplete) {
  if (!dialogText) return;
  if (typingTween) {
    typingTween.kill();
    typingTween = null;
  }
  dialogText.text = "";
  awaitingInput = false;
  const proxy = { i: 0 };
  const total = Math.max(1, fullText.length);
  const totalDuration = Math.max(0.3, total * speedPerChar);

  typingTween = gsap.to(proxy, {
    i: total,
    duration: totalDuration,
    ease: "none",
    onUpdate: function() {
      const n = Math.floor(proxy.i);
      dialogText.text = fullText.slice(0, n);
    },
    onComplete: function() {
      dialogText.text = fullText;
      typingTween = null;
      awaitingInput = true;
      if (typeof onComplete === "function") onComplete();
    }
  });
}

// ======= 選択肢 DOM & ボタンイベント =======
saveBtn && saveBtn.addEventListener("click", manualSave);
loadBtn && loadBtn.addEventListener("click", manualLoad);
restartBtn && restartBtn.addEventListener("click", restartGame);

// ======= 表示ルーチン =======
function showLine() {
  if (!scenes[currentScene]) {
    console.warn("scene not found:", currentScene);
    return;
  }
  const lines = scenes[currentScene];
  if (!lines || lines.length === 0) {
    dialogFinished();
    return;
  }
  if (lineIndex >= lines.length) {
    dialogFinished();
    return;
  }

  const line = lines[lineIndex];

  // 背景変更
  if (line.bg) {
    changeBackground(line.bg, 0.7, !!line.dark);
  }

  // 選択肢行
  if (line.choices) {
    renderChoices(line.choices);
    return;
  }

  // テキスト行
  showingChoices = false;
  clearChoices();
  const textToShow = (typeof line.text === "string") ? line.text : "";
  showTextWithTypewriter(textToShow, 0.025, function(){ /* 表示完了後の処理があればここに */ });

  // autosave
  if (autosaveEnabled) autoSave();
}

// ======= 進行処理 =======
function advanceLine() {
  const lines = scenes[currentScene];
  if (!lines) return;
  const line = lines[lineIndex];
  if (!line) return;

  if (line.next) {
    currentScene = line.next;
    lineIndex = 0;
    showLine();
  } else {
    // 同シーンの次行に進む可能性：もし next が null ならシーンの終了扱い
    lineIndex++;
    // 次の行が存在すれば表示、なければ終了
    if (lineIndex < (scenes[currentScene] ? scenes[currentScene].length : 0)) {
      showLine();
    } else {
      dialogFinished();
    }
  }
}

// ======= 終了表示（END） =======
function dialogFinished() {
  clearChoices();
  showingChoices = false;
  awaitingInput = false;
  showTextWithTypewriter("【END】クリックでリスタート", 0.01, function() {
    // クリックで restart - 1 回だけ受ける
    const onceHandler = function() {
      restartGame();
      app.view.removeEventListener("pointerdown", onceHandler);
    };
    app.view.addEventListener("pointerdown", onceHandler);
  });
}

// ======= 選択肢描画 =======
function renderChoices(options) {
  showingChoices = true;
  awaitingInput = false;
  choicesBox.innerHTML = "";
  const limited = options.slice(0, 4);
  limited.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = opt.text || "選択肢";
    btn.style.pointerEvents = "auto";
    // クリック処理
    btn.addEventListener("click", function onChoiceClick(e) {
      // 簡単な押下感アニメ
      gsap.fromTo(btn, { scale: 1 }, { scale: 0.96, duration: 0.06, yoyo: true, repeat: 1 });
      // 選択結果を適用
      const next = opt.next;
      if (typeof next === "string" && scenes[next]) {
        currentScene = next;
        lineIndex = 0;
      } else {
        // next が無ければ同シーンの次へ（保険）
        lineIndex++;
      }
      clearChoices();
      showLine();
    });
    choicesBox.appendChild(btn);
    gsap.from(btn, { y: 20, opacity: 0, duration: 0.45, delay: idx * 0.06, ease: "power2.out" });
  });

  if (autosaveEnabled) autoSave();
}

function clearChoices() {
  choicesBox.innerHTML = "";
}

// ======= セーブ / ロード =======
function makeSaveData() {
  return {
    scene: currentScene,
    index: lineIndex,
    timestamp: Date.now()
  };
}

function autoSave() {
  try {
    const data = makeSaveData();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (saveStatus) {
      saveStatus.textContent = "Autosaved";
      gsap.fromTo(saveStatus, { opacity: 0.2 }, { opacity: 1, duration: 0.4, overwrite: true });
      gsap.to(saveStatus, { opacity: 0.6, duration: 2, delay: 0.6 });
    }
  } catch (e) {
    console.error("Auto-save failed", e);
  }
}

function manualSave() {
  try {
    const data = makeSaveData();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (saveStatus) {
      saveStatus.textContent = "Saved ✔";
      gsap.fromTo(saveStatus, { scale: 0.9 }, { scale: 1, duration: 0.25, ease: "elastic.out(1,0.6)" });
    }
  } catch (e) {
    console.error("Save failed", e);
    if (saveStatus) saveStatus.textContent = "Save failed";
  }
}

function manualLoad() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      if (saveStatus) saveStatus.textContent = "セーブが見つかりません";
      return;
    }
    const data = JSON.parse(raw);
    if (!data || !data.scene || !scenes[data.scene]) {
      if (saveStatus) saveStatus.textContent = "セーブデータが壊れています";
      return;
    }
    currentScene = data.scene;
    lineIndex = data.index || 0;
    if (saveStatus) saveStatus.textContent = "Loaded ✔";
    showLine();
  } catch (e) {
    console.error("Load failed", e);
    if (saveStatus) saveStatus.textContent = "Load failed";
  }
}

function restartGame() {
  currentScene = "start";
  lineIndex = 0;
  clearChoices();
  showLine();
}

// ======= 自動ロード（起動時に autosave があれば復帰） =======
(function tryAutoLoadOnStart() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.scene && scenes[data.scene]) {
        currentScene = data.scene;
        lineIndex = data.index || 0;
      }
    } catch (e) {
      console.warn("Invalid autosave:", e);
    }
  }
})();

// ======= ゲーム開始処理 =======
function startGame() {
  initPixi();

  // init が失敗して app が無い場合は中止
  if (!app) {
    console.error("Pixi initialization failed. Aborting startGame.");
    return;
  }

  // 最初の行の背景を即時設定（フェードなし）
  const firstLine = (scenes[currentScene] && scenes[currentScene][0]) || null;
  if (firstLine && firstLine.bg) {
    try {
      const t = PIXI.Texture.from(firstLine.bg);
      if (!activeBg) {
        // 念のため：activeBg が未定義なら bgSpriteA を代入
        activeBg = bgSpriteA || activeBg;
      }
      activeBg.texture = t;
      activeBg.alpha = 1;
      if (standbyBg) standbyBg.alpha = 0;
    } catch (e) {
      console.error("Error setting initial background:", e);
      if (activeBg) {
        activeBg.tint = 0x111122;
        activeBg.alpha = 1;
      }
    }
  } else {
    if (activeBg) {
      activeBg.tint = 0x111122;
      activeBg.alpha = 1;
    }
  }

  // 最初の行を表示
  showLine();
}

// 外部から呼べるユーティリティ（必要ならシナリオから呼べる）
window.VN = {
  goToScene: function(sceneName) {
    if (scenes[sceneName]) {
      currentScene = sceneName;
      lineIndex = 0;
      showLine();
    } else {
      console.warn("Scene not found:", sceneName);
    }
  },
  setLineIndex: function(i) {
    lineIndex = Math.max(0, i|0);
    showLine();
  },
  changeBackground: changeBackground,
  save: manualSave,
  load: manualLoad,
  restart: restartGame,
  getSaveData: function() { return localStorage.getItem(SAVE_KEY); }
};

// ゲーム開始
startGame();
