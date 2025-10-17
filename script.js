///シナリオ班頑張ってね。

/* -------------------------
   初期シーン（exxx）
   フィールド:
     - text: 表示する文字列
     - choices: [{text, next}, ...] (2~4択)
     - bg: 画像URL（この行で暗転→背景差替→フェードイン）
     - dark: true (暗転のみ)
     - pixiEffect: true (pixi があれば pixi 上で表示、なければ DOM+GSAP)
     - 
*/
const scenes = {
  start: [
    { text: "目を覚ますと、見慣れない天井があった。", bg: "https://picsum.photos/id/1018/1280/720", pixiEffect: true },
    { text: "覚えていることは少ない。", next: "intro" }
  ],
  intro: [
    { text: "どうする？", choices: [
      { text: "辺りを見回す", next: "look_around" },
      { text: "ベッドに戻る", next: "sleep" }
    ] }
  ],
  look_around: [
    { text: "部屋は薄暗い。窓の外に何か光が見える。", bg: "https://picsum.photos/id/1003/1280/720" },
    { choices: [
        { text: "窓に近づく", next: "window" },
        { text: "扉を試す", next: "door" },
        { text: "とりあえず荷物を確認する", next: "search" }
      ] }
  ],
  window: [
    { text: "窓ガラスには古いステッカーが張られている。", pixiEffect: true },
    { text: "外には広い街並みが広がっていた。", next: "end_good" }
  ],
  door: [
    { text: "扉は鍵がかかっている。", next: "end_bad" }
  ],
  search: [
    { text: "引き出しの中に古い鍵を見つけた。", bg: "https://picsum.photos/id/1025/1280/720" },
    { text: "これで扉の鍵を開けられるかもしれない。", next: "door_unlocked" }
  ],
  door_unlocked: [
    { text: "鍵を使った。扉がきしみながら開く。", next: "end_good" }
  ],
  sleep: [
    { text: "再び眠り、長い夢を見た……", next: "end_bad" }
  ],
  end_good: [
    { text: "外の光があなたを迎える。これは新しい旅の始まりだ。", next: null }
  ],
  end_bad: [
    { text: "暗闇に飲み込まれて、目を覚ますことはなかった。", next: null }
  ]
};

/* -------------------------
   DOM
*/
const bgDiv = document.getElementById('background');
const overlay = document.getElementById('bg-overlay');
const dialogText = document.getElementById('dialog-text');
const speakerName = document.getElementById('speaker-name');
const choicesBox = document.getElementById('choices');
const toast = document.getElementById('toast');

const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');
const clearSaveBtn = document.getElementById('clear-save-btn');

let currentScene = 'start';
let lineIndex = 0;
const SAVE_KEY = 'vn_save';

/* -------------------------
   PIXI セットアップ（optional）
   PIXI が使える場合はテキスト用のレイヤーを用意する
*/
let pixiApp = null;
let pixiText = null;
let usePixi = false;

function setupPixiIfAvailable() {
  try {
    if (window.PIXI) {
      const container = document.getElementById('pixi-container');
      pixiApp = new PIXI.Application({
        resizeTo: container,
        backgroundAlpha: 0,
        resolution: devicePixelRatio || 1,
        autoDensity: true
      });
      container.appendChild(pixiApp.view);
      pixiText = new PIXI.Text('', {
        fontFamily: 'Yu Gothic, Meiryo, sans-serif',
        fontSize: 32,
        fill: 0xFFFFFF,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: Math.min(window.innerWidth * 0.9, 1100)
      });
      pixiText.anchor.set(0.5);
      pixiText.x = pixiApp.view.width / 2;
      pixiText.y = pixiApp.view.height * 0.8;
      pixiText.alpha = 0;
      pixiApp.stage.addChild(pixiText);

      window.addEventListener('resize', () => {
        pixiText.x = pixiApp.view.width / 2;
        pixiText.y = pixiApp.view.height * 0.8;
        pixiText.style.wordWrapWidth = Math.min(window.innerWidth * 0.9, 1100);
      });

      usePixi = true;
      console.log('PIXI detected — Pixi text effects enabled.');
    }
  } catch (e) {
    console.warn('PIXI init failed, falling back to DOM effects', e);
    usePixi = false;
  }
}
setupPixiIfAvailable();

/* -------------------------
   背景暗転＆差替ユーティリティ
   changeBackground(url): 暗転→差替→フェードイン
   darkenOnly(): 暗転して戻す（bg変えない）
*/
function changeBackground(url, onComplete) {
  gsap.timeline()
    .to(overlay, { duration: 0.35, opacity: 1 })
    .add(() => {
      if (url) bgDiv.style.backgroundImage = `url("${url}")`;
    })
    .to(overlay, { duration: 0.45, opacity: 0, onComplete: onComplete || (() => {}) });
}

function darkenOnly(duration = 0.5, onComplete) {
  gsap.timeline()
    .to(overlay, { duration: duration/2, opacity: 1 })
    .to(overlay, { duration: duration/2, opacity: 0, onComplete: onComplete || (()=>{}) });
}

/* -------------------------
   テキスト表示
   pixiEffect が true の場合、Pixi があれば Pixi 上で表示ANNDDDDエフェクト
   それ以外は DOM 上の dialogText に GSAP でグッバインゴ
*/
function showTextLine(lineObj) {
  if (!lineObj) return;
  
  choicesBox.innerHTML = '';
  choicesBox.classList.remove('active');

  if (lineObj.bg) {
    changeBackground(lineObj.bg, () => {
      // 背景変更後にテキストを表示
      displayText(lineObj);
    });
  } else if (lineObj.dark) {
    darkenOnly(0.5, () => {
      // 暗転後にテキストを表示
      displayText(lineObj);
    });
  } else {
    // 背景変更がない場合はそのままテキストを表示
    displayText(lineObj);
  }
}

function displayText(lineObj) {
  const txt = lineObj.text || '';

  // Pixiエフェクトが有効で、Pixiが利用可能な場合
  if (lineObj.pixiEffect && usePixi && pixiText) {
    dialogText.textContent = '';
    gsap.killTweensOf(dialogText);
    pixiText.text = txt;
    pixiText.alpha = 0;
    pixiText.scale.set(0.9);
    gsap.timeline()
      .to(pixiText, { duration: 0.4, alpha: 1, ease: 'power2.out' })
      .to(pixiText.scale, { x:1, y:1, duration:0.4, ease:'elastic.out(1,0.5)' }, "<");
    dialogText.onclick = null;
    attachAdvanceOnHUD();
    return;
  }

  // 通常のDOMベースのテキスト表示
  gsap.killTweensOf(dialogText);
  dialogText.style.opacity = 0;
  dialogText.textContent = txt;
  
  // スピーカー名がある場合は表示
  if (lineObj.speaker) {
    speakerName.textContent = lineObj.speaker;
    speakerName.classList.remove('hidden');
  } else {
    speakerName.classList.add('hidden');
  }
  
  gsap.fromTo(dialogText, 
    { y: 12, opacity: 0 }, 
    { y: 0, opacity: 1, duration: 0.45, ease: 'power2.out', 
      onComplete: () => {
        // アニメーション完了後にクリックイベントを設定
        dialogText.onclick = null;
        attachAdvanceOnHUD();
      }
    }
  );
}

function attachAdvanceOnHUD() {
  const line = getCurrentLine();
  if (line && line.choices) {
    dialogText.style.cursor = 'default';
    dialogText.onclick = null;
    return;
  }
  dialogText.style.cursor = 'pointer';
  dialogText.onclick = () => {
    advanceLine();
  };
}

/* -------------------------
   選択又
*/
function showChoices(options) {
  choicesBox.innerHTML = '';
  choicesBox.classList.add('active');

  const max = Math.min(options.length, 4);
  for (let i = 0; i < max; i++) {
    const opt = options[i];
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = opt.text;
    btn.onclick = () => {
      currentScene = opt.next;
      lineIndex = 0;
      showCurrentLine();
    };
    choicesBox.appendChild(btn);
    gsap.from(btn, { scale: 0.9, opacity: 0, y: 10, duration: 0.35, delay: 0.05 * i });
  }
}

/* -------------------------
   シーーーンと行
*/
function getCurrentLine() {
  const arr = scenes[currentScene];
  if (!arr) return null;
  return arr[lineIndex];
}

function showCurrentLine() {
  const line = getCurrentLine();
  if (!line) {
    showToast('シーンが見つかりません。最初に戻ります。');
    restartGame();
    return;
  }

  if (line.choices) {
    dialogText.textContent = '';
    speakerName.classList.add('hidden');
    showChoices(line.choices);
    return;
  }

  showTextLine(line);

  if (typeof line.next !== 'undefined' && line.next === null) {
    dialogText.onclick = () => {
      restartGame();
    };
  }
}

function advanceLine() {
  const line = getCurrentLine();
  if (!line) return;
  if (line.next) {
    currentScene = line.next;
    lineIndex = 0;
  } else {
    lineIndex++;
    const arr = scenes[currentScene];
    if (lineIndex >= arr.length) {
      restartGame();
      return;
    }
  }
  showCurrentLine();
}

function saveGame() {
  const state = { currentScene, lineIndex, timestamp: Date.now() };
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  showToast('セーブしました');
}
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { showToast('保存データが見つかりません'); return; }
  try {
    const state = JSON.parse(raw);
    if (!state.currentScene || typeof state.lineIndex === 'undefined') {
      showToast('セーブデータが壊れています');
      return;
    }
    if (!scenes[state.currentScene]) {
      showToast('セーブ先のシーンが存在しません');
      return;
    }
    currentScene = state.currentScene;
    lineIndex = state.lineIndex;
    showCurrentLine();
    showToast('ロードしました');
  } catch(e) {
    console.error('load error', e);
    showToast('ロードに失敗しました');
  }
}
function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  showToast('セーブを削除しました');
}

let toastTimer = null;
function showToast(msg, ms = 1600) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toastTimer = setTimeout(()=>toast.classList.add('hidden'), 250);
  }, ms);
}

function restartGame() {
  currentScene = 'start';
  lineIndex = 0;
  showCurrentLine();
}

saveBtn.addEventListener('click', saveGame);
loadBtn.addEventListener('click', loadGame);
clearSaveBtn.addEventListener('click', clearSave);

function start() {
  // セーブデータを確認
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try {
      const state = JSON.parse(raw);
      if (state.currentScene && scenes[state.currentScene]) {
        currentScene = state.currentScene;
        lineIndex = state.lineIndex || 0;
      }
    } catch (e) {
      console.error('Failed to load save data:', e);
    }
  }

  // 背景画像を設定
  const currentLine = getCurrentLine();
  if (currentLine && currentLine.bg) {
    bgDiv.style.backgroundImage = `url("${currentLine.bg}")`;
  } else if (scenes.start && scenes.start[0] && scenes.start[0].bg) {
    bgDiv.style.backgroundImage = `url("${scenes.start[0].bg}")`;
  } else {
    bgDiv.style.backgroundImage = 'url("https://picsum.photos/1280/720?blur=2")';
  }
  
  // 現在のシーンを表示
  showCurrentLine();
}

// DOMが読み込まれたらスタート
document.addEventListener('DOMContentLoaded', () => {
  start();
});

window.VN = {
  changeBackground,
  darkenOnly,
  save: saveGame,
  load: loadGame,
  restart: restartGame,
  getState: () => ({ currentScene, lineIndex })
};
