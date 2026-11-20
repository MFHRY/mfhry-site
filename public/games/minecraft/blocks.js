/* 我的世界风格沙盒 —— 方块目录
 * 贴图全部由本文件里的「颜色 + 图案」在运行时程序化绘制（原创像素画，
 * 不使用 Mojang 的任何美术资源）。方块名称覆盖原版创造模式物品栏的分类。
 */
(function (root) {
  'use strict';

  var LIST = [];
  var BY_KEY = {};
  var nextId = 1;

  /* shape: cube | slab | stairs | cross | pane | trans
   * pat  : 图案名，见 atlas.js
   * col  : 主色；col2 次色
   */
  function add(en, zh, pat, col, opt) {
    opt = opt || {};
    var key = opt.key || en.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (BY_KEY[key]) return BY_KEY[key];
    var b = {
      id: nextId++,
      en: en,
      zh: zh,
      pat: pat,
      col: col,
      col2: opt.col2 || null,
      shape: opt.shape || 'cube',
      opaque: opt.opaque === undefined ? true : opt.opaque,
      solid: opt.solid === undefined ? true : opt.solid,
      group: opt.group || 'building',
      light: opt.light || 0,
      key: key
    };
    LIST.push(b);
    BY_KEY[key] = b;
    return b;
  }

  /* ---------------------------------------------------------------- 16 色 */
  var C16 = [
    ['white', '白色', '#eef0f2'], ['orange', '橙色', '#ee8a2f'], ['magenta', '品红色', '#c244b8'],
    ['light_blue', '淡蓝色', '#4aa9e0'], ['yellow', '黄色', '#f0c832'], ['lime', '黄绿色', '#7dc240'],
    ['pink', '粉红色', '#efa8b8'], ['gray', '灰色', '#4a4a52'], ['light_gray', '淡灰色', '#9aa0a6'],
    ['cyan', '青色', '#2b8c9c'], ['purple', '紫色', '#7c3cc6'], ['blue', '蓝色', '#3a45b0'],
    ['brown', '棕色', '#7a4c28'], ['green', '绿色', '#4f7a26'], ['red', '红色', '#b02a2a'],
    ['black', '黑色', '#1c1c22']
  ];
  var C16Z = {
    white: '白色', orange: '橙色', magenta: '品红色', light_blue: '淡蓝色', yellow: '黄色', lime: '黄绿色',
    pink: '粉红色', gray: '灰色', light_gray: '淡灰色', cyan: '青色', purple: '紫色', blue: '蓝色',
    brown: '棕色', green: '绿色', red: '红色', black: '黑色'
  };

  /* ---------------------------------------------------------------- 木材 */
  var WOODS = [
    ['oak', '橡木', '#b3905a', '#6f5433'],
    ['spruce', '云杉木', '#6d4f2c', '#3f2d18'],
    ['birch', '白桦木', '#d7c89a', '#a89568'],
    ['jungle', '丛林木', '#a9734b', '#5d3d24'],
    ['acacia', '金合欢木', '#b06a38', '#6b3f1e'],
    ['dark_oak', '深色橡木', '#5a3c1e', '#33210f'],
    ['mangrove', '红树木', '#8a3d33', '#5a251e'],
    ['cherry', '樱花木', '#e6b8ad', '#c48c80'],
    ['bamboo', '竹', '#d9c47a', '#b39f55'],
    ['crimson', '绯红木', '#7a3a56', '#4d2036'],
    ['warped', '诡异木', '#3a8a80', '#256058']
  ];
  var WOODZ = {
    oak: '橡木', spruce: '云杉木', birch: '白桦木', jungle: '丛林木', acacia: '金合欢木',
    dark_oak: '深色橡木', mangrove: '红树木', cherry: '樱花木', bamboo: '竹',
    crimson: '绯红木', warped: '诡异木'
  };

  /* ================================================================ 自然 */
  add('Stone', '石头', 'stone', '#7f7f7f', { group: 'natural' });
  add('Cobblestone', '圆石', 'cobble', '#7a7a7a', { group: 'natural' });
  add('Mossy Cobblestone', '苔石', 'cobble', '#6f8060', { group: 'natural' });
  add('Granite', '花岗岩', 'stone', '#9a6b57', { group: 'natural' });
  add('Polished Granite', '磨制花岗岩', 'polished', '#9a6b57', { group: 'building' });
  add('Diorite', '闪长岩', 'stone', '#bfbfbf', { group: 'natural' });
  add('Polished Diorite', '磨制闪长岩', 'polished', '#c6c6c6', { group: 'building' });
  add('Andesite', '安山岩', 'stone', '#8e8e8e', { group: 'natural' });
  add('Polished Andesite', '磨制安山岩', 'polished', '#9a9a9a', { group: 'building' });
  add('Deepslate', '深板岩', 'stone', '#4c4c52', { group: 'natural' });
  add('Cobbled Deepslate', '深板岩圆石', 'cobble', '#4c4c52', { group: 'natural' });
  add('Polished Deepslate', '磨制深板岩', 'polished', '#525258', { group: 'building' });
  add('Deepslate Bricks', '深板岩砖', 'brick', '#4a4a50', { group: 'building' });
  add('Deepslate Tiles', '深板岩瓦', 'brick', '#44444a', { group: 'building' });
  add('Chiseled Deepslate', '雕纹深板岩', 'chiseled', '#4a4a50', { group: 'building' });
  add('Cracked Deepslate Bricks', '裂纹深板岩砖', 'brick', '#414147', { group: 'building' });
  add('Cracked Deepslate Tiles', '裂纹深板岩瓦', 'brick', '#3d3d43', { group: 'building' });
  add('Tuff', '凝灰岩', 'stone', '#6d6f63', { group: 'natural' });
  add('Chiseled Tuff', '雕纹凝灰岩', 'chiseled', '#6d6f63', { group: 'building' });
  add('Polished Tuff', '磨制凝灰岩', 'polished', '#6d6f63', { group: 'building' });
  add('Tuff Bricks', '凝灰岩砖', 'brick', '#6d6f63', { group: 'building' });
  add('Calcite', '方解石', 'stone', '#dcdcd7', { group: 'natural' });
  add('Dripstone Block', '滴水石块', 'stone', '#8a7257', { group: 'natural' });
  add('Pointed Dripstone', '滴水石锥', 'plant', '#8a7257', { shape: 'cross', group: 'natural' });
  add('Grass Block', '草方块', 'grass_side', '#7cbd4c', { col2: '#8a6a44', group: 'natural' });
  add('Dirt', '泥土', 'dirt', '#8a6a44', { group: 'natural' });
  add('Coarse Dirt', '砂土', 'dirt', '#7a5c3a', { group: 'natural' });
  add('Rooted Dirt', '缠根泥土', 'dirt', '#7d5f3d', { group: 'natural' });
  add('Podzol', '灰化土', 'dirt', '#6b4a28', { group: 'natural' });
  add('Mycelium', '菌丝体', 'dirt', '#8a7a86', { group: 'natural' });
  add('Mud', '泥巴', 'dirt', '#3f3a3f', { group: 'natural' });
  add('Packed Mud', '泥坯', 'terracotta', '#96876b', { group: 'building' });
  add('Mud Bricks', '泥砖', 'brick', '#96876b', { group: 'building' });
  add('Clay', '黏土', 'stone', '#a3a8b9', { group: 'natural' });
  add('Gravel', '砂砾', 'gravel', '#8f8781', { group: 'natural' });
  add('Sand', '沙子', 'sand', '#e3d9a5', { group: 'natural' });
  add('Red Sand', '红沙', 'sand', '#c47a3a', { group: 'natural' });
  add('Sandstone', '砂岩', 'sandstone', '#e0d5a0', { group: 'building' });
  add('Chiseled Sandstone', '雕纹砂岩', 'chiseled', '#e0d5a0', { group: 'building' });
  add('Cut Sandstone', '切制砂岩', 'polished', '#e0d5a0', { group: 'building' });
  add('Smooth Sandstone', '平滑砂岩', 'smooth', '#e6dcaa', { group: 'building' });
  add('Red Sandstone', '红砂岩', 'sandstone', '#bd6b2e', { group: 'building' });
  add('Chiseled Red Sandstone', '雕纹红砂岩', 'chiseled', '#bd6b2e', { group: 'building' });
  add('Cut Red Sandstone', '切制红砂岩', 'polished', '#bd6b2e', { group: 'building' });
  add('Smooth Red Sandstone', '平滑红砂岩', 'smooth', '#c47234', { group: 'building' });
  add('Bedrock', '基岩', 'stone', '#3a3a3a', { group: 'natural' });
  add('Snow Block', '雪块', 'snow', '#f4f8fb', { group: 'natural' });
  add('Powder Snow', '细雪', 'snow', '#eef4f8', { group: 'natural' });
  add('Ice', '冰', 'ice', '#a8c8ee', { shape: 'trans', opaque: false, group: 'natural' });
  add('Packed Ice', '浮冰', 'ice', '#9db8e0', { group: 'natural' });
  add('Blue Ice', '蓝冰', 'ice', '#79a8e8', { group: 'natural' });
  add('Obsidian', '黑曜石', 'obsidian', '#1a1426', { group: 'natural' });
  add('Crying Obsidian', '哭泣的黑曜石', 'obsidian', '#251a4a', { group: 'natural' });
  add('Magma Block', '岩浆块', 'magma', '#7a2a10', { group: 'natural', light: 3 });
  add('Netherrack', '下界岩', 'netherrack', '#6e2a26', { group: 'natural' });
  add('Soul Sand', '灵魂沙', 'dirt', '#4a3a32', { group: 'natural' });
  add('Soul Soil', '灵魂土', 'dirt', '#4a3626', { group: 'natural' });
  add('Basalt', '玄武岩', 'netherrack', '#4a4a52', { group: 'natural' });
  add('Polished Basalt', '磨制玄武岩', 'polished', '#4a4a52', { group: 'building' });
  add('Smooth Basalt', '平滑玄武岩', 'smooth', '#4a4a52', { group: 'building' });
  add('Blackstone', '黑石', 'stone', '#2e2830', { group: 'natural' });
  add('Polished Blackstone', '磨制黑石', 'polished', '#2e2830', { group: 'building' });
  add('Chiseled Polished Blackstone', '雕纹磨制黑石', 'chiseled', '#2e2830', { group: 'building' });
  add('Polished Blackstone Bricks', '磨制黑石砖', 'brick', '#2e2830', { group: 'building' });
  add('Cracked Polished Blackstone Bricks', '裂纹磨制黑石砖', 'brick', '#2a242c', { group: 'building' });
  add('Gilded Blackstone', '镶金黑石', 'ore', '#2e2830', { col2: '#e0b040', group: 'natural' });
  add('Crimson Nylium', '绯红菌岩', 'grass_side', '#8a3a52', { col2: '#5a2a3a', group: 'natural' });
  add('Warped Nylium', '诡异菌岩', 'grass_side', '#2e7a72', { col2: '#1f4a46', group: 'natural' });
  add('Nether Wart Block', '下界疣块', 'wool', '#7a1f1f', { group: 'natural' });
  add('Warped Wart Block', '诡异疣块', 'wool', '#1f6a62', { group: 'natural' });
  add('Shroomlight', '菌光体', 'froglight', '#e8a05a', { group: 'natural', light: 4 });
  add('Moss Block', '苔藓块', 'leaves', '#5a8a3a', { group: 'natural' });
  add('Moss Carpet', '苔藓地毯', 'leaves', '#5a8a3a', { shape: 'slab', group: 'natural' });
  add('Sculk', '幽匿块', 'sculk', '#1a2e33', { group: 'natural' });
  add('Sculk Vein', '幽匿脉络', 'sculk', '#20404a', { shape: 'slab', group: 'natural' });
  add('Sculk Catalyst', '幽匿催发体', 'sculk', '#24464e', { group: 'natural' });
  add('Sculk Shrieker', '幽匿尖啸体', 'sculk', '#2a525c', { group: 'natural' });
  add('Sculk Sensor', '幽匿感测体', 'sculk', '#2a4e58', { group: 'natural' });
  add('Amethyst Block', '紫水晶块', 'gem', '#8a6ac8', { group: 'natural' });
  add('Budding Amethyst', '紫水晶母岩', 'gem', '#7a5ab8', { group: 'natural' });
  add('Ochre Froglight', '赭黄蛙明灯', 'froglight', '#e8d05a', { group: 'natural', light: 4 });
  add('Verdant Froglight', '青翠蛙明灯', 'froglight', '#a8e05a', { group: 'natural', light: 4 });
  add('Pearlescent Froglight', '珠光蛙明灯', 'froglight', '#e8a8d0', { group: 'natural', light: 4 });
  add('Glow Lichen', '发光地衣', 'sculk', '#3a6a4a', { shape: 'slab', group: 'natural' });
  add('Sponge', '海绵', 'wool', '#c8c840', { group: 'natural' });
  add('Wet Sponge', '湿海绵', 'wool', '#8a9a3a', { group: 'natural' });

  /* ================================================================ 矿石 */
  var ORES = [
    ['Coal Ore', '煤矿石', '#1a1a1a'], ['Iron Ore', '铁矿石', '#d8af93'],
    ['Copper Ore', '铜矿石', '#e07a52'], ['Gold Ore', '金矿石', '#f0d040'],
    ['Redstone Ore', '红石矿石', '#a02020'], ['Lapis Lazuli Ore', '青金石矿石', '#2a4a9a'],
    ['Diamond Ore', '钻石矿石', '#4ad8d8'], ['Emerald Ore', '绿宝石矿石', '#2ad04a']
  ];
  ORES.forEach(function (o) {
    add(o[0], o[1], 'ore', '#7f7f7f', { col2: o[2], group: 'ore' });
    add('Deepslate ' + o[0], '深层' + o[1], 'ore', '#4c4c52', { col2: o[2], group: 'ore' });
  });
  add('Nether Gold Ore', '下界金矿石', 'ore', '#6e2a26', { col2: '#f0d040', group: 'ore' });
  add('Nether Quartz Ore', '下界石英矿石', 'ore', '#6e2a26', { col2: '#e8e0d8', group: 'ore' });
  add('Ancient Debris', '远古残骸', 'ore', '#4a3a34', { col2: '#8a5a2a', group: 'ore' });

  /* ================================================================ 金属 / 宝石块 */
  var MINBLOCKS = [
    ['Iron Block', '铁块', '#d8d8d8'], ['Gold Block', '金块', '#f0d040'],
    ['Diamond Block', '钻石块', '#4ad8d8'], ['Emerald Block', '绿宝石块', '#2ad04a'],
    ['Lapis Lazuli Block', '青金石块', '#2a4a9a'], ['Netherite Block', '下界合金块', '#4a3a3a'],
    ['Redstone Block', '红石块', '#a02020'], ['Coal Block', '煤炭块', '#1a1a1a'],
    ['Raw Iron Block', '粗铁块', '#b08a70'], ['Raw Copper Block', '粗铜块', '#c07a52'],
    ['Raw Gold Block', '粗金块', '#d8b040']
  ];
  MINBLOCKS.forEach(function (m) { add(m[0], m[1], 'metal', m[2], { group: 'building' }); });

  /* 铜氧化 */
  [['Copper Block', '铜块', '#e07a52'], ['Exposed Copper', '斑驳的铜块', '#b08a6a'],
   ['Weathered Copper', '风化的铜块', '#7aa88a'], ['Oxidized Copper', '氧化的铜块', '#5aa088']]
    .forEach(function (c) {
      add(c[0], c[1], 'copper', c[2], { group: 'building' });
      add('Cut ' + c[0], '切制' + c[1], 'polished', c[2], { group: 'building' });
      add('Waxed ' + c[0], '涂蜡' + c[1], 'copper', c[2], { group: 'building' });
      add('Waxed Cut ' + c[0], '涂蜡切制' + c[1], 'polished', c[2], { group: 'building' });
      add('Waxed ' + c[1] + ' Grate', '涂蜡' + c[1] + '格栅', 'pane', c[2], { shape: 'pane', opaque: false, group: 'building' });
    });

  /* ================================================================ 建筑石 */
  add('Smooth Stone', '平滑石头', 'smooth', '#a0a0a0', { group: 'building' });
  add('Stone Bricks', '石砖', 'brick', '#7a7a7a', { group: 'building' });
  add('Mossy Stone Bricks', '苔石砖', 'brick', '#6e7a60', { group: 'building' });
  add('Cracked Stone Bricks', '裂纹石砖', 'brick', '#707070', { group: 'building' });
  add('Chiseled Stone Bricks', '雕纹石砖', 'chiseled', '#7a7a7a', { group: 'building' });
  add('Bricks', '红砖块', 'brick', '#96584a', { group: 'building' });
  add('Quartz Block', '石英块', 'quartz', '#ece8e0', { group: 'building' });
  add('Chiseled Quartz Block', '雕纹石英块', 'chiseled', '#ece8e0', { group: 'building' });
  add('Quartz Pillar', '石英柱', 'log_side', '#ece8e0', { group: 'building' });
  add('Smooth Quartz Block', '平滑石英块', 'smooth', '#f0ece4', { group: 'building' });
  add('Quartz Bricks', '石英砖', 'brick', '#ece8e0', { group: 'building' });
  add('Purpur Block', '紫珀块', 'purpur', '#a87aac', { group: 'building' });
  add('Purpur Pillar', '紫珀柱', 'log_side', '#a87aac', { group: 'building' });
  add('Prismarine', '海晶石', 'prismarine', '#5a9a8a', { group: 'building' });
  add('Prismarine Bricks', '海晶石砖', 'brick', '#5a9a8a', { group: 'building' });
  add('Dark Prismarine', '暗海晶石', 'prismarine', '#2a5a52', { group: 'building' });
  add('Sea Lantern', '海晶灯', 'froglight', '#a8e8d8', { group: 'building', light: 4 });
  add('Glowstone', '荧石', 'froglight', '#e8c06a', { group: 'building', light: 4 });
  add('End Stone', '末地石', 'endstone', '#dad8a0', { group: 'building' });
  add('End Stone Bricks', '末地石砖', 'brick', '#dad8a0', { group: 'building' });
  add('Bone Block', '骨块', 'smooth', '#e0dcc0', { group: 'building' });
  add('Honeycomb Block', '蜜蜡块', 'wool', '#e8a02a', { group: 'building' });
  add('Nether Bricks', '下界砖块', 'brick', '#4a2226', { group: 'building' });
  add('Red Nether Bricks', '红色下界砖块', 'brick', '#6a2228', { group: 'building' });
  add('Cracked Nether Bricks', '裂纹下界砖块', 'brick', '#422024', { group: 'building' });
  add('Chiseled Nether Bricks', '雕纹下界砖块', 'chiseled', '#4a2226', { group: 'building' });
  add('Netherite Scrap', '下界合金碎片', 'metal', '#5a4a42', { group: 'building' });
  add('Resin Block', '树脂块', 'honey', '#e08a2a', { group: 'building' });

  /* ================================================================ 功能方块 */
  add('Crafting Table', '工作台', 'workbench', '#a8784a', { group: 'functional' });
  add('Furnace', '熔炉', 'furnace', '#7a7a7a', { group: 'functional' });
  add('Blast Furnace', '高炉', 'furnace', '#5a5a5a', { group: 'functional' });
  add('Smoker', '烟熏炉', 'furnace', '#6a5a4a', { group: 'functional' });
  add('Barrel', '木桶', 'planks', '#8a6a3a', { group: 'functional' });
  add('Chest', '箱子', 'chest', '#a8783a', { group: 'functional' });
  add('Trapped Chest', '陷阱箱', 'chest', '#a8783a', { group: 'functional' });
  add('Ender Chest', '末影箱', 'chest', '#2a3a3a', { group: 'functional' });
  add('Bookshelf', '书架', 'bookshelf', '#a8783a', { group: 'functional' });
  add('Chiseled Bookshelf', '雕纹书架', 'bookshelf', '#a8783a', { group: 'functional' });
  add('Loom', '织布机', 'planks', '#a8784a', { group: 'functional' });
  add('Cartography Table', '制图台', 'planks', '#8a6a3a', { group: 'functional' });
  add('Fletching Table', '制箭台', 'planks', '#b0a070', { group: 'functional' });
  add('Smithing Table', '锻造台', 'metal', '#4a4a52', { group: 'functional' });
  add('Grindstone', '砂轮', 'stone', '#8a8a8a', { group: 'functional' });
  add('Stonecutter', '切石机', 'stone', '#9a9a9a', { group: 'functional' });
  add('Enchanting Table', '附魔台', 'enchant', '#8a2a3a', { group: 'functional' });
  add('Anvil', '铁砧', 'metal', '#4a4a52', { group: 'functional' });
  add('Chipped Anvil', '开裂的铁砧', 'metal', '#46464e', { group: 'functional' });
  add('Damaged Anvil', '损坏的铁砧', 'metal', '#42424a', { group: 'functional' });
  add('Beacon', '信标', 'gem', '#8ad8e8', { group: 'functional', light: 3 });
  add('TNT', 'TNT', 'tnt', '#c03a2a', { group: 'functional' });
  add('Note Block', '音符盒', 'planks', '#8a5a3a', { group: 'functional' });
  add('Jukebox', '唱片机', 'planks', '#7a4a2a', { group: 'functional' });
  add('Dispenser', '发射器', 'furnace', '#7a7a7a', { group: 'functional' });
  add('Dropper', '投掷器', 'furnace', '#6a6a70', { group: 'functional' });
  add('Hopper', '漏斗', 'metal', '#4a4a52', { group: 'functional' });
  add('Observer', '侦测器', 'observer', '#7a7a7a', { group: 'functional' });
  add('Piston', '活塞', 'piston', '#b0a070', { group: 'functional' });
  add('Sticky Piston', '黏性活塞', 'piston', '#8aa060', { group: 'functional' });
  add('Piston Head', '活塞头', 'piston', '#b0a070', { group: 'functional' });
  add('Redstone Lamp', '红石灯', 'froglight', '#a06030', { group: 'functional', light: 4 });
  add('Daylight Detector', '阳光探测器', 'polished', '#8a7a5a', { group: 'functional' });
  add('Target', '标靶', 'target', '#e0d8c0', { group: 'functional' });
  add('Lectern', '讲台', 'planks', '#a8784a', { group: 'functional' });
  add('Composter', '堆肥桶', 'planks', '#7a5a3a', { group: 'functional' });
  add('Cauldron', '炼药锅', 'metal', '#3a3a42', { group: 'functional' });
  add('Bell', '钟', 'metal', '#e0b040', { group: 'functional' });
  add('Campfire', '营火', 'campfire', '#8a5a2a', { group: 'functional', light: 3 });
  add('Soul Campfire', '灵魂营火', 'campfire', '#2a8a8a', { group: 'functional', light: 3 });
  add('Lantern', '灯笼', 'lantern', '#e0a040', { group: 'functional', light: 3 });
  add('Soul Lantern', '灵魂灯笼', 'lantern', '#2ac0c0', { group: 'functional', light: 3 });
  add('Torch', '火把', 'torch', '#e0a040', { shape: 'cross', solid: false, group: 'functional', light: 4 });
  add('Soul Torch', '灵魂火把', 'torch', '#2ac0c0', { shape: 'cross', solid: false, group: 'functional', light: 4 });
  add('Redstone Torch', '红石火把', 'torch', '#c02020', { shape: 'cross', solid: false, group: 'functional' });
  add('End Rod', '末地烛', 'smooth', '#e8e8e8', { group: 'functional', light: 3 });
  add('Chain', '锁链', 'pane', '#4a4a52', { shape: 'pane', opaque: false, group: 'functional' });
  add('Iron Bars', '铁栏杆', 'pane', '#4a4a52', { shape: 'pane', opaque: false, group: 'building' });

  /* ================================================================ 液体 / 玻璃 */
  add('Water', '水', 'liquid', '#2a5ad8', { shape: 'trans', opaque: false, solid: false, group: 'natural' });
  add('Lava', '熔岩', 'liquid', '#e05a10', { shape: 'trans', opaque: false, solid: false, group: 'natural', light: 4 });
  add('Glass', '玻璃', 'glass', '#c8e8f0', { shape: 'trans', opaque: false, group: 'building' });
  add('Tinted Glass', '遮光玻璃', 'glass', '#3a3a3a', { shape: 'trans', opaque: false, group: 'building' });
  add('Glass Pane', '玻璃板', 'pane', '#c8e8f0', { shape: 'pane', opaque: false, group: 'building' });

  /* ================================================================ 16 色家族 */
  C16.forEach(function (c) {
    var en = ({ white: 'White', orange: 'Orange', magenta: 'Magenta', light_blue: 'Light Blue', yellow: 'Yellow',
      lime: 'Lime', pink: 'Pink', gray: 'Gray', light_gray: 'Light Gray', cyan: 'Cyan', purple: 'Purple',
      blue: 'Blue', brown: 'Brown', green: 'Green', red: 'Red', black: 'Black' })[c[0]] || c[0];
    add(en + ' Wool', c[1] + '羊毛', 'wool', c[2], { key: 'wool_' + c[0], group: 'color' });
    add(en + ' Concrete', c[1] + '混凝土', 'concrete', c[2], { group: 'color' });
    add(en + ' Concrete Powder', c[1] + '混凝土粉末', 'sand', c[2], { group: 'color' });
    add(en + ' Terracotta', c[1] + '陶瓦', 'terracotta', c[2], { group: 'color' });
    add(en + ' Glazed Terracotta', c[1] + '带釉陶瓦', 'glazed', c[2], { group: 'color' });
    add(en + ' Stained Glass', c[1] + '染色玻璃', 'glass', c[2], { shape: 'trans', opaque: false, group: 'color' });
    add(en + ' Stained Glass Pane', c[1] + '染色玻璃板', 'pane', c[2], { shape: 'pane', opaque: false, group: 'color' });
    add(en + ' Carpet', c[1] + '地毯', 'wool', c[2], { shape: 'slab', group: 'color' });
    add(en + ' Bed', c[1] + '床', 'wool', c[2], { shape: 'slab', group: 'color' });
    add(en + ' Banner', c[1] + '旗帜', 'wool', c[2], { shape: 'cross', solid: false, group: 'color' });
    add(en + ' Candle', c[1] + '蜡烛', 'wax', c[2], { shape: 'cross', solid: false, group: 'color' });
    add(en + ' Shulker Box', c[1] + '潜影盒', 'shulker', c[2], { group: 'color' });
  });
  add('Terracotta', '陶瓦', 'terracotta', '#985c40', { group: 'color' });

  /* ================================================================ 木材全家桶 */
  WOODS.forEach(function (w) {
    var k = w[0], zh = WOODZ[k], col = w[2], dark = w[3];
    add(cap(k) + ' Planks', zh + '木板', 'planks', col, { group: 'wood' });
    add(cap(k) + ' Log', zh + '原木', 'log_side', dark, { col2: col, group: 'wood' });
    add(cap(k) + ' Wood', zh + '木头', 'log_side', dark, { col2: col, group: 'wood' });
    add('Stripped ' + cap(k) + ' Log', '去皮' + zh + '原木', 'log_side', col, { col2: dark, group: 'wood' });
    add('Stripped ' + cap(k) + ' Wood', '去皮' + zh + '木头', 'log_side', col, { col2: dark, group: 'wood' });
    add(cap(k) + ' Leaves', zh + '树叶', 'leaves', k === 'crimson' || k === 'warped' ? dark : '#4a8a2a',
      { shape: 'trans', opaque: false, group: 'wood' });
    add(cap(k) + ' Slab', zh + '台阶', 'planks', col, { shape: 'slab', group: 'wood' });
    add(cap(k) + ' Stairs', zh + '楼梯', 'planks', col, { shape: 'stairs', group: 'wood' });
    add(cap(k) + ' Fence', zh + '栅栏', 'planks', col, { shape: 'pane', opaque: false, group: 'wood' });
    add(cap(k) + ' Fence Gate', zh + '栅栏门', 'planks', col, { shape: 'pane', opaque: false, group: 'wood' });
    add(cap(k) + ' Door', zh + '门', 'planks', col, { shape: 'pane', opaque: false, group: 'wood' });
    add(cap(k) + ' Trapdoor', zh + '活板门', 'planks', col, { shape: 'slab', group: 'wood' });
    add(cap(k) + ' Button', zh + '按钮', 'planks', col, { shape: 'cross', solid: false, group: 'wood' });
    add(cap(k) + ' Pressure Plate', zh + '压力板', 'planks', col, { shape: 'slab', group: 'wood' });
    add(cap(k) + ' Sign', zh + '告示牌', 'planks', col, { shape: 'pane', opaque: false, group: 'wood' });
    add(cap(k) + ' Sapling', zh + '树苗', 'plant', '#4a8a2a', { shape: 'cross', solid: false, group: 'plant' });
  });
  function cap(s) { return s.split('_').map(function (x) { return x[0].toUpperCase() + x.slice(1); }).join(' '); }

  /* ================================================================ 植物 */
  [['Grass', '草丛', '#5aa03a'], ['Tall Grass', '高草丛', '#5aa03a'], ['Fern', '蕨', '#4a8a3a'],
   ['Large Fern', '大型蕨', '#4a8a3a'], ['Dead Bush', '枯萎的灌木', '#8a6a3a'],
   ['Dandelion', '蒲公英', '#e8d040'], ['Poppy', '虞美人', '#c83030'],
   ['Blue Orchid', '兰花', '#2a8ad0'], ['Allium', '绒球葱', '#b06ad0'], ['Azure Bluet', '蓝花美耳草', '#e8e8a0'],
   ['Red Tulip', '红色郁金香', '#c83030'], ['Orange Tulip', '橙色郁金香', '#e08020'],
   ['White Tulip', '白色郁金香', '#e8e8e8'], ['Pink Tulip', '粉色郁金香', '#e8a0c0'],
   ['Oxeye Daisy', '滨菊', '#f0f0e0'], ['Cornflower', '矢车菊', '#4a6ad0'],
   ['Lily of the Valley', '铃兰', '#e8f0e8'], ['Wither Rose', '凋灵玫瑰', '#2a2a2a'],
   ['Sunflower', '向日葵', '#e8c020'], ['Lilac', '丁香', '#c0a0d0'], ['Rose Bush', '玫瑰丛', '#c03040'],
   ['Peony', '牡丹', '#e8a0b0'], ['Sugar Cane', '甘蔗', '#8ac060'], ['Wheat', '小麦', '#d8c060'],
   ['Carrots', '胡萝卜', '#e08020'], ['Potatoes', '马铃薯', '#c0a040'], ['Beetroots', '甜菜根', '#a03040'],
   ['Melon', '西瓜', '#5aa02a'], ['Pumpkin', '南瓜', '#e08a20'], ['Carved Pumpkin', '雕刻南瓜', '#e08a20'],
   ['Jack o\'Lantern', '南瓜灯', '#e08a20'], ['Cactus', '仙人掌', '#3a8a3a'],
   ['Bamboo', '竹子', '#c0b060'], ['Sweet Berry Bush', '甜浆果丛', '#a03040'],
   ['Kelp', '海带', '#4a8a4a'], ['Seagrass', '海草', '#3a9a5a'], ['Tall Seagrass', '高海草', '#3a9a5a'],
   ['Big Dripleaf', '大型垂滴叶', '#4a9a3a'], ['Small Dripleaf', '小型垂滴叶', '#5aaa3a'],
   ['Spore Blossom', '孢子花', '#e88aa0'], ['Glow Berries', '发光浆果', '#e8a040'],
   ['Vine', '藤蔓', '#3a7a2a'], ['Weeping Vines', '垂泪藤', '#8a2a3a'], ['Twisting Vines', '缠怨藤', '#2a8a7a'],
   ['Chorus Plant', '紫颂植株', '#6a3a6a'], ['Chorus Flower', '紫颂花', '#8a5a8a'],
   ['Nether Wart', '下界疣', '#7a1f1f'], ['Lily Pad', '睡莲', '#3a8a3a'],
   ['Crimson Fungus', '绯红菌', '#8a3a52'], ['Warped Fungus', '诡异菌', '#2e7a72'],
   ['Brown Mushroom', '棕色蘑菇', '#8a6a4a'], ['Red Mushroom', '红色蘑菇', '#c03030'],
   ['Torchflower', '火把花', '#e0a020'], ['Pitcher Plant', '瓶子草', '#6aa0c0'],
   ['Pink Petals', '粉红色花瓣', '#e8a0c0'], ['Short Grass', '矮草丛', '#5aa03a'],
   ['Sea Pickle', '海泡菜', '#4a9a6a'], ['Mangrove Propagule', '红树胎生苗', '#5a7a3a']
  ].forEach(function (p) { add(p[0], p[1], 'plant', p[2], { shape: 'cross', solid: false, group: 'plant' }); });

  add('Brown Mushroom Block', '棕色蘑菇方块', 'mushroom', '#8a6a4a', { group: 'plant' });
  add('Red Mushroom Block', '红色蘑菇方块', 'mushroom', '#c03030', { group: 'plant' });
  add('Mushroom Stem', '蘑菇柄', 'smooth', '#c8c0b0', { group: 'plant' });
  add('Hay Block', '干草捆', 'hay', '#d8b040', { group: 'plant' });
  add('Dried Kelp Block', '干海带块', 'hay', '#3a5a3a', { group: 'plant' });
  add('Melon Block', '西瓜块', 'melon', '#5aa02a', { group: 'plant' });
  add('Pumpkin Block', '南瓜块', 'pumpkin', '#e08a20', { group: 'plant' });
  add('Slime Block', '黏液块', 'slime', '#7ac06a', { shape: 'trans', opaque: false, group: 'functional' });
  add('Honey Block', '蜂蜜块', 'honey', '#e0a02a', { shape: 'trans', opaque: false, group: 'functional' });
  add('Cobweb', '蜘蛛网', 'cobweb', '#d8d8d8', { shape: 'cross', solid: false, group: 'functional' });
  add('Barrier', '屏障', 'glass', '#c02020', { shape: 'trans', opaque: false, solid: false, group: 'functional' });
  add('Light', '光源方块', 'froglight', '#f0e0a0', { shape: 'trans', opaque: false, solid: false, group: 'functional', light: 5 });
  add('Structure Void', '结构空位', 'glass', '#c0c0c0', { shape: 'trans', opaque: false, solid: false, group: 'functional' });
  add('Spawner', '刷怪笼', 'furnace', '#3a3a4a', { shape: 'trans', opaque: false, group: 'functional' });

  /* ================================================================ 装饰 / 特殊 */
  add('Smooth Stone Slab', '平滑石头台阶', 'smooth', '#a0a0a0', { shape: 'slab', group: 'building' });
  add('Stone Slab', '石头台阶', 'stone', '#7f7f7f', { shape: 'slab', group: 'building' });
  add('Cobblestone Slab', '圆石台阶', 'cobble', '#7a7a7a', { shape: 'slab', group: 'building' });
  add('Stone Bricks Slab', '石砖台阶', 'brick', '#7a7a7a', { shape: 'slab', group: 'building' });
  add('Brick Slab', '红砖台阶', 'brick', '#96584a', { shape: 'slab', group: 'building' });
  add('Quartz Slab', '石英台阶', 'quartz', '#ece8e0', { shape: 'slab', group: 'building' });
  add('Sandstone Slab', '砂岩台阶', 'sandstone', '#e0d5a0', { shape: 'slab', group: 'building' });
  add('Stone Stairs', '石头楼梯', 'stone', '#7f7f7f', { shape: 'stairs', group: 'building' });
  add('Cobblestone Stairs', '圆石楼梯', 'cobble', '#7a7a7a', { shape: 'stairs', group: 'building' });
  add('Stone Bricks Stairs', '石砖楼梯', 'brick', '#7a7a7a', { shape: 'stairs', group: 'building' });
  add('Brick Stairs', '红砖楼梯', 'brick', '#96584a', { shape: 'stairs', group: 'building' });
  add('Quartz Stairs', '石英楼梯', 'quartz', '#ece8e0', { shape: 'stairs', group: 'building' });
  add('Cobblestone Wall', '圆石墙', 'cobble', '#7a7a7a', { shape: 'pane', opaque: false, group: 'building' });
  add('Stone Brick Wall', '石砖墙', 'brick', '#7a7a7a', { shape: 'pane', opaque: false, group: 'building' });
  add('Iron Door', '铁门', 'metal', '#c8c8c8', { shape: 'pane', opaque: false, group: 'building' });
  add('Iron Trapdoor', '铁活板门', 'metal', '#c8c8c8', { shape: 'slab', group: 'building' });

  root.MC_BLOCKS = LIST;
  root.MC_BLOCK_BY_KEY = BY_KEY;
  root.MC_C16 = C16;
  root.MC_WOODS = WOODS;
})(window);
