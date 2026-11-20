/* 生物：盒状模型 + 程序化皮肤 + 简单 AI
 * 每个生物由若干 BoxGeometry 拼成，皮肤用 canvas 现画（原创像素画）
 */
(function (root) {
  'use strict';

  /* type: passive 中立/被动, hostile 敌对, neutral 中立
   * body: [w,h,d] 身体尺寸；head: [w,h,d]；legs: 腿数量
   * col/c2: 主色/辅色；face: 眼睛颜色
   */
  var MOBS = [
    { key: 'pig', en: 'Pig', zh: '猪', type: 'passive', body: [0.62, 0.55, 1.0], head: [0.5, 0.5, 0.5], headY: 0.52, legs: 4, col: '#e8a0a0', c2: '#e08080', face: '#1a1a1a', snout: true },
    { key: 'cow', en: 'Cow', zh: '牛', type: 'passive', body: [0.72, 0.7, 1.25], head: [0.55, 0.55, 0.6], headY: 0.78, legs: 4, col: '#4a3428', c2: '#e8e0d8', face: '#1a1a1a', horns: true },
    { key: 'sheep', en: 'Sheep', zh: '羊', type: 'passive', body: [0.72, 0.72, 1.1], head: [0.42, 0.5, 0.42], headY: 0.5, legs: 4, col: '#e8e4dc', c2: '#d8d0c4', face: '#3a2a22' },
    { key: 'chicken', en: 'Chicken', zh: '鸡', type: 'passive', body: [0.4, 0.42, 0.55], head: [0.3, 0.34, 0.28], headY: 0.6, legs: 2, col: '#f0f0f0', c2: '#e8b020', face: '#e8b020', beak: true },
    { key: 'rabbit', en: 'Rabbit', zh: '兔子', type: 'passive', body: [0.32, 0.3, 0.5], head: [0.28, 0.28, 0.26], headY: 0.5, legs: 4, col: '#b09480', c2: '#e0d0c0', face: '#201820', ears: true },
    { key: 'fox', en: 'Fox', zh: '狐狸', type: 'neutral', body: [0.4, 0.38, 0.75], head: [0.34, 0.32, 0.36], headY: 0.46, legs: 4, col: '#e08040', c2: '#f0e8e0', face: '#201820', ears: true, tail: true },
    { key: 'wolf', en: 'Wolf', zh: '狼', type: 'neutral', body: [0.44, 0.46, 0.95], head: [0.38, 0.36, 0.4], headY: 0.5, legs: 4, col: '#c8c8c8', c2: '#e8e8e8', face: '#201820', ears: true, tail: true },
    { key: 'cat', en: 'Cat', zh: '猫', type: 'passive', body: [0.3, 0.3, 0.6], head: [0.3, 0.28, 0.28], headY: 0.42, legs: 4, col: '#f0c060', c2: '#e8a040', face: '#201820', ears: true, tail: true },
    { key: 'ocelot', en: 'Ocelot', zh: '豹猫', type: 'passive', body: [0.3, 0.3, 0.6], head: [0.28, 0.26, 0.26], headY: 0.42, legs: 4, col: '#d8b050', c2: '#3a2a1a', face: '#201820', ears: true, tail: true },
    { key: 'horse', en: 'Horse', zh: '马', type: 'passive', body: [0.55, 0.6, 1.3], head: [0.4, 0.4, 0.5], headY: 0.95, legs: 4, col: '#8a5a3a', c2: '#4a2a1a', face: '#201820', tall: true, mane: true },
    { key: 'donkey', en: 'Donkey', zh: '驴', type: 'passive', body: [0.5, 0.55, 1.15], head: [0.36, 0.36, 0.46], headY: 0.9, legs: 4, col: '#8a7a68', c2: '#5a4a3a', face: '#201820', tall: true, ears: true },
    { key: 'llama', en: 'Llama', zh: '羊驼', type: 'passive', body: [0.5, 0.55, 1.0], head: [0.34, 0.34, 0.5], headY: 1.05, legs: 4, col: '#c8b090', c2: '#e8dcc8', face: '#201820', tall: true, neck: true },
    { key: 'goat', en: 'Goat', zh: '山羊', type: 'passive', body: [0.42, 0.5, 0.85], head: [0.32, 0.32, 0.36], headY: 0.78, legs: 4, col: '#d8d0c0', c2: '#a89880', face: '#201820', horns: true },
    { key: 'panda', en: 'Panda', zh: '熊猫', type: 'neutral', body: [0.75, 0.7, 1.1], head: [0.55, 0.52, 0.5], headY: 0.72, legs: 4, col: '#e8e8e8', c2: '#202020', face: '#202020' },
    { key: 'polar_bear', en: 'Polar Bear', zh: '北极熊', type: 'neutral', body: [0.8, 0.78, 1.3], head: [0.55, 0.5, 0.55], headY: 0.8, legs: 4, col: '#f0f0f0', c2: '#e0e0e0', face: '#201820' },
    { key: 'turtle', en: 'Turtle', zh: '海龟', type: 'passive', body: [0.6, 0.28, 0.7], head: [0.25, 0.25, 0.25], headY: 0.3, legs: 4, col: '#4a8a4a', c2: '#2a5a2a', face: '#201820' },
    { key: 'axolotl', en: 'Axolotl', zh: '美西螈', type: 'passive', body: [0.28, 0.24, 0.55], head: [0.26, 0.24, 0.24], headY: 0.34, legs: 4, col: '#e8a8c0', c2: '#d08090', face: '#201820' },
    { key: 'frog', en: 'Frog', zh: '青蛙', type: 'passive', body: [0.4, 0.28, 0.4], head: [0.35, 0.26, 0.3], headY: 0.3, legs: 4, col: '#6a9a3a', c2: '#4a7a2a', face: '#201820' },
    { key: 'bee', en: 'Bee', zh: '蜜蜂', type: 'neutral', body: [0.35, 0.3, 0.4], head: [0.25, 0.24, 0.2], headY: 0.45, legs: 0, col: '#e8c040', c2: '#202020', face: '#202020', wings: true, fly: true },
    { key: 'parrot', en: 'Parrot', zh: '鹦鹉', type: 'passive', body: [0.24, 0.3, 0.34], head: [0.2, 0.2, 0.2], headY: 0.5, legs: 2, col: '#c03040', c2: '#3a8ac0', face: '#201820', beak: true, fly: true },
    { key: 'bat', en: 'Bat', zh: '蝙蝠', type: 'neutral', body: [0.2, 0.18, 0.28], head: [0.18, 0.16, 0.16], headY: 0.32, legs: 0, col: '#4a3a34', c2: '#2a1a18', face: '#201820', wings: true, fly: true },
    { key: 'villager', en: 'Villager', zh: '村民', type: 'passive', body: [0.4, 0.7, 0.32], head: [0.42, 0.42, 0.4], headY: 0.85, legs: 2, col: '#a8784a', c2: '#5a8a3a', face: '#8a6a4a', tall: true, nose: true },
    { key: 'wandering_trader', en: 'Wandering Trader', zh: '流浪商人', type: 'passive', body: [0.4, 0.7, 0.32], head: [0.42, 0.42, 0.4], headY: 0.85, legs: 2, col: '#2a4a8a', c2: '#e8d040', face: '#8a6a4a', tall: true, nose: true },
    { key: 'iron_golem', en: 'Iron Golem', zh: '铁傀儡', type: 'neutral', body: [0.75, 1.0, 0.5], head: [0.4, 0.4, 0.4], headY: 1.35, legs: 2, col: '#c8c0b0', c2: '#8a8a80', face: '#201820', tall: true },
    { key: 'snow_golem', en: 'Snow Golem', zh: '雪傀儡', type: 'passive', body: [0.5, 0.6, 0.4], head: [0.44, 0.44, 0.42], headY: 0.9, legs: 2, col: '#f0f4f8', c2: '#e0e8f0', face: '#201820', tall: true },
    { key: 'allay', en: 'Allay', zh: '悦灵', type: 'passive', body: [0.28, 0.3, 0.28], head: [0.26, 0.24, 0.24], headY: 0.5, legs: 0, col: '#55c8f0', c2: '#a0e8f8', face: '#201820', fly: true, wings: true },
    { key: 'zombie', en: 'Zombie', zh: '僵尸', type: 'hostile', body: [0.42, 0.72, 0.28], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#4a7a5a', c2: '#2a5a42', face: '#101010', tall: true },
    { key: 'skeleton', en: 'Skeleton', zh: '骷髅', type: 'hostile', body: [0.36, 0.72, 0.24], head: [0.38, 0.38, 0.36], headY: 0.9, legs: 2, col: '#d8d8d0', c2: '#b0b0a8', face: '#101010', tall: true },
    { key: 'creeper', en: 'Creeper', zh: '苦力怕', type: 'hostile', body: [0.42, 1.0, 0.42], head: [0.44, 0.44, 0.44], headY: 1.05, legs: 4, col: '#4a9a3a', c2: '#3a7a2a', face: '#101010', tall: true },
    { key: 'spider', en: 'Spider', zh: '蜘蛛', type: 'hostile', body: [0.7, 0.42, 0.75], head: [0.35, 0.32, 0.32], headY: 0.3, legs: 8, col: '#2a2028', c2: '#4a3040', face: '#e02020' },
    { key: 'cave_spider', en: 'Cave Spider', zh: '洞穴蜘蛛', type: 'hostile', body: [0.5, 0.3, 0.55], head: [0.28, 0.26, 0.26], headY: 0.28, legs: 8, col: '#2a3a4a', c2: '#3a5a6a', face: '#e02020' },
    { key: 'enderman', en: 'Enderman', zh: '末影人', type: 'hostile', body: [0.4, 1.1, 0.28], head: [0.4, 0.4, 0.4], headY: 1.35, legs: 2, col: '#161018', c2: '#2a1a30', face: '#c060e0', tall: true },
    { key: 'slime', en: 'Slime', zh: '史莱姆', type: 'hostile', body: [0.7, 0.7, 0.7], head: [0.4, 0.3, 0.3], headY: 0.62, legs: 0, col: '#7ac06a', c2: '#5aa04a', face: '#201820', blocky: true },
    { key: 'magma_cube', en: 'Magma Cube', zh: '岩浆怪', type: 'hostile', body: [0.7, 0.7, 0.7], head: [0.4, 0.3, 0.3], headY: 0.62, legs: 0, col: '#7a2a10', c2: '#e06020', face: '#f0e0a0', blocky: true },
    { key: 'witch', en: 'Witch', zh: '女巫', type: 'hostile', body: [0.4, 0.7, 0.32], head: [0.42, 0.42, 0.4], headY: 0.85, legs: 2, col: '#4a2a5a', c2: '#2a1a3a', face: '#8a6a4a', tall: true, hat: true },
    { key: 'pillager', en: 'Pillager', zh: '掠夺者', type: 'hostile', body: [0.42, 0.72, 0.3], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#6a6a72', c2: '#4a4a52', face: '#8a6a4a', tall: true },
    { key: 'vindicator', en: 'Vindicator', zh: '卫道士', type: 'hostile', body: [0.42, 0.72, 0.3], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#5a5a62', c2: '#3a3a42', face: '#8a6a4a', tall: true },
    { key: 'evoker', en: 'Evoker', zh: '唤魔者', type: 'hostile', body: [0.42, 0.72, 0.3], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#8a8a92', c2: '#e8d040', face: '#8a6a4a', tall: true },
    { key: 'ravager', en: 'Ravager', zh: '劫掠兽', type: 'hostile', body: [0.85, 0.85, 1.4], head: [0.65, 0.6, 0.6], headY: 0.9, legs: 4, col: '#4a4a52', c2: '#2a2a32', face: '#e02020', horns: true },
    { key: 'hoglin', en: 'Hoglin', zh: '疣猪兽', type: 'hostile', body: [0.7, 0.75, 1.2], head: [0.55, 0.5, 0.55], headY: 0.85, legs: 4, col: '#c07a5a', c2: '#8a4a3a', face: '#e02020', horns: true },
    { key: 'zoglin', en: 'Zoglin', zh: '僵尸疣猪兽', type: 'hostile', body: [0.7, 0.75, 1.2], head: [0.55, 0.5, 0.55], headY: 0.85, legs: 4, col: '#c89a8a', c2: '#8a6a5a', face: '#e02020', horns: true },
    { key: 'piglin', en: 'Piglin', zh: '猪灵', type: 'neutral', body: [0.42, 0.72, 0.3], head: [0.42, 0.42, 0.4], headY: 0.9, legs: 2, col: '#e8a878', c2: '#c07850', face: '#201820', tall: true, snout: true },
    { key: 'piglin_brute', en: 'Piglin Brute', zh: '猪灵蛮兵', type: 'hostile', body: [0.46, 0.76, 0.34], head: [0.44, 0.44, 0.42], headY: 0.92, legs: 2, col: '#d89868', c2: '#a06040', face: '#201820', tall: true, snout: true },
    { key: 'zombified_piglin', en: 'Zombified Piglin', zh: '僵尸猪灵', type: 'neutral', body: [0.42, 0.72, 0.3], head: [0.42, 0.42, 0.4], headY: 0.9, legs: 2, col: '#6a9a6a', c2: '#e8a878', face: '#201820', tall: true, snout: true },
    { key: 'blaze', en: 'Blaze', zh: '烈焰人', type: 'hostile', body: [0.42, 0.6, 0.42], head: [0.36, 0.36, 0.36], headY: 0.85, legs: 0, col: '#e0b020', c2: '#f0e060', face: '#201820', fly: true },
    { key: 'ghast', en: 'Ghast', zh: '恶魂', type: 'hostile', body: [1.2, 1.2, 1.2], head: [0.7, 0.6, 0.6], headY: 0.85, legs: 0, col: '#e8e0e0', c2: '#c8c0c0', face: '#c02020', fly: true, tentacles: true },
    { key: 'warden', en: 'Warden', zh: '监守者', type: 'hostile', body: [0.7, 1.6, 0.5], head: [0.5, 0.45, 0.5], headY: 1.9, legs: 2, col: '#1a3a3c', c2: '#2a6a6a', face: '#40e0d0', tall: true, horns: true },
    { key: 'shulker', en: 'Shulker', zh: '潜影贝', type: 'hostile', body: [0.6, 0.6, 0.6], head: [0.5, 0.3, 0.5], headY: 0.5, legs: 0, col: '#8a4a8a', c2: '#6a2a6a', face: '#f0e0a0', blocky: true },
    { key: 'silverfish', en: 'Silverfish', zh: '蠹虫', type: 'hostile', body: [0.3, 0.2, 0.35], head: [0.2, 0.18, 0.18], headY: 0.2, legs: 6, col: '#8a8a92', c2: '#6a6a72', face: '#201820' },
    { key: 'endermite', en: 'Endermite', zh: '末影螨', type: 'hostile', body: [0.26, 0.18, 0.3], head: [0.18, 0.16, 0.16], headY: 0.18, legs: 6, col: '#4a2a5a', c2: '#2a1a3a', face: '#e040e0' },
    { key: 'vex', en: 'Vex', zh: '恼鬼', type: 'hostile', body: [0.26, 0.3, 0.26], head: [0.24, 0.22, 0.22], headY: 0.5, legs: 0, col: '#8890a8', c2: '#c0c8d8', face: '#e04040', fly: true, wings: true },
    { key: 'phantom', en: 'Phantom', zh: '幻翼', type: 'hostile', body: [0.5, 0.22, 0.7], head: [0.34, 0.3, 0.3], headY: 0.3, legs: 0, col: '#2a3a5a', c2: '#4a6a8a', face: '#40e0d0', fly: true, wings: true },
    { key: 'dolphin', en: 'Dolphin', zh: '海豚', type: 'neutral', body: [0.4, 0.35, 1.0], head: [0.32, 0.3, 0.34], headY: 0.3, legs: 0, col: '#8aa8c0', c2: '#c8d8e8', face: '#201820', water: true },
    { key: 'turtle_egg', en: 'Turtle Egg', zh: '海龟蛋', type: 'passive', body: [0.3, 0.2, 0.3], head: [0.1, 0.08, 0.1], headY: 0.1, legs: 0, col: '#e8e0c0', c2: '#d8d0b0', face: '#201820', static: true },
    { key: 'mule', en: 'Mule', zh: '骡', type: 'passive', body: [0.5, 0.58, 1.2], head: [0.36, 0.36, 0.46], headY: 0.92, legs: 4, col: '#8a7a68', c2: '#5a4a3a', face: '#201820', tall: true, ears: true },
    { key: 'trader_llama', en: 'Trader Llama', zh: '行商羊驼', type: 'passive', body: [0.5, 0.55, 1.0], head: [0.34, 0.34, 0.5], headY: 1.05, legs: 4, col: '#a89268', c2: '#e8dcc8', face: '#201820', tall: true, neck: true },
    { key: 'camel', en: 'Camel', zh: '骆驼', type: 'passive', body: [0.7, 0.6, 1.3], head: [0.42, 0.42, 0.5], headY: 1.3, legs: 4, col: '#d8b878', c2: '#b09050', face: '#201820', tall: true, neck: true },
    { key: 'sniffer', en: 'Sniffer', zh: '嗅探兽', type: 'passive', body: [1.0, 0.8, 1.6], head: [0.55, 0.45, 0.7], headY: 0.9, legs: 4, col: '#8a5a4a', c2: '#6a3a2a', face: '#201820', horns: true },
    { key: 'armadillo', en: 'Armadillo', zh: '犰狳', type: 'passive', body: [0.5, 0.4, 0.7], head: [0.32, 0.28, 0.3], headY: 0.4, legs: 4, col: '#a89070', c2: '#7a6450', face: '#201820', ears: true },
    { key: 'tadpole', en: 'Tadpole', zh: '蝌蚪', type: 'passive', body: [0.2, 0.2, 0.3], head: [0.2, 0.18, 0.18], headY: 0.18, legs: 0, col: '#4a6a3a', c2: '#3a5a2a', face: '#201820', water: true },
    { key: 'cod', en: 'Cod', zh: '鳕鱼', type: 'passive', body: [0.24, 0.3, 0.5], head: [0.2, 0.22, 0.2], headY: 0.3, legs: 0, col: '#b8a878', c2: '#8a7a50', face: '#201820', water: true },
    { key: 'salmon', en: 'Salmon', zh: '鲑鱼', type: 'passive', body: [0.26, 0.32, 0.55], head: [0.22, 0.24, 0.22], headY: 0.32, legs: 0, col: '#c05a4a', c2: '#8a3a2a', face: '#201820', water: true },
    { key: 'tropical_fish', en: 'Tropical Fish', zh: '热带鱼', type: 'passive', body: [0.22, 0.3, 0.4], head: [0.18, 0.2, 0.18], headY: 0.3, legs: 0, col: '#e8a020', c2: '#2a8ac8', face: '#201820', water: true },
    { key: 'pufferfish', en: 'Pufferfish', zh: '河豚', type: 'neutral', body: [0.3, 0.34, 0.34], head: [0.24, 0.26, 0.24], headY: 0.34, legs: 0, col: '#e8c840', c2: '#c8a020', face: '#201820', water: true },
    { key: 'squid', en: 'Squid', zh: '鱿鱼', type: 'passive', body: [0.4, 0.5, 0.4], head: [0.36, 0.3, 0.36], headY: 0.55, legs: 0, col: '#3a4a6a', c2: '#2a3a5a', face: '#201820', water: true },
    { key: 'glow_squid', en: 'Glow Squid', zh: '发光鱿鱼', type: 'passive', body: [0.4, 0.5, 0.4], head: [0.36, 0.3, 0.36], headY: 0.55, legs: 0, col: '#2a6a8a', c2: '#4ae0e0', face: '#a0f0f0', water: true },
    { key: 'guardian', en: 'Guardian', zh: '守卫者', type: 'hostile', body: [0.6, 0.5, 0.6], head: [0.45, 0.4, 0.45], headY: 0.55, legs: 0, col: '#4a8a8a', c2: '#2a6a6a', face: '#e07030', water: true },
    { key: 'elder_guardian', en: 'Elder Guardian', zh: '远古守卫者', type: 'hostile', body: [1.0, 0.85, 1.0], head: [0.7, 0.6, 0.7], headY: 0.9, legs: 0, col: '#8aa8a8', c2: '#6a8888', face: '#e07030', water: true },
    { key: 'strider', en: 'Strider', zh: '炽足兽', type: 'passive', body: [0.6, 0.5, 1.0], head: [0.4, 0.4, 0.4], headY: 0.7, legs: 4, col: '#a03a5a', c2: '#6a1a3a', face: '#f0e0a0' },
    { key: 'zombie_horse', en: 'Zombie Horse', zh: '僵尸马', type: 'passive', body: [0.55, 0.6, 1.3], head: [0.4, 0.4, 0.5], headY: 0.95, legs: 4, col: '#5a7a4a', c2: '#3a5a2a', face: '#101010', tall: true },
    { key: 'skeleton_horse', en: 'Skeleton Horse', zh: '骷髅马', type: 'passive', body: [0.55, 0.6, 1.3], head: [0.4, 0.4, 0.5], headY: 0.95, legs: 4, col: '#d8d8d0', c2: '#b0b0a8', face: '#101010', tall: true },
    { key: 'drowned', en: 'Drowned', zh: '溺尸', type: 'hostile', body: [0.42, 0.72, 0.28], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#4a8a7a', c2: '#2a6a5a', face: '#40e0d0', tall: true, water: true },
    { key: 'husk', en: 'Husk', zh: '尸壳', type: 'hostile', body: [0.42, 0.72, 0.28], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#b09a6a', c2: '#8a7a4a', face: '#101010', tall: true },
    { key: 'stray', en: 'Stray', zh: '流浪者', type: 'hostile', body: [0.36, 0.72, 0.24], head: [0.38, 0.38, 0.36], headY: 0.9, legs: 2, col: '#c8d8e8', c2: '#a8b8c8', face: '#40a0e0', tall: true },
    { key: 'bogged', en: 'Bogged', zh: '沼骸', type: 'hostile', body: [0.36, 0.72, 0.24], head: [0.38, 0.38, 0.36], headY: 0.9, legs: 2, col: '#a8b090', c2: '#7a8a60', face: '#60c040', tall: true },
    { key: 'breeze', en: 'Breeze', zh: '旋风人', type: 'hostile', body: [0.4, 0.55, 0.4], head: [0.34, 0.34, 0.34], headY: 0.8, legs: 0, col: '#c8c8e8', c2: '#a0a0d0', face: '#4020a0', fly: true },
    { key: 'creaking', en: 'Creaking', zh: '嘎枝', type: 'hostile', body: [0.4, 1.2, 0.3], head: [0.42, 0.42, 0.42], headY: 1.45, legs: 2, col: '#3a2a22', c2: '#e08a20', face: '#e08a20', tall: true },
    { key: 'happy_ghast', en: 'Happy Ghast', zh: '欢乐恶魂', type: 'passive', body: [1.2, 1.2, 1.2], head: [0.7, 0.6, 0.6], headY: 0.85, legs: 0, col: '#f0e8e0', c2: '#e0d0c8', face: '#40a0e0', fly: true, tentacles: true },
    { key: 'illusioner', en: 'Illusioner', zh: '幻术师', type: 'hostile', body: [0.42, 0.72, 0.3], head: [0.4, 0.4, 0.4], headY: 0.9, legs: 2, col: '#3a4a8a', c2: '#2a3a6a', face: '#8a6a4a', tall: true, hat: true },
    { key: 'wither', en: 'Wither', zh: '凋灵', type: 'hostile', body: [0.9, 0.9, 0.9], head: [0.55, 0.5, 0.5], headY: 1.1, legs: 0, col: '#3a3a42', c2: '#202028', face: '#c04040', fly: true },
    { key: 'ender_dragon', en: 'Ender Dragon', zh: '末影龙', type: 'hostile', body: [1.4, 0.9, 2.2], head: [0.7, 0.6, 0.8], headY: 1.2, legs: 0, col: '#1a1a22', c2: '#3a2a4a', face: '#c060e0', fly: true, wings: true }
  ];

  var byKey = {};
  MOBS.forEach(function (m) { byKey[m.key] = m; });

  /* ------------------------------------------------------- 皮肤画布 */
  function skinCanvas(mob, face) {
    var cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    var ctx = cv.getContext('2d');
    var base = mob.col, c2 = mob.c2;
    var rnd = (function (s) { return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(mob.key.length * 977 + (face ? 7 : 0));
    ctx.fillStyle = base; ctx.fillRect(0, 0, 16, 16);
    for (var i = 0; i < 40; i++) {
      var x = (rnd() * 16) | 0, y = (rnd() * 16) | 0;
      ctx.fillStyle = rnd() > 0.5 ? c2 : 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y, 1 + ((rnd() * 2) | 0), 1);
    }
    if (face) {
      // 眼睛
      ctx.fillStyle = mob.face || '#101010';
      ctx.fillRect(3, 6, 3, 3); ctx.fillRect(10, 6, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(4, 7, 1, 1); ctx.fillRect(11, 7, 1, 1);
      if (mob.snout) { ctx.fillStyle = mob.c2; ctx.fillRect(6, 11, 4, 3); ctx.fillStyle = '#201010'; ctx.fillRect(7, 12, 1, 1); ctx.fillRect(9, 12, 1, 1); }
      else if (mob.beak) { ctx.fillStyle = '#e8a020'; ctx.fillRect(6, 10, 4, 3); }
      else if (mob.nose) { ctx.fillStyle = mob.face; ctx.fillRect(7, 10, 2, 3); }
      else { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(6, 10, 4, 1); }
    }
    return cv;
  }

  /* ------------------------------------------------------- 建模 */
  function makeMat(THREE, canvas) {
    var tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  function buildMob(THREE, mob) {
    var g = new THREE.Group();
    var bodyMat = makeMat(THREE, skinCanvas(mob, false));
    var faceMat = makeMat(THREE, skinCanvas(mob, true));
    var b = mob.body, hd = mob.head;
    var bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(b[0], b[1], b[2]), bodyMat);
    bodyMesh.position.y = b[1] / 2 + 0.02;
    g.add(bodyMesh);

    var headMesh = new THREE.Mesh(new THREE.BoxGeometry(hd[0], hd[1], hd[2]),
      [bodyMat, bodyMat, bodyMat, bodyMat, faceMat, bodyMat]);
    headMesh.position.set(0, mob.headY || (b[1] + hd[1] / 2), b[2] / 2 + hd[2] / 2 - 0.05);
    g.add(headMesh);

    var legW = Math.max(0.1, b[0] * 0.22), legH = mob.legs >= 4 ? (b[1] * 0.55) : Math.max(0.3, mob.headY * 0.5);
    var legs = [];
    if (mob.legs) {
      var positions = [];
      if (mob.legs === 2) positions = [[-b[0] / 2 + legW, -b[2] / 2 + legW], [b[0] / 2 - legW, -b[2] / 2 + legW]];
      else if (mob.legs === 4) positions = [[-b[0] / 2 + legW, -b[2] / 2 + legW * 2], [b[0] / 2 - legW, -b[2] / 2 + legW * 2], [-b[0] / 2 + legW, b[2] / 2 - legW * 2], [b[0] / 2 - legW, b[2] / 2 - legW * 2]];
      else {
        for (var i = 0; i < mob.legs; i++) {
          var side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
          positions.push([side * (b[0] / 2), -b[2] / 2 + row * (b[2] / Math.ceil(mob.legs / 2))]);
        }
      }
      positions.forEach(function (p) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legW), bodyMat);
        leg.position.set(p[0], legH / 2, p[1]);
        leg.userData.legPhase = Math.random() * 6.28;
        g.add(leg); legs.push(leg);
      });
      bodyMesh.position.y = legH + b[1] / 2;
      headMesh.position.y = legH + (mob.headY || b[1] / 2);
      legH = legH;
    }

    if (mob.ears) {
      [-1, 1].forEach(function (s) {
        var ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.06), bodyMat);
        ear.position.set(s * hd[0] * 0.28, headMesh.position.y + hd[1] * 0.6, headMesh.position.z);
        g.add(ear);
      });
    }
    if (mob.horns) {
      [-1, 1].forEach(function (s) {
        var horn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
        horn.position.set(s * hd[0] * 0.4, headMesh.position.y + hd[1] * 0.55, headMesh.position.z);
        g.add(horn);
      });
    }
    if (mob.tail) {
      var tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, b[2] * 0.5), bodyMat);
      tail.position.set(0, bodyMesh.position.y, -b[2] / 2 - b[2] * 0.2);
      g.add(tail);
    }
    if (mob.mane) {
      var mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
      mane.position.set(0, headMesh.position.y + hd[1] * 0.2, headMesh.position.z - hd[2] * 0.5);
      g.add(mane);
    }
    if (mob.wings) {
      [-1, 1].forEach(function (s) {
        var wing = new THREE.Mesh(new THREE.BoxGeometry(b[2] * 0.9, 0.04, b[2] * 1.1),
          new THREE.MeshLambertMaterial({ color: 0xf0f8ff, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        wing.position.set(s * b[0] * 0.9, bodyMesh.position.y + 0.1, 0);
        wing.rotation.z = s * 0.25;
        g.add(wing);
      });
    }
    if (mob.hat) {
      var hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.45, 6), new THREE.MeshLambertMaterial({ color: 0x2a1a3a }));
      hat.position.set(0, headMesh.position.y + hd[1] * 0.85, headMesh.position.z);
      g.add(hat);
    }

    g.userData = { mob: mob, legs: legs, body: bodyMesh, head: headMesh, legH: legH };
    return g;
  }

  /* ------------------------------------------------------- AI */
  function MobMgr(THREE, scene, world) {
    this.THREE = THREE; this.scene = scene; this.world = world;
    this.list = [];
    this.tmp = new THREE.Vector3();
  }

  MobMgr.prototype.spawn = function (mobKey, x, y, z) {
    var def = byKey[mobKey];
    if (!def) return null;
    var g = buildMob(this.THREE, def);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(g);
    var m = {
      def: def, obj: g, vx: 0, vy: 0, vz: 0,
      target: null, timer: Math.random() * 3,
      hp: 6, phase: Math.random() * 6.28, baseY: y
    };
    this.list.push(m);
    return m;
  };

  MobMgr.prototype.spawnAround = function (playerPos, count) {
    var keys = MOBS.filter(function (m) { return m.type !== 'hostile'; }).map(function (m) { return m.key; });
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 22;
      var x = Math.floor(playerPos.x + Math.cos(a) * d), z = Math.floor(playerPos.z + Math.sin(a) * d);
      var h = this.world.heightAt(x, z);
      if (h <= root.MC_WORLD.SEA + 1) continue;
      var k = keys[(Math.random() * keys.length) | 0];
      this.spawn(k, x + 0.5, h + 1, z + 0.5);
    }
  };

  MobMgr.prototype.update = function (dt, playerPos) {
    var W = this.world;
    for (var i = 0; i < this.list.length; i++) {
      var m = this.list[i], g = m.obj, d = m.def;
      m.timer -= dt;
      if (m.timer <= 0) {
        m.timer = 2 + Math.random() * 4;
        if (Math.random() < 0.55) {
          var a = Math.random() * Math.PI * 2;
          m.tx = Math.cos(a); m.tz = Math.sin(a);
        } else { m.tx = 0; m.tz = 0; }
      }
      var speed = d.type === 'hostile' ? 1.3 : 1.0;
      var dx = (m.tx || 0) * speed * dt, dz = (m.tz || 0) * speed * dt;
      var nx = g.position.x + dx, nz = g.position.z + dz;
      var feetY = Math.floor(g.position.y + 0.05);
      var ground = W.isSolid(Math.floor(nx), feetY - 1, Math.floor(nz));
      var blocked = W.isSolid(Math.floor(nx), feetY, Math.floor(nz)) || W.isSolid(Math.floor(nx), feetY + 1, Math.floor(nz));
      if (ground && !blocked) {
        g.position.x = nx; g.position.z = nz;
      } else if (!ground && !d.fly) {
        // 尝试上台阶
        if (W.isSolid(Math.floor(nx), feetY, Math.floor(nz)) && !W.isSolid(Math.floor(nx), feetY + 1, Math.floor(nz))) {
          g.position.y = feetY + 1;
          g.position.x = nx; g.position.z = nz;
        } else { m.tx = -(m.tx || 0); m.tz = -(m.tz || 0); }
      } else if (d.fly) {
        g.position.x = nx; g.position.z = nz;
      }
      // 重力
      if (!d.fly && !d.water) {
        var below = W.isSolid(Math.floor(g.position.x), Math.floor(g.position.y - 0.12), Math.floor(g.position.z));
        if (!below) {
          m.vy -= 18 * dt;
          g.position.y += m.vy * dt;
          var hitY = W.isSolid(Math.floor(g.position.x), Math.floor(g.position.y), Math.floor(g.position.z));
          if (hitY) {
            g.position.y = Math.floor(g.position.y) + 1;
            m.vy = 0;
          }
        } else { m.vy = 0; g.position.y = Math.floor(g.position.y) + (0.0); }
      } else if (d.fly) {
        g.position.y = m.baseY + Math.sin(performance.now() / 700 + m.phase) * 1.2;
      }
      // 朝向
      if (Math.abs(dx) + Math.abs(dz) > 0.0005) {
        var ang = Math.atan2(dx, dz);
        var diff = ((ang - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        g.rotation.y += diff * Math.min(1, dt * 8);
      }
      // 腿部摆动
      var walking = Math.abs(dx) + Math.abs(dz) > 0.0005;
      m.phase += dt * (walking ? 9 : 1.5);
      var ud = g.userData;
      if (ud.legs) {
        for (var li = 0; li < ud.legs.length; li++) {
          ud.legs[li].rotation.x = walking ? Math.sin(m.phase + li * Math.PI / 2) * 0.5 : 0;
        }
      }
      if (ud.head) ud.head.rotation.x = Math.sin(m.phase * 0.3) * 0.08;
    }
  };

  MobMgr.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) this.scene.remove(this.list[i].obj);
    this.list = [];
  };

  root.MC_MOBS = { MOBS: MOBS, byKey: byKey, MobMgr: MobMgr, buildMob: buildMob, skinCanvas: skinCanvas };
})(window);
