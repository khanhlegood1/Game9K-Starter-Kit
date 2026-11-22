/**
 * config.js
 * Core species, Catmull-Rom Sanctuary tracks, lighting themes, and
 * TikTok Gift / YouTube SuperChat power-up definitions for Jurassic Sanctuary Sprint.
 */

export const SPECIES = [
  {
    id: 0,
    code: "1",
    name: "Crocodilia",
    fullName: "Crocodilia Apex",
    emoji: "🐊",
    color: "#f59e0b",
    accent: "#fde68a",
    badgeBg: "rgba(245, 158, 11, 0.22)",
    trait: "Chúa Tể Đầm Lầy (Miễn giảm tốc nước)",
    maxSpeed: 372,
    accel: 298,
    turnSpeed: 2.88,
    swampPenalty: 1.0, // Immune to swamp slowdown!
    maxBoost: 105,
    clutchBonus: 1.02,
  },
  {
    id: 1,
    code: "2",
    name: "Carnotaurus",
    fullName: "Carnotaurus Coastal",
    emoji: "🦖",
    color: "#10b981",
    accent: "#6ee7b7",
    badgeBg: "rgba(16, 185, 129, 0.22)",
    trait: "Sát Thủ Tốc Độ (Nước rút đường trường)",
    maxSpeed: 392,
    accel: 332,
    turnSpeed: 3.18,
    swampPenalty: 0.74,
    maxBoost: 95,
    clutchBonus: 1.0,
  },
  {
    id: 2,
    code: "3",
    name: "Triceratops",
    fullName: "Triceratops Titan",
    emoji: "🦕",
    color: "#14b8a6",
    accent: "#5eead4",
    badgeBg: "rgba(20, 184, 166, 0.22)",
    trait: "Thiết Giáp 3 Sừng (Bình Nộ Khí khổng lồ)",
    maxSpeed: 360,
    accel: 286,
    turnSpeed: 3.32,
    swampPenalty: 0.82,
    maxBoost: 140,
    clutchBonus: 1.03,
  },
  {
    id: 3,
    code: "4",
    name: "Baryonyx",
    fullName: "Baryonyx Claw",
    emoji: "🦎",
    color: "#f43f5e",
    accent: "#fda4af",
    badgeBg: "rgba(244, 63, 94, 0.22)",
    trait: " Vuốt Săn Đêm (Bứt phá vòng cuối)",
    maxSpeed: 378,
    accel: 314,
    turnSpeed: 3.02,
    swampPenalty: 0.91,
    maxBoost: 110,
    clutchBonus: 1.08, // Extra surge on final lap!
  },
];

export const MAPS = [
  {
    id: "crocodilia-coast",
    name: "🏝️ Bờ Biển Crocodilia",
    trackWidth: 170,
    laps: 3,
    waypoints: [
      { x: 0, y: -520 },
      { x: 520, y: -500 },
      { x: 860, y: -240 },
      { x: 820, y: 180 },
      { x: 460, y: 460 },
      { x: 40, y: 340 },
      { x: -340, y: 520 },
      { x: -780, y: 340 },
      { x: -860, y: -120 },
      { x: -520, y: -480 },
    ],
    swamps: [
      { x: 640, y: 320, r: 155, label: "Đầm Ngập Mặn" },
      { x: -620, y: 410, r: 142, label: "Bãi Bùn Tây" },
      { x: -790, y: -60, r: 135, label: "Vịnh Cá Sấu" },
    ],
    props: [
      { type: "nest", x: 110, y: 190 },
      { type: "nest", x: -120, y: 240 },
      { type: "watchtower", x: -160, y: -360 },
      { type: "watchtower", x: 580, y: -310 },
    ],
  },
  {
    id: "amber-volcano",
    name: "🌋 Hẻm Núi Hổ Phách",
    trackWidth: 162,
    laps: 3,
    waypoints: [
      { x: 0, y: -560 },
      { x: 620, y: -460 },
      { x: 920, y: -60 },
      { x: 620, y: 260 },
      { x: 840, y: 540 },
      { x: 180, y: 580 },
      { x: -140, y: 220 },
      { x: -580, y: 520 },
      { x: -880, y: 80 },
      { x: -560, y: -440 },
    ],
    swamps: [
      { x: 620, y: 260, r: 138, label: "Hồ Nhựa Hổ Phách" },
      { x: -580, y: 520, r: 145, label: "Suối Khoáng Nóng" },
    ],
    props: [
      { type: "nest", x: 180, y: 410 },
      { type: "nest", x: -340, y: -180 },
      { type: "watchtower", x: 320, y: -260 },
      { type: "watchtower", x: -640, y: -120 },
    ],
  },
  {
    id: "biolum-lagoon",
    name: "🌌 Đầm Lầy Phát Quang",
    trackWidth: 176,
    laps: 3,
    waypoints: [
      { x: 0, y: -480 },
      { x: 700, y: -420 },
      { x: 940, y: 60 },
      { x: 560, y: 490 },
      { x: 0, y: 420 },
      { x: -560, y: 490 },
      { x: -940, y: 60 },
      { x: -700, y: -420 },
    ],
    swamps: [
      { x: 760, y: 260, r: 165, label: "Đầm Neon Đông" },
      { x: -760, y: 260, r: 165, label: "Đầm Neon Tây" },
      { x: 0, y: 440, r: 130, label: "Vực San Hô Cổ" },
    ],
    props: [
      { type: "nest", x: 280, y: 120 },
      { type: "nest", x: -280, y: 120 },
      { type: "watchtower", x: 0, y: -220 },
    ],
  },
];

export const LIGHTING_MODES = [
  {
    id: "sunset",
    name: "🌅 Hoàng hôn",
    bg: "#0d1a14",
    road: "#3f3226",
    border: "#b45309",
    swampInner: "rgba(13, 148, 136, 0.58)",
    swampOuter: "rgba(15, 118, 110, 0.34)",
    tint: "rgba(245, 158, 11, 0.08)",
  },
  {
    id: "day",
    name: "☀️ Ban ngày",
    bg: "#10281e",
    road: "#4c3e31",
    border: "#10b981",
    swampInner: "rgba(14, 165, 233, 0.52)",
    swampOuter: "rgba(2, 132, 199, 0.28)",
    tint: "rgba(16, 185, 129, 0.03)",
  },
  {
    id: "night",
    name: "🌙 Đêm phát quang",
    bg: "#050b14",
    road: "#1e293b",
    border: "#38bdf8",
    swampInner: "rgba(34, 211, 238, 0.55)",
    swampOuter: "rgba(168, 85, 247, 0.28)",
    tint: "rgba(14, 165, 233, 0.11)",
  },
];

export const POWERUP_TIERS = {
  rose: {
    id: "rose",
    icon: "🌹",
    label: "Hoa Hồng / $0.50",
    coins: 1,
    color: "#f472b6",
    desc: "+45 Nộ Khí & Bứt tốc 2s",
  },
  meat: {
    id: "meat",
    icon: "🥩",
    label: "Đùi Thịt / $1",
    coins: 5,
    color: "#fbbf24",
    desc: "Đầy Nộ Khí + Gầm Nitro 3s",
  },
  banana: {
    id: "banana",
    icon: "🍌",
    label: "Bẫy Bùn / $2",
    coins: 10,
    color: "#facc15",
    desc: "Thả bẫy trượt trước mặt Top 1",
  },
  meteor: {
    id: "meteor",
    icon: "☄️",
    label: "Thiên Thạch / $5",
    coins: 20,
    color: "#c084fc",
    desc: "Khóa mục tiêu & làm choáng Top 1",
  },
  crown: {
    id: "crown",
    icon: "👑",
    label: "Vương Miện / $20",
    coins: 99,
    color: "#fde047",
    desc: "Hào Quang Vua 4.5s + Mưa Dê Vàng",
  },
};

/**
 * Interpolate closed-loop Catmull-Rom spline waypoints into dense smooth track points.
 * @param {Array<{x: number, y: number}>} waypoints
 * @param {number} [subdivisions=28]
 * @returns {Array<{x: number, y: number}>}
 */
export function buildCatmullRomTrack(waypoints, subdivisions = 28) {
  const pts = [];
  const n = waypoints.length;
  for (let i = 0; i < n; i++) {
    const p0 = waypoints[(i - 1 + n) % n];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % n];
    const p3 = waypoints[(i + 2) % n];

    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      pts.push({ x, y });
    }
  }
  return pts;
}
