; first.ks - デモシナリオ
; 事前: data/image と data/bgm にファイルを置いておくこと

*start

[layopt layer=0 page=back]
[bg storage="bg_stage1.jpg"]

; BGM 再生（custom_effects.js 側の関数を呼ぶ）
[js]
fadeToBGM('data/bgm/theme1.ogg', 1.5);
[endscript]

; キャラ登場
[chara_show storage="char_hero.png" target="0" left=100 top=120]
[chara_show storage="char_friend.png" target="1" left=700 top=120]

; 最初のセリフ（Typed.js を使ったタイプ風表示を試す）
[cm]
[wt 500]
[js]
typeLine("主人公", "今日はなんだか雰囲気が違うな……", {speed:50, cursor:true});
[endscript]
[cm]

; 会話例
[cm]
[js]
typeLine("友人", "本当に？ どこが？", {speed:45, cursor:true});
[endscript]
[cm]

; 分岐の提示
[select]
*choice1="穏やかに話す"
*choice2="少し怒鳴る"
[ends]

; 条件分岐
[cm]
[wt 300]
[if exp="choice==1"]
  [js]
  createSoftParticle(); // 優しいパーティクル
  typeLine("主人公", "いや、ただの気のせいかも。", {speed:50});
  [endscript]
  [jump target="after_effect"]
[else]
  [js]
  createAngryRipple(); // 強いエフェクト
  typeLine("主人公", "なんで分からないんだよ！！", {speed:40});
  [endscript]
  [jump target="after_effect"]
[endif]
[cm]

*after_effect
; ステージ切替（暗転→ステージ2）
[js]
blackout(0.8, function(){
  switchStage('bg_stage2.jpg');
  fadeToBGM('data/bgm/theme2.ogg', 1.2);
  unblackout(0.6);
});
[endscript]

; 暗転解除後の会話（分岐で会話内容を微修正）
[cm]
[js]
typeLine("友人", "……ここでは話しにくいから移動しよう。", {speed:45});
[endscript]
[cm]

; 会話を続ける（動的に選択肢で後の展開を変える）
[select]
*choiceA="誤解を解く"
*choiceB="そのまま去る"
[ends]

[if exp="choice==A"]
  [js]
  createConfetti();
  typeLine("主人公", "ごめん、誤解だった。", {speed:50});
  [endscript]
  [jump target="ending_good"]
[else]
  [js]
  createDust(); // 退場用エフェクト
  typeLine("主人公", "……もういい。", {speed:45});
  [endscript]
  [jump target="ending_bad"]
[endif]

*ending_good
; エンディング（暖かい）
[js]
blackout(0.6, function(){
  // 小さい演出
  createParticleBurst();
});
[endscript]
[cm]
[js]
typeLine("友人", "またゆっくり話そう。", {speed:45});
[endscript]
; ゲーム終了
[stop]

*ending_bad
; エンディング（静かな去り）
[js]
blackout(0.9, function(){
  createLonelyFade();
});
[endscript]
[cm]
[js]
typeLine("友人", "……気をつけてね。", {speed:45});
[endscript]
[stop]
