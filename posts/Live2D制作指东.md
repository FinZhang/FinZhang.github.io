---
title: "Live2D制作指东"
date: 2020-11-21
categories: "杂学"
tags: ["Live2D"]
url_suffix: "live2d"
---

一篇（对其他人可能完全没有用的）live2D制作~~教程~~备忘。原则上你只需要一张静态图和~~当死宅多年的~~想象力就可以让任何角色动起来，但具体实现还是有不少约束（特别是你不会画画的情况下）

这是一个基本写给自己的备忘录，如果读者是刚开始学，建议先看一遍下方的视频

基本盘：

[Live2D Tutorial 2016 (non-artist)](https://www.youtube.com/playlist?list=PLhha8OGApHGPdtbK3gmAEMyk2d2icpdtj)

头发，颈部，身体

[Live2D Cubism 2.0 tutorial (2015) - Ep.10 "Hair"](https://www.youtube.com/watch?v=-tYx-Rpz3Nc&list=PLhha8OGApHGM4B8gk7uaqu_LjXAeSuRKP&index=15)

[Live2D Cubism 2.0 tutorial (2015) - Ep.11 "Neck, Body, L2DViewer, Dev News"](https://www.youtube.com/watch?v=R46IMQf99VU&list=PLhha8OGApHGM4B8gk7uaqu_LjXAeSuRKP&index=17)

物理效果 1

[How to set physical operation](https://docs.live2d.com/cubism-editor-manual/physical-operation-setting/?locale=en_us)

### PS部分

*注意开始前背景扣成透明。大部分元件都需要多延伸一部分（多扣或者自己填色），导出前注意先手动移动确认每个部分都没有问题！

图层从下到上为:

- 可置于背后的附属装饰
  - 最好是可以遵循后发逻辑的，否则需要参数另外调整 
- 后发  
  - 把握轮廓，记得描边和填涂中央区域。最后完成时调整前发和脸的位置确认露出的后发部分无违和  
- 脖子
  - 下端阶段注意截断位置，上端不要有边缘。上下端额外延伸填涂一部分，注意阴影的合理性
- 身体
  - 与脖子连接处延伸一段距离
- 脸部
  - 记得五官涂干净（面部颜色统一），下半部（露出来的部分）需要描边。刘海下方用阴影颜色填涂。上部分不要延伸过多！
- 耳朵 
  - 看着扣就好，可以延伸一部分但其实非必要，如果麻烦可以就只扣。
- 鼻子
  - 就扣完事了
- 嘴 
  - 每个表情的嘴型准备三个（开，半开，闭），每个嘴型均需确认没有违和感且能自然转换
- 眼睛 
  - 每只眼睛都需要：眉毛（eyesbrow），睫毛（eyeslash），眼白，瞳孔（iris），高光。睫毛准备三个状态，眉毛数量按表情决定（或者直接到时候cubism里调整）
- 前发
  - 通常分为左右侧发和刘海(bangs)。注意刘海两侧多扣，侧发靠内的一侧多扣，外侧稍微淡化一下边缘（以作为边缘和内部均违和感小为宜）

### Model结构

（元素-前缀，**deformer**无前缀，括号内是该条目所应用的keyforms）

- **body deformer** (body Y - body Z 身体绕垂直轴转-绕画面轴转，注意这个Y和Angle定义有差异...）
  - -body （Breathing）
- **rotation deformer**（Angle Z 左右歪头）
  - **deformer of neck 1** （body Y - body Z 主要是配合body deformer 的 workaround）
  - **neck def** （Angle X - Angle Y 配合头部的这两个参数的调整）
    - -neck (Angle Z 配合rotation deformer)
  - **head deformer** （body Y - body Z 主要是配合body deformer 的 workaround）
  - -earR，earL （Angle X - Angle Y 配合头部的这两个参数的调整）
  - **sideL，sideR** （Angle X - Angle Y 同上）
    - -sideL，-sideR (Angle Z 配合rotation deformer，注意额外重力偏移。Hair move side：用于添加物理效果，左右发对于同一参数的摆动方向一致)
  - **fronthair** （Angle X - Angle Y 同上）
    - -bangs （Hair move front：同上，注意方向和hair move side一致）
  - **face deformer** （Angle X - Angle Y 同上）
    - -nose，-face （无参数）
    - **righteye，lefteye**（无参数）
    - -browsL，browR （mouth form-mouth open 一个简单实现表情的work around）
    - -eyeslashL123，eyeslashR123 （EyeR，EyeL open：具体实现参见3）
    - -eyewhiteL-mask，eyewhiteR-mask（EyeR，EyeL open：用于蒙版，参见3）
    - -eyewhiteL，eyewhiteR （无参数）
    - **IrisR,，IrisL** （Eyeball X - Eyeball Y 不用多解释）
      - -irisR，irisL （EyeR，EyeL open：用于调整闭眼时的瞳孔变形）
      - **highlight defL，highlight defR** （Eyeball X - Eyeball Y 瞳孔移动时高光的移动，效果不是很明显）
      - -highlightL，highlightR （EyeR，EyeL open：用于调整闭眼时的高光移动）
    - **mouth** （无参数）
    - -mouthH123，-mouthS123（mouth form-mouth open，实现参见3）
  - **backhair** （Angle X - Angle Y 同上）
  - -backhair （Angle Z 配合rotation deformer，注意额外重力偏移。Hair move back：用于添加物理效果，注意方向和hair move side一致）
    - -p0，-p1，-p2，-p3...（丝带等需要添加物理效果的自行添加参数提供摆动自由度，注意方向一致。其他元素无参数）

### 简单work flow

- 先做face deformer的angleXY（即先给face元素创建一个face deformer作为基底），随后做eyeball（eye本身只需要跟着face deformer），即两个iris的deformer。
- 睫毛eyeslash
- 具体操作：令开眼，半闭，闭眼三个状态的睫毛在 开眼1 半闭0.5 闭眼0 三个keyforms上的可见度分别为100-0-0，0-100-0，0-0-100，同时确保他们全程都变形到同一位置减少违和感，更具体的操作参见 [How to swap eye textures for blinking (2016 Ep.13)](https://www.youtube.com/watch?v=G7uOpVkwPtM&list=PLhha8OGApHGPdtbK3gmAEMyk2d2icpdtj&index=14) （这种程度的解释我觉得我自己应该能回想起来了……）
- 复制眼白为mask，然后令其随eye open参数逐渐压缩变小。将其id复制给-iris，-highlight，-eyewhite当cliping ID实现眨眼
- nose基本就是跟着face deformer走（和face一样）
- mouth的状态过度是和睫毛的处理方法是一样的，如果加入mouth form作为表情参数的话需要注意两个维度（四种切换方式）的过渡自然性！
- ear要额外根据两个angle调整来产生透视效果，在其元素上调整即可
- hair的四个部分各自准备一个deformer用于angleXY，自己的元素则负责提供物理效果自由度的hair move xxx和模拟重力的angle Z。这一部分需要严格调整检查确保变化过程和变化结尾点均不违和！
- 上面neck的三级主要就是为了参数不超两个的上限……不多解释，根据对应表调整就完事了
- 以上全部完成后（记得创建head deformer）把head和neck放进一个rotation deformer里做angle Z。大约左右各旋转15度。旋转轴在脖子中心比较好
- 另外新建body deformer负责body的两个旋转和呼吸
- 细节：绕垂直轴转Y ，转入画面的一侧水平压缩（需要的话也垂直压缩降低肩部），转出的一侧水平压缩并抬高肩部，头往相同侧微微平移。绕画面轴转Z，抬高/降低对应肩，需要时可以拉伸变形，头往相反方向微侧可以增加真实感。呼吸，吸气段微微放大整个身体，身体前胸部分稍微拉伸扩大，呼气端不变即可（不要过度！确认重复变化时不会影响整体观感！）
- 最后开random pose检查整体效果

### 操作tips

- 无论是deformer还是元素，插入keyforms都可以用parameter面板上的快捷键
- 创建rotation deformer用第三个按钮（第二个不能调旋转轴，没找到负责移动的快捷键，为了省事就用第三个了）
- 为keyforms做变形时，简单微调可以用绿十字和灰方框四角实现，如果要多自由度则最好生成mesh（auto就差不多）。然后自己手动调节点（不推荐）/用deform path edit（右侧三个的第一个）左键创建点（alt+左键删点）来生成变形曲线（我不算充分理解，但基本可以这么用），然后切回鼠标模式可以拉拽点来实现自然变形。
- 设置物理效果时，单摆摆长基本和发长保持一致（？）记得两个body 参数也要进入input quantity 中
- motion编辑界面使用的work around：右下角红点录像然后关闭，随后左上角选项切animation，复制scene，随后选中在左上角切到form animation。时间轴模式默认是一秒三十帧。点时间轴左侧的模型行会有参数调节界面。选择一帧再调节参数就相当于插入了keyframe（操作就类似于模型编辑keyforms）拉动时间轴后面的灰色分界线是调节总动画时长（记得紫线也拉上），下面的黄线是模型出现时间，简单来说就是拉满。keyframe在蓝色全选模式下可以拖动（别稀里糊涂只拖了一个参数！）
