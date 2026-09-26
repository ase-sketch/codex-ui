# codex-ink 路 澧ㄧ櫧缁堢

浠ｇ爜鏂瑰悜涓?Codex / ChatGPT銆傝繖鏄?codex-ui 鎻掍欢鐨勬牱寮忔鏈細`scripts/install-plugin.mjs` 璇绘湰鐩綍鐨勪簲涓?CSS锛?浣滅敤鍩熷寲鍒?`html[data-codex-ui]` 鍚庡啓杩?`client.js`銆傚悓涓€浠界洰褰曚篃婊¤冻 Skin v2 娓呭崟鏍煎紡锛屽彲鐢辩毊鑲ゅ姞杞藉櫒鍗曠嫭鏀跺綍銆?
## 鏂囦欢

| 鏂囦欢 | 灞?| 鍐呭 |
|---|---|---|
| `skin.json` | 娓呭崟 | id銆乤ccent銆佹槑鏆楅瑙?|
| `skin.css` | L1 浠ょ墝 + L2 鎺掔増 | `--dsw-alias-*` 閲嶆槧灏勶紱琛?spacing / radius / 瀛楅樁 / motion / elevation 浠ょ墝灞?|
| `patches.css` | L3 缁勪欢 | 鐒︾偣鐜€侀摼鎺ャ€佸崱鐗囧绾︺€乵ono pill 寰芥爣銆乼ag tone 褰掍竴銆乺educed-motion銆佲懌 妯″瀷閫夋嫨鍣ㄣ€佲懍 杈撳叆鍖洪《鏍忎笌鍗＄墖銆佲懐 鍙虫爮閫夋嫨缁勪欢銆佲懓 composer 鎺т欢鎮仠 |
| `sidebar-align.css` | L3 渚ф爮瀵归綈 | 鏂颁細璇濊涓庡叏灞€闈㈡澘琛岃惤鍒板伐浣滃尯鍒楄〃琛岀殑涓ゆ潯绔栫嚎锛堝浘鏍囧垪 20px銆佹枃瀛楀垪 42px锛夛紱鍚?rc.1 鎵佸钩涓?rc.2 宓屽涓や唬 DOM 閫夋嫨鍣?|
| `window-shadow.css` | L3 绐楀彛杈圭紭 | 浼氳瘽绐楀彛 0.5px 鍙戜笣绾垮姞 24px 鐜褰憋紱鍙虫爮闈㈡澘宸︽部鍙暀 0.5px 鍙戜笣绾裤€佸奖鍙線涓婃硠锛涘彸鍒嗙晫绾挎嫋鎷芥焺鎮仠娓愬彉 |
| `composer.css` | L3 杈撳叆鍖?| 杈撳叆鍗″嚑浣曚笌琛ㄩ潰銆?4px 缂栬緫鍖恒€?8px 搴曟爮鎺т欢甯︺€佸缓璁彍鍗曘€乭ero 甯冨眬銆傛湰灞傚厑璁?`[class*=鈥` 鍚庣紑閿氱偣 |
| `preview/` | 璧勪骇 | 浜殫棰勮鍥?|

## 璁捐瑙勭害

1. chrome 鏃犲僵鑹诧細鎸夐挳銆侀摼鎺ャ€侀€変腑鎬併€佺劍鐐圭幆涓哄ⅷ鑹层€傛祬鑹蹭富鎸夐挳 `#1A1C1F` 搴曠櫧瀛楋紝娣辫壊鍙嶇浉銆?2. 鐏伴樁鍗冲眰绾с€傛祬鑹?`#FFFFFF 鈫?#F1F1EF 鈫?#E5E5E5`锛涙繁鑹?`#111111 鈫?#171717 鈫?#1f1f1f 鈫?#2a2a2a 鈫?#353535`銆?3. 浜壊渚ф爮 `#EEF4F9`锛岄€変腑琛?`#E2E9ED`锛宧over `#E8EEF3`銆?4. 鍏冧俊鎭紙token 鏁般€佹ā鍨嬪悕銆佹椂闂存埑銆佸窘鏍囥€佽矾寰勩€佸揩鎹烽敭锛夎蛋 `--ds-font-family-code`銆?1px銆乣.04em`/`.08em`锛涗腑鏂囩粡 `:lang(zh)` 璞佸厤瀛楄窛涓庡ぇ鍐欍€?5. 鍦嗚 / 闂磋窛鍙?`--dsw-radius-*` 涓?`--dsw-space-*`锛涘崱鐗囩敤 0.5px 鎻忚竟浠ｆ浛鎶曞奖銆?6. 鍔ㄦ晥 100 / 160 / 240ms锛宍cubic-bezier(.3,.7,.4,1)`锛沗prefers-reduced-motion` 鍙栫灛鏃剁粓鎬併€?7. 褰╄壊鐧藉悕鍗曪細state 涓夎壊銆乨iff 绾㈢豢銆佸窘鏍囧簳鑹诧紙state 鑹?8%~16% 閫忔槑搴曪級銆倀ask-board 鐨勫叚妗?tag tone 鏀舵暃鍒?state 涓夎壊鍔犲ⅷ鐏般€?
## 浠ょ墝濂戠害锛堜笁鏂规彃浠讹級

1. 棰滆壊鍙敤 `var(--dsw-alias-*)`锛屼笉鑷甫 hex锛?2. 鍦嗚涓庨棿璺濆彧鐢?`var(--dsw-radius-*)` 涓?`var(--dsw-space-*)`锛?3. hover 鐢ㄨ儗鏅崌涓€妗ｏ紝涓嶈嚜鍒涙姇褰憋紱
4. 涓嶅紩鍏ョ櫧鍚嶅崟澶栫殑褰╄壊锛?5. 鍏冧俊鎭敤 `var(--dsw-font-meta)` 鍔?`--dsw-meta-size` 鍔?`--dsw-meta-tracking`銆?
## 楠屾敹

```bash
node scripts/audit-codex-ink.mjs
```

鑴氭湰鍋氫笁浠朵簨锛歚skin.json` 缁撴瀯鑷銆?6 缁?WCAG 瀵规瘮搴﹀疄娴嬨€乣patches.css` 褰╄壊鐧藉悕鍗曞璁°€?褰撳墠缁撴灉 36/36 閫氳繃锛孉AA 19 缁勶紝鐧藉悕鍗曞褰╄壊 0 涓€?
## 瀹夎

```powershell
node scripts/install-plugin.mjs --write      # 鎻掍欢璺緞锛屼富鐢ㄦ硶
node scripts/install-skin.mjs --write        # 鐨偆鍔犺浇鍣ㄨ矾寰勶細鍚屾鍒?$DSH_HOME/skins/codex-ink
```

## 鏈鐩?
- shiki 璇硶楂樹寒鐨勪綆楗卞拰鍖栨湭鍦ㄦ湰灞傚己鍒讹紝璇硶鑹茬敱瀹樻柟楂樹寒鍣ㄥ唴鑱旇緭鍑猴紱鏈眰鍙害鏉熶唬鐮佸潡搴曡壊 `--dsw-alias-markdown-code-block` 涓€鏃忋€?- `patches.css` 閫氳繃鍔犺浇鍣ㄥ畨鍏ㄧ绾垮苟琚檺瀹氫綔鐢ㄥ煙锛屾湭鍦?live GUI 涓婂崟鐙簲鐢ㄨ繃锛涘簲鐢ㄤ細鏀瑰啓鐨偆閫夋嫨銆?