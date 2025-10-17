/* 完全版スクリプト（Pixi + GSAP） */
/* 注意：このファイルは ES5+ で書かれており、CDNから PIXI / GSAP を読み込む前提です。 */

// ======= シーン定義（シナリオ班が入れてくれる想定） =======
// 各シーンは配列のライン。各ラインは以下のプロパティをサポート。
// { text: "文字列", next: "sceneName" | null, bg: "画像URL"（任意）, choices: [{text, next}, ...]（任意）, dark: true/false（暗転したい） }
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

// ======= Pixi 初期化 =======
let app, bgSpriteA, bgSpriteB, darkOverlay, dialogText, textContainer;
let stageWidth = window.innerWidth, stageHeight = window.innerHeight;

function initPixi() {
  app = new PIXI.Application({
    width: stageWidth,
    height: stageHeight,
    resolution: devicePixelRatio || 1,
    autoDensity: true,
    backgroundAlpha: 0
  });
  document.getElementById("pixi-container").appendChild(app.view);

  // 背景用スプライトを2つ用意（フェードで入れ替え）
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

  // 暗転用オーバーレイ（黒塗り）
  darkOverlay = new PIXI.Graphics();
  darkOverlay.beginFill(0x000000);
  darkOverlay.drawRect(0, 0, stageWidth, stageHeight);
  darkOverlay.endFill();
  darkOverlay.alpha = 0; // 非表示
  app.stage.addChild(darkOverlay);

  // テキスト用コンテナ
  textContainer = new PIXI.Container();
  textContainer.x = stageWidth * 0.06; // 左余白
  textContainer.y = stageHeight * 0.68; // 下寄せ
  textContainer.scale.set(1);
  app.stage.addChild(textContainer);

  // 背景の下にさりげないダークパネル（読みやすさ確保）
  const panel = new PIXI.Graphics();
  const panelW = stageWidth * 0.88;
  const panelH = stageHeight * 0.22;
  panel.beginFill(0x000000, 0.45);
  panel.drawRoundedRect(0, 0, panelW, panelH, 12);
  panel.endFill();
  panel.x = 0;
  panel.y = 0;
  textContainer.addChild(panel);

  // Pixi.Text（ダイアログ）
  const style = new PIXI.TextStyle({
    fontFamily: "Yu Gothic, Noto Sans JP, sans-serif",
    fontSize: 26,
    fill: "#ffffff",
    wordWrap: true,
    wordWrapWidth: panelW - 40,
    lineHeight: 34
  });
  dialogText = new PIXI.Text("", style);
  dialogText.x = 20;
  dialogText.y = 18;
  dialogText.alpha = 1;
  textContainer.addChild(dialogText);

  // クリックで進行（待機状態のとき）
  app.view.style.cursor = "pointer";
  app.view.addEventListener("pointerdown", () => {
    if (awaitingInput && !showingChoices) {
      advanceLine();
    }
  });

  // リサイズ
  window.addEventListener("resize", onResize);
}

function onResize() {
  stageWidth = window.innerWidth;
  stageHeight = window.innerHeight;
  app.renderer.resize(stageWidth, stageHeight);
  [bgSpriteA, bgSpriteB].forEach(s => {
    s.width = stageWidth;
    s.height = stageHeight;
    s.x = stageWidth / 2;
    s.y = stageHeight / 2;
  });
  darkOverlay.clear();
  darkOverlay.beginFill(0x000000);
  darkOverlay.drawRect(0, 0, stageWidth, stageHeight);
  darkOverlay.endFill();
  textContainer.y = stageHeight * 0.68;
}

// ======= 背景切り替えユーティリティ =======
let activeBg = bgSpriteA; // 表示中のスプライト
let standbyBg = bgSpriteB;

function changeBackground(url, duration = 0.8, useDark = false) {
  // 新テクスチャを standby にセットし、alpha を 0->1 でフェード
  const texture = PIXI.Texture.from(url);
  standbyBg.texture = texture;
  standbyBg.alpha = 0;
  // bring to back correctly: ensure stacking order
  app.stage.setChildIndex(standbyBg, 0);
  // optional: 暗転を先に行う（useDark true）
  if (useDark) {
    gsap.to(darkOverlay, {alpha:1, duration:duration/2, ease:"power1.inOut", onComplete: () => {
      // フェード切り替え
      gsap.to(standbyBg, {alpha:1, duration:duration/2, ease:"power1.inOut", onComplete: swapBg});
      gsap.to(activeBg, {alpha:0, duration:duration/2, ease:"power1.inOut"});
    }});
  } else {
    // 通常フェード
    gsap.to(standbyBg, {alpha:1, duration:duration, ease:"power1.inOut", onComplete: swapBg});
    gsap.to(activeBg, {alpha:0, duration:duration, ease:"power1.inOut"});
  }

  function swapBg() {
    // swap references
    const tmp = activeBg;
    activeBg = standbyBg;
    standbyBg = tmp;
    // 暗転解除
    gsap.to(darkOverlay, {alpha:0, duration:0.3, ease:"power1.inOut"});
  }
}

// ======= ダイアログのタイプライター（Pixi テキスト + GSAP） =======
let typingTween = null;
let awaitingInput = false;
let showingChoices = false;

function showTextWithTypewriter(fullText, speedPerChar = 0.03, onComplete) {
  // 既存の tween があれば kill
  if (typingTween) {
    typingTween.kill();
    typingTween = null;
  }
  dialogText.text = "";
  awaitingInput = false;

  // we animate a numeric object i from 0 -> fullText.length
  const proxy = { i: 0 };
  const total = fullText.length;
  const totalDuration = Math.max(0.4, total * speedPerChar); // 最低時間を確保

  typingTween = gsap.to(proxy, {
    i: total,
    duration: totalDuration,
    ease: "none",
    onUpdate: () => {
      const n = Math.floor(proxy.i);
      dialogText.text = fullText.slice(0, n);
    },
    onComplete: () => {
      dialogText.text = fullText;
      typingTween = null;
      awaitingInput = true;
      if (typeof onComplete === "function") onComplete();
    }
  });
}

// ======= DOM 被せ部分（選択肢 / セーブ） =======
const choicesBox = document.getElementById("choices");
const saveBtn = document.getElementById("save-btn");
const loadBtn = document.getElementById("load-btn");
const restartBtn = document.getElementById("restart-btn");
const saveStatus = document.getElementById("save-status");

saveBtn.addEventListener("click", manualSave);
loadBtn.addEventListener("click", manualLoad);
restartBtn.addEventListener("click", restartGame);

// ======= ゲームステート =======
let currentScene = "start";
let lineIndex = 0;
let autosaveEnabled = true;

// ======= 表示処理 =======
function showLine() {
  // 安全措置
  if (!scenes[currentScene]) {
    console.warn("scene not found:", currentScene);
    return;
  }
  const lines = scenes[currentScene];
  if (lineIndex >= lines.length) {
    // シーン終端なら END 相当
    dialogFinished();
    return;
  }
  const line = lines[lineIndex];

  // 背景切り替え指定があれば
  if (line.bg) {
    changeBackground(line.bg, 0.7, !!line.dark);
  }

  // 選択肢がある行
  if (line.choices) {
    // 表示は choices をレンダリングして return（選択が押されるまで進まない）
    renderChoices(line.choices);
    return;
  }

  // テキスト行
  showingChoices = false;
  clearChoices();
  // Pixi 文字エフェクト（タイプライター）
  showTextWithTypewriter(line.text, 0.025, () => {
    // 文字表示完了後はクリックで進める（pointerdown handler）か、次へ自動的に進む場合を調整
    // 特に何もしなければ pointerdown で advanceLine() を呼ぶ
  });

  // 自動セーブ
  if (autosaveEnabled) {
    autoSave();
  }
}

function advanceLine() {
  // 進行：line.next を見てシーン遷移 or 同シーンの次の行
  const line = scenes[currentScene][lineIndex];
  if (!line) return;
  if (line.next) {
    // シーン移動
    currentScene = line.next;
    lineIndex = 0;
    showLine();
  } else {
    // null なら現在のシーンは終了 → END 画面っぽく振る舞う
    dialogFinished();
  }
}

function dialogFinished() {
  // 終わり表示
  clearChoices();
  showingChoices = false;
  awaitingInput = false;
  showTextWithTypewriter("【END】クリックでリスタート", 0.01, () => {
    // クリックで restart
    app.view.addEventListener("pointerdown", restartOnClickOnce, { once: true });
  });
}

function restartOnClickOnce() {
  restartGame();
}

// ======= 選択肢描画 =======
function renderChoices(options) {
  showingChoices = true;
  awaitingInput = false;
  choicesBox.innerHTML = "";
  // 最大 4 個まで
  const limited = options.slice(0, 4);
  limited.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = opt.text;
    btn.style.pointerEvents = "auto";
    btn.addEventListener("click", () => {
      // クリック時のアニメーション
      gsap.fromTo(btn, {scale:1}, {scale:0.96, duration:0.06, yoyo:true, repeat:1});
      // 次のシーン/行へ
      currentScene = opt.next;
      lineIndex = 0;
      clearChoices();
      showLine();
    });
    choicesBox.appendChild(btn);

    // entry アニメーション
    gsap.from(btn, {y: 20, opacity:0, duration:0.45, delay: idx * 0.06, ease:"power2.out"});
  });

  // auto-save
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
    // 小さくステータス表示
    saveStatus.textContent = "Autosaved";
    gsap.fromTo(saveStatus, {opacity:0.2}, {opacity:1,duration:0.4,overwrite:true});
    // fade out
    gsap.to(saveStatus, {opacity:0.6, duration:2, delay:0.6});
  } catch (e) {
    console.error("Auto-save failed", e);
  }
}

function manualSave() {
  try {
    const data = makeSaveData();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    saveStatus.textContent = "Saved ✔";
    gsap.fromTo(saveStatus, {scale:0.9}, {scale:1, duration:0.25, ease:"elastic.out(1,0.6)"});
  } catch (e) {
    console.error("Save failed", e);
    saveStatus.textContent = "Save failed";
  }
}

function manualLoad() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      saveStatus.textContent = "セーブが見つかりません";
      return;
    }
    const data = JSON.parse(raw);
    if (!data || !data.scene) {
      saveStatus.textContent = "セーブデータが壊れています";
      return;
    }
    currentScene = data.scene;
    lineIndex = data.index || 0;
    saveStatus.textContent = "Loaded ✔";
    showLine();
  } catch (e) {
    console.error("Load failed", e);
    saveStatus.textContent = "Load failed";
  }
}

function restartGame() {
  currentScene = "start";
  lineIndex = 0;
  clearChoices();
  showLine();
}

// ======= 初期処理 =======
function startGame() {
  initPixi();
  // 初期背景をロード（先頭のシーンの最初の bg があれば）
  const firstLine = (scenes[currentScene] && scenes[currentScene][0]) || null;
  if (firstLine && firstLine.bg) {
    // 直接表示（フェード無し）
    const t = PIXI.Texture.from(firstLine.bg);
    activeBg.texture = t;
    activeBg.alpha = 1;
    standbyBg.alpha = 0;
  } else {
    // デフォのダミー背景
    activeBg.tint = 0x111122;
    activeBg.alpha = 1;
  }

  // 最初の行を表示
  showLine();
}

// 自動セーブの読み込みがあれば復帰する（オプション）
(function tryAutoLoadOnStart() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      // 簡易チェック：もし scene が存在すれば復帰
      if (data && data.scene && scenes[data.scene]) {
        currentScene = data.scene;
        lineIndex = data.index || 0;
      }
    } catch (e) {
      console.warn("Invalid autosave:", e);
    }
  }
})();

// ゲーム開始
startGame();

// ======= 外部から使えるユーティリティ（必要なら scenario 側で呼べる） =======
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
    lineIndex = i|0;
    showLine();
  },
  changeBackground: changeBackground,
  save: manualSave,
  load: manualLoad,
  restart: restartGame,
  getSaveData: function() { return localStorage.getItem(SAVE_KEY); }
};
