*start
[bg storage="bg_stage1.jpg" time=1000]
[playbgm storage="theme1.ogg" loop=true]
[layopt layer=message0 visible=true page=fore]
[backlayopt layer=message0 color=0x000000 opacity=128]

[char storage="char_hero.png" name="主人公" pos="left"]
[char storage="char_friend.png" name="友人" pos="right"]

[cm]
[effect name="fadeIn"]
「やぁ、今日は特別なテストだよ。」

[wait time=1000]
「選択によって、世界が変わるんだ。」

[cm]
[button graphic="next.png" text="続ける" target="select_scene"]

*select_scene
[cm]
どちらの道を選ぶ？

[choice name="選択肢" storage="first.ks" target="happy" text="希望の道"]
[choice name="選択肢" storage="first.ks" target="dark" text="闇の道"]

*happy
[bg storage="bg_stage2.jpg" time=1500]
[stopbgm time=1000]
[playbgm storage="theme2.ogg" loop=true]
[effect name="sparkle"]
「光が差し込んできた……！」

[wait time=1000]
[effect name="fadeOut"]
[cm]
「ハッピーエンドだね！」[end]

*dark
[stopbgm time=500]
[effect name="darken"]
[bg storage="bg_stage1.jpg" time=2000]
「すべてが……静かになった。」

[wait time=1000]
[effect name="shake"]
「これは……バッドエンドかもしれない。」[end]
