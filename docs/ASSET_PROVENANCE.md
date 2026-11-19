# 资产来源与重建说明

新版首页立绘以工装骑手为参照，为短臂、短腿的新战斗比例单独生成。战斗造型可在同一机位、同样的走位下对照。[首页原型](../public/assets/clay-workwear-home.webp) · [战斗画面对照](verification/clay/chibi-battle-comparison.webp)

<details>
<summary>短手脚首页立绘生成提示词（内置 ImageGen）</summary>

Use case precise-object-edit. Redesign the proportions of the exact same polymer-clay game character shown in the reference. Deliver one complete, isolated RGBA title-screen portrait of a tiny food-delivery rider caught in a brisk short running step, facing three-quarter RIGHT. Make the whole silhouette clearly squat and cuter than before: the orange helmet + head takes about 52–54 percent of her total height, a single round cheeky head with full cheeks, proud friendly expression, ponytail. Head should sit close down to her shoulders. Dramatically shorten upper arms and forearms, keep elbows close to plump torso, gloved mitten-sized hands reach just past jacket hem at rest; visible hand up near cheek holding the original small cream order slip, other hand on satchel. A compact egg-shaped uniformed body, blue trousers with dark denim clay cuffs, noticeably SHORT chubby legs with only enough length to show knee bends, low round cream shoes, small orange heel pulls and a sliver of charcoal sole. Very short compact running stride, back shoe lifted under seat, front foot tucked near body. Width of each shoe well under half face width. Both shoes readable, both within frame, shoes join trouser cuffs. Preserve the reference costume, orange and ivory helmet stripe, dark brown raised hair, jade hot-food bag, diagonal strap, matching orange jacket, handmade matte clay texture and detailed toy lighting. No giant feet, no lanky legs, no stretched-out stride, no extra limbs or extra bits. Make a single beautifully sculpted chibi miniature in the same identity. No text, no mockup, no character sheet, no background or ground shadow. Real transparent alpha and wide enough clear padding around all extremities; separate head/hair from raised hand in silhouette.

</details>

## 2026-11-19 骑手工装裤与工鞋

内置 imagegen 以游戏中的骑手为原型，画出支撑脚着地、后脚蹬地、摆腿及背面提跟四种姿态。选定的设计使用深蓝裤料、奶白鞋头、炭色薄底和橙色后跟提带。[动作设计稿](art-directions/chibi/courier-workwear.webp)

运行时使用第二次生成的透明分件图。上排依次是正面裤胯、背面裤胯、大腿和带卷边裤口的小腿。下排依次是朝右的侧面鞋、面向镜头的鞋尖、背向镜头的鞋跟和斜后视角。左右脚共用同向侧面鞋，正背方向各有独立裁片。每个部件按透明度裁切，缩放到 192 × 192 像素图格内的 174 像素范围，再导出为 768 × 384 RGBA WebP。SHA-256 为 `9B897ABB558D17DF8B3D8FD4E91F69985545D47894DF62CFE7093841F9879203`。[工装运行图集](../public/assets/clay-courier-workwear.webp) · [分件坐标](../src/render/clay-frames.ts)

<details>
<summary>工装分件生成提示词</summary>

Use case precise-object-edit. Animation rig asset, not the character and not a whole outfit. As the art director of this miniature clay courier toy game, extract and reconstruct ONLY the lower-body modular components of the referenced chibi courier in an exact 4-column 2-row transparent sprite atlas with 8 isolated pieces, one single piece per cell. Target landscape 2:1. All items upright, equal sized cells, completely separated evenly with wide empty transparent gutters. No labels, letters, characters, boxes, stands, contact shadows or lines between objects. Copy the charcoal petrol-navy trousers, clay texture, flat cream low-top sneakers with a thin charcoal rubber sole and a small orange heel pull from the reference exactly. Subtle soft side lighting, clear edges, hand-shaped rounded modeling, photographed toy material, orthographic camera, very slight downward elevation. TOP ROW from left: (1) front view of an isolated blue trouser seat/pelvis ONLY, roughly twice as wide as tall, short horizontal waistband, curved crotch saddle, no legs, no underwear details, no belt, a subtle fly seam; (2) back view of same wide blue pelvis with faint yoke seam, no legs; (3) a single upper leg segment of the same trousers from upper thigh to knee, a plain vertical tapered short tube of soft blue cloth-clay with rounded ends that can overlap the adjoining leg parts, top slightly wider than bottom, no huge folds, one tiny soft knee fold low down; (4) single lower leg segment of the same trousers from knee down to ankle, blue cloth cylinder with a subtle rounded knee cap at its top and a small rolled blue cuff at its lower end, no shoe, no body, no skin. BOTTOM ROW four views of the SINGLE SAME low-top ivory sneaker with a small warm orange tab at heel, broad toe and dark thin flat rubber outsole. No legs, no socks, no high tops. (1) direct profile with round toe pointing RIGHT and ankle opening at LEFT, heel tab at left; (2) straight-on front with toe facing the viewer centrally, symmetric sides, heel tab mostly invisible behind ankle; (3) straight-on back showing the slim heel column and central orange pull tab, no laces visible; (4) rear three-quarter view with heel towards viewer at LEFT, toe receding away to RIGHT, mostly the side and back visible. Ensure exactly 4 isolated tidy components on each row and do not add second shoes. Native transparent alpha, empty area all transparent.

</details>

## 2026-11-19 软陶盲盒战斗美术

<details>
<summary>新版首页工装立绘生成提示词</summary>

Identity-preserving precise character costume edit. First reference is the edit target — create ONE single isolated transparent RGBA full-body courier in the exact running pose, scale, three-quarter facing right camera, determined expression, orange helmet, hair, face, upper jacket, hand with order slip, green insulated bag, clay texture, lighting and proportions of the first image. Second sheet is costume reference ONLY for new pants and shoes. Replace ONLY the orange shorts, exposed skin of both legs and orange shoes of first reference with continuous dark petrol-blue denim work trousers, chunky little loose tapered legs with seams, subtle folded knees, cuff touching each shoe, warm cream round toe work sneakers with slim dark grey rubber outsole and tiny orange loop at each heel. Anatomically rooted hips and bent knees; the figure carries her weight naturally in the same delivery stride. Final is a single full running soft polymer clay figurine, looking to screen right, both shoes fully visible, charming tangible tactile details; no floor, no background, no drop shadow, no backdrop, no labels, no duplicate characters, no weapon. Leave a thin transparent margin around all sides and use the composition of image 1.

</details>

以已选的软陶外卖员、外卖武器、受伤和小怪攻击概念为依据，使用内置 imagegen 独立生成含透明通道的运行素材。旧分件图提供骨架连接点和正背面朝向。制作时逐件清理透明边缘，居中缩放到 256 像素的图格，再编码为带 alpha 的 WebP。[角色原稿](art-directions/chibi/clay-toy.png) · [武器原稿](art-directions/chibi/clay-weapons.png) · [受击原稿](art-directions/chibi/clay-hurt-states.png) · [小怪出招原稿](art-directions/chibi/combat-fx/enemy-attacks.png)

| 文件 | 游戏中的用途 |
|---|---|
| [clay-chibi-home.webp](../public/assets/clay-chibi-home.webp) | 首页独立跑姿。用内置 ImageGen 参考上一版工装立绘，缩短手臂和小腿、收紧步幅，保留橙色头盔、送餐单、绿保温箱和奶白工鞋。透明原图裁至角色外缘，导出为 588 × 640 RGBA WebP。 |
| [clay-courier-rig.webp](../public/assets/clay-courier-rig.webp) | 四列五行，16 件头盔、制服、手脚和保温箱分件，加上挥击与受伤表情。站姿、转向、跑步着地和扶盔护箱按当前输入组成 |
| [clay-shoe-views.webp](../public/assets/clay-shoe-views.webp) | 旧版橙白短裤造型的三向软陶运动鞋图集，尺寸为 384 × 144 |
| [clay-market-mascots.webp](../public/assets/clay-market-mascots.webp) | 2026-11-19 用内置 ImageGen 参考[旧版九种表情](verification/clay/enemy-expressions.webp)和[巨包设计](art-directions/chibi/combat-fx/elite-bun.png)制作。要求圆脸、芝麻眼、短手脚，分别以辣椒、筷子和薄荷色碗沿区分三种小怪，给精英加红色面结和小乳牙。各格清理透明底、对齐脚底后排为 896 × 896 RGBA WebP。前三行是包子、餐盒、面碗的日常、笑、惊、受击或残血表情，末行是巨包的常态、受击、残血与普通包子残血。SHA-256 为 `014a894ab24cb0092ecb836b9904a2d565873882a698fa8f216e99167f8a915d`。 |
| [clay-actors.webp](../public/assets/clay-actors.webp) | 四列三行的首版战斗图集。现用于四款大招拾取物及其 HUD 图标 |
| [clay-enemy-faces.webp](../public/assets/clay-enemy-faces.webp) | 首版咧嘴笑、惊讶两排表情。内置 ImageGen 以旧软陶怪物图集为参考生成，依包子、餐盒、面碗三列裁切 |
| [clay-weapons.webp](../public/assets/clay-weapons.webp) | 四列四行，十件可换武器、五种关联飞行物或展开件及装备箱。猫爪夹、纸袋、葱花盘使用已选概念造型 |
| [clay-supplies.webp](../public/assets/clay-supplies.webp) | 四列四行，原有十三件技能道具，以及路锥、诱饵餐箱和补给箱 |
| [clay-ultimate-fx.webp](../public/assets/clay-ultimate-fx.webp) | 内置 imagegen 生成并整理为两列四行，依次为冰晶、蒸汽卷、签收票、汽水飞沫、冰浪扇面、中空蒸汽环、奶泡喷泉、杨梅。运行时随伤害波前和真实落点组合绘制 |
| [clay-night-market.webp](../public/assets/clay-night-market.webp) | 1600 × 900 的灯笼夜市。以原夜市布局和软陶角色材质为参考生成，橙光摊位沿边、紫灰色石地铺满活动区 |
| [clay-riverside-market.webp](../public/assets/clay-riverside-market.webp) | 1600 × 900 的河畔茶市。以原河畔布局和软陶材质为参考生成，青砖、竹子和河栏保留在同机位换波画面中 |

各分件的有效像素矩形随源码保存，战斗、首页和图鉴读取项目本地资源。[分件坐标](../src/render/clay-frames.ts)

<details>
<summary>骑手鞋子补充视角的生成提示词</summary>

Use case: precise-object-edit. Game sprite asset: create a compact orthographic turntable of ONLY the chunky white sock-and-orange sneaker from row four, first column of the provided soft-clay toy delivery rider parts reference. Ignore the other parts of the sheet. A single image with 3 separated isolated single sneaker sprites in one horizontal row. All three are the same right shoe, all same size and level on same baseline, camera sees from approx 15 degrees above, fixed soft top-left lighting. Left third = toes pointed directly toward camera, two cream laces and rounded solid light cream toe cap. Center third = heel-pointing toward camera, toe points away, plain rounded orange heel panel with thin cream piping, cream ribbed sole and small orange heel pull loop; NO laces visible on back. Right third = rear three quarter view, heel towards our left and toes point diagonally away toward the RIGHT edge, visible orange heel and side. Original style must be preserved: handmade terracotta orange and warm off-white plasticine crossover strap sneaker with stubby cream sock, real soft clay texture, tiny molded sole grooves, charming miniature chunky shape. Each is one small SHOЕ, empty cuff at top, zero leg or body. Center each isolated sprite in its own third. Entire silhouettes included, plenty of transparent blank margin and separation. Alpha transparent background, no ground shadows, no checker, no scenery, no text, no labels.

</details>

## 2026-11-19 配送员制服与技能

使用内置 imagegen 参考项目已有的原创角色与夜市配色生成制服、首页立绘、蒸汽和汽水原图。战斗制服按原骨架重新分件，沿用可衔接的原四肢。蒸汽保留透明笔触，汽水保留能在战场上辨认的柠檬和冰块。四款近战气浪由 Canvas 随实际波前绘制。[角色对照](verification/courier/character.webp) · [技能分镜](verification/courier/skills.webp)

| 运行文件 | 尺寸与用途 | SHA-256 |
|---|---|---|
| [courier-uniform.webp](../public/assets/courier-uniform.webp) | 1024 × 1024，4 × 4 透明分件，用于头盔、制服、四肢和保温箱 | `6A201FD0DFA844AB3D3CD005187A495AD4ED6A00CAB29C1EEAA3BCDE3E029AD4` |
| [courier-home.webp](../public/assets/courier-home.webp) | 512 × 640，首页配送员立绘 | `610FBB99803E6E9381420E2FE26593FEDB68B0232FAED7790D92CD982FD0D50F` |
| [delivery-skills.webp](../public/assets/delivery-skills.webp) | 768 × 768，四格透明图集，上排为两束蒸汽笔触，下排为两个阶段的柠檬汽水 | `6880D7EEC71E3BAE872F6E333D7BC980A75FBD749499472B1EB4589F2400E435` |

## 前期制作记录

2026-11-19 新增[武器命中图集](../public/assets/weapon-strikes.webp)。使用内置 imagegen 原创生成四幅朝右的手绘命中图案，经透明边界检查后编码为 768 × 768 的 WebP。四格从左上顺序为琥珀夹击、青白刃斩、朱红重击与青绿纸风。运行时按武器类型选格，按实际命中方向旋转，再与对应的刀轨、纸屑或碎片合成。SHA-256 为 `DD417B857F46A2E183895649C310C69168B151F0AEC0E1B8FA62AA6B9A6D7F67`。[十种武器的实际渲染](verification/impact/weapons.webp)

V4 手感调整新增 [炉火与汽水动画图集](../public/assets/market-spells.webp)（2026-11-19）。用内置 imagegen 生成原创透明图像并编码为 WebP。图集为 1152 × 768 像素，三列两行，每格 384 × 384。上排是橙金炉火翻卷的三帧，下排是青蓝汽水涌浪的三帧。战斗中每个火团、每片减速区都按自己的生效时间和实际半径绘制，玩家和金币在效果上层显示。SHA-256 为 `99C9D7201B63318FBB0A1DF8B34550FE4C0C5CF05AD8279910D27454B3CBE814`。[正式主局中的炉火](verification/feel/burst.webp)

V4 新增 `public/assets/riverside-market.webp`（2026-11-19）。通过内置 imagegen 以仓库原有的 `night-market.png` 为参照，生成同机位的河畔茶市场景。画面采用青石地面、茶摊、竹篮和水边栏杆，保持中央场地畅通。运行资源编码为 WebP，SHA-256 为 `C757ECABA80F65A94E4B3C45A7DC6D06B5EC1C373B2C1D1B2E4873A8D3E0BC69`。

V2 的角色分件、武器与技能图集见 [V2 生成记录](V2_RUNTIME_ART.json)。以下是 2026-11-18 的初版两张生产图及程序 UI、音频记录。

## 图片来源

两张图均由本次开发使用内置 `imagegen` 工具，以用户已批准的《夜市急送》战斗概念图为参考编辑/生成，沿用暖色手绘卡通方向制作原创项目资产。背景由参考图移除角色、道具和 HUD 后生成，图集以参考图的人物和风格重新生成独立精灵。没有从《宫爆老奶奶》安装包、视频截图或商业素材库提取这些图片。

参考设计保留在相邻目录：

- [夜市人物与道具方案](../../游戏策划与设计/02_视觉与交互/06_人物与道具美术方向.md)
- [已批准夜市概念与审阅](../../游戏策划与设计/06_人物与道具战斗设计/战斗图审阅说明.md)
- [主版本 UI 设计](../../游戏策划与设计/02_视觉与交互/08_主版本UI系统规范.md)

| 文件 | 用途 | 实际内容 |
|---|---|---|
| `public/assets/atlas.png` | 透明精灵图集 | 两个橙色制服、头盔、青色挎包快递员跑步姿势；包子怪、红色外卖盒怪、大碗面怪；电扇、红滑板、绿色汽水瓶，共八个单元 |
| `public/assets/night-market.png` | 战场背景 | 暖灯笼、夜市摊位和周边植物围绕开阔灰蓝石板地，中心保留可走位空间，不包含运行时玩家、怪物或 HUD |

图集人物是两帧动作，不能标记为完整动画库。程序对图集进行取样、缩放和翻转属于渲染使用；背景装饰不自动成为碰撞障碍。两图用于当前可玩版本，后续可以在相同资源语义下替换更完整的生产资产。

登记时 SHA-256：

```text
atlas.png
BE5C11C225A9C0E1CD206A8657147A6602CCE04CF7BD7EF0D10748C6D89D392A

night-market.png
A2BE5FC32BEE27B8B3A1774B638EBC75CD8C8FE349269F685C3D8623F4CDD2ED
```

替换图片后应更新哈希、工具来源、生成日期和审阅状态，不继续沿用旧记录。

## 原始提示词与重建说明

两次生产图生成调用的原始提示词已另存为 [ASSET_PROMPTS.json](ASSET_PROMPTS.json)，其中 `background` 对应场景，`atlas` 对应精灵图集；记录还注明以已批准战斗概念图作为图像参考。

以下中文说明依据设计和实际图片整理，**不是原始提示词的逐字翻译或逐字记录，也不保证重新生成得到同一像素结果**。精确英文提示词请读取上述 JSON；此前概念图目录中的生成记录属于概念图，不能代替本次生产图记录。

### 图集重建说明

为原创横屏二维游戏《夜市急送》制作统一风格的透明背景精灵图集。暖色手绘卡通、深棕描边、柔和明暗，三分之四俯视下仍易读；各单元分开、留有透明间隙、不互相遮挡。两行四列八个单元：第一行是橙色头盔和外套、深色马尾、青绿色快递挎包、白鞋的成年女性快递员两个不同跑步姿势，随后是有脸和四肢的包子怪及红色外卖盒怪；第二行是大碗面怪、青色复古电扇、红色滑板和绿色汽水玻璃瓶。人物和道具具有具象结构，不改为几何符号；不画场景、文字标签、边框或 HUD。

### 场景重建说明

为相同暖色手绘卡通游戏制作横屏夜市战场背景。灰蓝色石板铺地，宽阔平坦的中心步行区域；边缘分布彩色棚顶摊位、暖橙灯笼、少量花草和凳子。采用轻微俯视、三分之四视角，外围装饰丰富而中心利于辨认角色与预警。不含玩家、怪物、技能、道具、分数、按钮或大标题。夜市气氛和低对比度地面服务于运行时战斗，不把背景中的装饰设为新机制。

## UI、字体、声音

- UI 图标、票据装饰、按钮、进度条与危险/技能表现由项目代码绘制，没有把概念截图裁切成整屏可交互界面。
- 字体使用系统回退栈：Noto Sans SC、Microsoft YaHei、PingFang SC、系统无衬线。项目没有附带字体二进制文件，没有把设备字体重新打包分发。未来加入字体文件需单独登记来源与许可。
- 音乐及音效由 `src/platform/audio.ts` 中的 Web Audio 振荡器、包络和程序噪声原创合成。没有导入原作旋律、音效录音或采样文件。程序合成逻辑是本版声音来源，后续烘焙为音频文件时应记录生成版本。
- 月影图书馆与珊瑚救援队保留在原设计目录，当前不加载它们的概念图，也没有声称已完成备用模式素材包。

## 检查边界

当前图片已能辨认人物、食物怪与三种实物道具。实际像素尺寸、图集裁切与透明边缘由渲染接入时检查；完整动画一致性、移动端压缩和长时间画面可读性仍需进一步制作和真机验证。生成工具来源不代表已经完成商标、名称、第三方近似性或全部平台发行审核；本文件仅记录实际制作来源，不作独占权保证。
