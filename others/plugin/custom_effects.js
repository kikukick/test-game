/* custom_effects.js
   Tyrano から [js] ... [endscript] で呼べる関数群を定義します。
   - PIXI があれば PIXI レイヤーで描画
   - なければ簡易 canvas フォールバック
   - GSAP / Howler があればアニメ / BGM を制御
*/

/* グローバル領域確保 */
window.NovelEffects = (function(){
  const root = {};
  root.app = null;
  root.pixiAvailable = (typeof PIXI !== 'undefined');
  root.gsapAvailable = (typeof gsap !== 'undefined');
  root.Howl = (typeof Howl !== 'undefined') ? Howl : (typeof Howler !== 'undefined' && Howler.Howl) ? Howler.Howl : null;
  root.currentBGM = null;
  root.particleContainer = null;
  root.canvasFallback = null;

  /* 初期化（呼び出されれば遅延初期化）*/
  root.init = function(){
    if (root._inited) return;
    root._inited = true;

    // 黒転用 DOM
    if (!document.getElementById('novel_blackout')) {
      const b = document.createElement('div');
      b.id = 'novel_blackout';
      document.body.appendChild(b);
    }

    // PIXI 初期化
    const mount = document.getElementById('tyrano_base') || document.body;
    if (root.pixiAvailable) {
      try {
        root.app = new PIXI.Application({
          width: window.innerWidth,
          height: window.innerHeight,
          transparent: true,
          resizeTo: window
        });
        root.app.view.style.position = 'absolute';
        root.app.view.style.left = '0';
        root.app.view.style.top = '0';
        root.app.view.style.zIndex = 9000;
        mount.appendChild(root.app.view);

        root.particleContainer = new PIXI.Container();
        root.app.stage.addChild(root.particleContainer);

      } catch (e) {
        console.warn('Pixi init failed', e);
        root.pixiAvailable = false;
        root._createCanvasFallback(mount);
      }
    } else {
      root._createCanvasFallback(mount);
    }
  };

  root._createCanvasFallback = function(mount){
    // 簡易 canvas を body に追加（フォールバック）
    root.canvasFallback = document.createElement('canvas');
    root.canvasFallback.width = window.innerWidth;
    root.canvasFallback.height = window.innerHeight;
    root.canvasFallback.style.position = 'absolute';
    root.canvasFallback.style.left = '0';
    root.canvasFallback.style.top = '0';
    root.canvasFallback.style.zIndex = 9000;
    root.canvasFallback.style.pointerEvents = 'none';
    mount.appendChild(root.canvasFallback);
    root._canvasCtx = root.canvasFallback.getContext('2d');
    window.addEventListener('resize', () => {
      root.canvasFallback.width = window.innerWidth;
      root.canvasFallback.height = window.innerHeight;
    });
  };

  /* BGM フェード切り替え */
  root.fadeToBGM = function(src, durSec = 1.5){
    root.init();
    if (!root.Howl) {
      console.warn('Howler not available');
      return;
    }
    if (root.currentBGM) {
      try {
        root.currentBGM.fade(root.currentBGM.volume() || 1, 0, durSec * 1000);
        setTimeout(() => {
          try { root.currentBGM.stop(); } catch(e){}
        }, durSec * 1000);
      } catch(e){ console.warn(e); }
    }
    const h = new root.Howl({
      src: [src],
      loop: true,
      volume: 0
    });
    h.play();
    h.fade(0, 1, durSec * 1000);
    root.currentBGM = h;
  };

  /* 黒転 */
  root.blackout = function(duration = 0.6, cb){
    root.init();
    const div = document.getElementById('novel_blackout');
    if (!div) {
      if (cb) cb();
      return;
    }
    if (root.gsapAvailable) {
      gsap.to(div, {opacity:1, duration:duration, onComplete: cb});
    } else {
      div.style.transition = `opacity ${duration}s`;
      div.style.opacity = 1;
      setTimeout(()=>{ if(cb)cb(); }, duration*1000);
    }
  };

  root.unblackout = function(duration = 0.6, cb){
    const div = document.getElementById('novel_blackout');
    if (!div) { if(cb)cb(); return; }
    if (root.gsapAvailable) {
      gsap.to(div, {opacity:0, duration:duration, onComplete: cb});
    } else {
      div.style.transition = `opacity ${duration}s`;
      div.style.opacity = 0;
      setTimeout(()=>{ if(cb)cb(); }, duration*1000);
    }
  };

  /* ステージ切替（背景画像差し替え） */
  root.switchStage = function(bgPath){
    root.init();
    // Tyrano 側の bg を差し替えることもできるが、ここでは DOM 上の bg を切り替える簡易方式
    try {
      // Tyrano の bg element を探す（バージョンにより要調整）
      const bgEl = document.querySelector('#tyrano_base img[src*="bg_"], #tyrano_base .bg_image, .tyrano_base .bg');
      if (bgEl) {
        // 画像要素なら src を変える
        if (bgEl.tagName && bgEl.tagName.toLowerCase() === 'img') {
          bgEl.src = bgPath;
          return;
        }
      }
    } catch(e){/* ignore */ }

    // フォールバック：ページ背景を変える
    document.body.style.backgroundImage = `url("${bgPath}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
  };

  /* パーティクル系（Pixi 版優先、未導入時は canvas フォールバック） */
  root.createSoftParticle = function(){
    root.init();
    if (root.pixiAvailable) {
      // 優しい光の粒子をゆっくり出す
      for (let i=0;i<24;i++){
        const g = new PIXI.Graphics();
        const r = 6 + Math.random()*10;
        g.beginFill(0xffffff, 0.9);
        g.drawCircle(0,0,r);
        g.endFill();
        g.x = Math.random()*window.innerWidth;
        g.y = Math.random()*window.innerHeight;
        g.alpha = 0;
        root.particleContainer.addChild(g);
        gsap.to(g, {alpha:0.9, duration:0.6 + Math.random()*0.8, yoyo:true, repeat:1, onComplete: () => {
          gsap.to(g, {alpha:0, duration:0.6, onComplete: () => { try{ root.particleContainer.removeChild(g);}catch(e){} }});
        }});
        gsap.to(g, {x: g.x + (Math.random()*200-100), y: g.y + (Math.random()*120-60), duration:4 + Math.random()*3, ease:"sine.inOut"});
      }
    } else {
      // canvas フォールバックで点滅
      const ctx = root._canvasCtx;
      if (!ctx) return;
      const w = root.canvasFallback.width, h = root.canvasFallback.height;
      for (let i=0;i<40;i++){
        const x = Math.random()*w, y = Math.random()*h, r=2+Math.random()*6;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
      setTimeout(()=>{ if(ctx) ctx.clearRect(0,0,w,h); }, 800);
    }
  };

  root.createAngryRipple = function(){
    root.init();
    if (root.pixiAvailable) {
      const gfx = new PIXI.Graphics();
      const cx = window.innerWidth/2, cy = window.innerHeight/2;
      root.particleContainer.addChild(gfx);
      let t=0;
      const maxR = Math.max(window.innerWidth, window.innerHeight)*0.9;
      const tl = gsap.timeline({onComplete: ()=>{ try{ root.particleContainer.removeChild(gfx);}catch(e){} }});
      tl.to({}, {duration:0.01}); // placeholder
      tl.to({}, {duration:0.4, onUpdate: ()=>{
        t += 1;
        gfx.clear();
        gfx.lineStyle(3, 0xff6666, 0.9 - (t*0.02));
        const r = 50 + t*30;
        gfx.drawCircle(cx, cy, r);
      }});
    } else {
      // canvas フォールバック：フラッシュ
      const ctx = root._canvasCtx;
      if(!ctx) return;
      ctx.fillStyle = "rgba(255,100,100,0.18)"; ctx.fillRect(0,0,root.canvasFallback.width, root.canvasFallback.height);
      setTimeout(()=>{ if(ctx) ctx.clearRect(0,0,root.canvasFallback.width, root.canvasFallback.height); }, 360);
    }
  };

  root.createConfetti = function(){
    root.init();
    if (root.pixiAvailable) {
      for (let i=0;i<60;i++){
        const rect = new PIXI.Graphics();
        rect.beginFill(0xffffff);
        rect.drawRect(-4,-8,8,16);
        rect.endFill();
        rect.x = Math.random()*window.innerWidth;
        rect.y = -20;
        rect.rotation = Math.random() * Math.PI;
        rect.tint = Math.random()*0xffffff;
        root.particleContainer.addChild(rect);
        gsap.to(rect, {y: window.innerHeight + 40, rotation: Math.random()*6, duration: 1.6 + Math.random()*1.2, ease: "power2.in", onComplete: ()=>{ try{ root.particleContainer.removeChild(rect);}catch(e){} }});
      }
    }
  };

  root.createParticleBurst = function(){
    root.init();
    if (root.pixiAvailable) {
      for (let i=0;i<90;i++){
        const g = new PIXI.Graphics();
        const r = 2 + Math.random()*4;
        g.beginFill(0xffd58a, 1);
        g.drawCircle(0,0,r);
        g.endFill();
        g.x = window.innerWidth/2 + (Math.random()*200-100);
        g.y = window.innerHeight/2 + (Math.random()*200-100);
        root.particleContainer.addChild(g);
        gsap.to(g, {x: g.x + (Math.random()*400-200), y: g.y + (Math.random()*400-200), alpha:0, duration:1.4 + Math.random(), onComplete: ()=>{ try{ root.particleContainer.removeChild(g);}catch(e){} }});
      }
    }
  };

  root.createDust = function(){
    root.init();
    if (root.pixiAvailable) {
      for (let i=0;i<25;i++){
        const g = new PIXI.Graphics();
        const r = 6 + Math.random()*10;
        g.beginFill(0x8b6b4b, 0.6);
        g.drawCircle(0,0,r);
        g.endFill();
        g.x = window.innerWidth/2 + (Math.random()*200-100);
        g.y = window.innerHeight/2 + (Math.random()*40-20);
        root.particleContainer.addChild(g);
        gsap.to(g, {x: g.x + (Math.random()*200-100), y: g.y + (Math.random()*160), alpha:0, duration:1.6, onComplete: ()=>{ try{ root.particleContainer.removeChild(g);}catch(e){} }});
      }
    }
  };

  root.createLonelyFade = function(){
    // 静かなフェード用のライトエフェクト
    root.init();
    if (root.pixiAvailable) {
      const rect = new PIXI.Graphics();
      rect.beginFill(0x000000, 0.0);
      rect.drawRect(0,0,window.innerWidth, window.innerHeight);
      rect.endFill();
      root.particleContainer.addChild(rect);
      gsap.to(rect, {alpha:0.75, duration:1.2});
    } else {
      const ctx = root._canvasCtx;
      if(!ctx) return;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0,0,root.canvasFallback.width, root.canvasFallback.height);
      // 残したままにしておく
    }
  };

  /* Typed.js を使ったタイプ表示のユーティリティ（Tyrano のテキスト領域に書き込む） */
  root.typeLine = function(speaker, text, opts = {}){
    // 標準: Tyrano のメッセージ領域を探してテキストを置き、Typed.js で表示する
    root.init();
    // speaker を name_label に反映（存在する要素があれば）
    try {
      const nameEl = document.querySelector('#tyrano_base .kag_name, #tyrano_base .name_label');
      if (nameEl) nameEl.textContent = speaker;
    } catch(e){}

    // メッセージ表示領域探索（要調整）
    let msgEl = document.querySelector('#tyrano_base .kag_message_window, #tyrano_base .message_window, #tyrano_base .kag_message .mes_body');
    if (!msgEl) {
      // フォールバックで仮のメッセージ領域を作る（デモ用）
      msgEl = document.createElement('div');
      msgEl.className = 'message_window';
      msgEl.style.position = 'fixed';
      msgEl.style.left = '50%';
      msgEl.style.transform = 'translateX(-50%)';
      msgEl.style.bottom = '30px';
      msgEl.style.maxWidth = '1100px';
      msgEl.style.zIndex = 9500;
      document.body.appendChild(msgEl);
    } else {
      // 既存の要素の中身を削る（Tyrano 側の挙動に注意）
      msgEl.innerHTML = '';
    }

    // コンテナを作る
    const target = document.createElement('div');
    target.className = 'typed_target';
    msgEl.appendChild(target);

    const speed = opts.speed || 40;
    const showCursor = opts.cursor !== false;

    if (typeof Typed !== 'undefined') {
      // Typed.js を使う
      new Typed(target, {
        strings: [text],
        typeSpeed: Math.max(10, Math.round(1000 / speed)),
        showCursor: showCursor,
        onComplete: function(){
          // 完了時のハンドリング（Tyrano 側に戻すなど）
        }
      });
    } else {
      // シンプルな自作タイプ
      let idx = 0;
      const interval = Math.max(8, Math.round(1000/speed));
      const loop = setInterval(()=>{
        target.textContent += text[idx++] || '';
        if (idx >= text.length) clearInterval(loop);
      }, interval);
    }
  };

  /* 外部から直接呼べるヘルパを window に展開（Tyrano から [js] で呼べる） */
  return {
    init: root.init,
    fadeToBGM: root.fadeToBGM,
    blackout: root.blackout,
    unblackout: root.unblackout,
    switchStage: root.switchStage,
    createSoftParticle: root.createSoftParticle,
    createAngryRipple: root.createAngryRipple,
    createConfetti: root.createConfetti,
    createParticleBurst: root.createParticleBurst,
    createDust: root.createDust,
    createLonelyFade: root.createLonelyFade,
    typeLine: root.typeLine
  };

})();

/* 簡易グローバルラッパーを定義（Tyrano から呼びやすく） */
function fadeToBGM(src, d){ window.NovelEffects.fadeToBGM(src, d); }
function blackout(d, cb){ window.NovelEffects.blackout(d, cb); }
function unblackout(d, cb){ window.NovelEffects.unblackout(d, cb); }
function switchStage(p){ window.NovelEffects.switchStage(p); }
function createSoftParticle(){ window.NovelEffects.createSoftParticle(); }
function createAngryRipple(){ window.NovelEffects.createAngryRipple(); }
function createConfetti(){ window.NovelEffects.createConfetti(); }
function createParticleBurst(){ window.NovelEffects.createParticleBurst(); }
function createDust(){ window.NovelEffects.createDust(); }
function createLonelyFade(){ window.NovelEffects.createLonelyFade(); }
function typeLine(name, txt, opts){ window.NovelEffects.typeLine(name, txt, opts); }
